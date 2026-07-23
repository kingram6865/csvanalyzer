import path from 'node:path';
import Database from 'better-sqlite3';
import { analyzeCsv } from '../src/index.js';
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

  const execution = await sqlExecutor.execute(result.sql);

  assert(execution.contextName === 'localValidation', 'Execution returned the wrong context name.');
  assert(execution.dialect === 'sqlite', 'Execution returned the wrong dialect.');

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

    for (
      const [columnName, definition]
      of Object.entries(columnDefinitions)
    ) {
      assert(
        definition.notNull === 1,
        `Expected "${columnName}" to be NOT NULL.`,
      );
    }
  } finally {
    database.close();
  }

  console.log(
    'SQLite SQL execution passed',
  );
} finally {
  await removeValidationDirectory(temporaryDirectory);
}
