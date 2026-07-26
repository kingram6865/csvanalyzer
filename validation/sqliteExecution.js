import path from 'node:path';
import Database from 'better-sqlite3';
import { analyzeCsv } from '../src/index.js';
import { CsvDataInserter } from '../src/lib/CsvDataInserter.js';
import { SqlExecutor } from '../src/lib/SqlExecutor.js';
import {
  assert,
  createCsvValidationFixture,
  removeValidationDirectory,
} from './utilities.js';

const { temporaryDirectory, csvFilePath } = await createCsvValidationFixture({
  directoryPrefix: 'csvreader-sqlite-validation-',
  fileName: 'executor-sample.csv',
});

const sqliteFilePath = path.join(temporaryDirectory, 'executor-validation.sqlite');

try {
  const result = await analyzeCsv(csvFilePath, {
      dialect: 'sqlite',
      inferNotNull: true,
    },
  );

  assert(
    typeof result.sql === 'string' &&
      result.sql.trim().length > 0,
    'SQLite SQL was not generated.',
  );

  assert(
    typeof result.insertSql === 'string' &&
      result.insertSql.trim().length > 0,
    'SQLite insert SQL was not generated.',
  );

  const contexts = {
    localValidation: {
      dialect: 'sqlite',

      connection: {
        filename: sqliteFilePath,
      },
    },
  };

  const sqlExecutor = new SqlExecutor({contexts,}).setContext('localValidation');

  assert(sqlExecutor.getDialect() === 'sqlite', 'SQLite validation context returned the wrong dialect.');

  const csvDataInserter = new CsvDataInserter();

  const execution = await sqlExecutor.executeImport({
    createTableSql: result.sql,
    insertSql: result.insertSql,
    insertRows: (insertRow) =>
      csvDataInserter.insert(csvFilePath, {
        columns: result.columns,
        insertRow,
        maxRows: Infinity,
      }),
  });

  assert(execution.contextName === 'localValidation', 'Execution returned the wrong context name.');
  assert(execution.dialect === 'sqlite', 'Execution returned the wrong dialect.');

  assert(
    execution.rowsRead === 2,
    `Expected 2 CSV rows to be read, received ` +
      `${execution.rowsRead}.`,
  );

  assert(
    execution.rowsInserted === 2,
    `Expected 2 CSV rows to be inserted, received ` +
      `${execution.rowsInserted}.`,
  );


  const database = new Database( sqliteFilePath, { readonly: true } );

  try {
    const table = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = ?
        `,
      )
      .get(result.tableName);

    assert(
      table?.name === result.tableName,
      `SQLite table "${result.tableName}" was not created.`,
    );

    const columns = database
      .prepare(
        `PRAGMA table_info("${result.tableName}")`,
      )
      .all();

    const columnDefinitions = Object.fromEntries(
      columns.map((column) => [
        column.name,
        {
          type: column.type,
          notNull: column.notnull,
        },
      ]),
    );

    assert(
      columnDefinitions.id?.type === 'INTEGER',
      `Expected id to be INTEGER, received ` +
        `"${columnDefinitions.id?.type}".`,
    );

    assert(
      columnDefinitions.amount?.type?.startsWith('NUMERIC'),
      `Expected amount to use NUMERIC affinity, received ` +
        `"${columnDefinitions.amount?.type}".`,
    );

    assert(
      columnDefinitions.active?.type === 'INTEGER',
      `Expected active to be INTEGER, received ` +
        `"${columnDefinitions.active?.type}".`,
    );

    assert(
      columnDefinitions.created_at?.type === 'TEXT',
      `Expected created_at to be TEXT, received ` +
        `"${columnDefinitions.created_at?.type}".`,
    );

    assert(
      columnDefinitions.description?.type === 'TEXT',
      `Expected description to be TEXT, received ` +
        `"${columnDefinitions.description?.type}".`,
    );

    for (const [columnName, definition] of Object.entries(columnDefinitions)) {
      assert(definition.notNull === 1, `Expected "${columnName}" to be NOT NULL.`);
    }

    const rows = database
      .prepare(
        `
          SELECT
            id,
            amount,
            active,
            created_at,
            description
          FROM "${result.tableName}"
          ORDER BY id
        `,
      )
      .all();

    const expectedRows = [
      {
        id: 1,
        amount: 12.5,
        active: 1,
        created_at: '2026-07-21T12:00:00Z',
        description: 'Alpha',
      },
      {
        id: 2,
        amount: 7.25,
        active: 0,
        created_at: '2026-07-22T13:30:00Z',
        description: 'Beta',
      },
    ];

    assert(
      JSON.stringify(rows) === JSON.stringify(expectedRows),
      `SQLite inserted rows did not match the CSV data.\n` +
        `Expected: ${JSON.stringify(expectedRows)}\n` +
        `Received: ${JSON.stringify(rows)}`,
    );


  } finally {
    database.close();
  }

  console.log(
    'SQLite SQL execution passed',
  );
} finally {
  await removeValidationDirectory(temporaryDirectory);
}
