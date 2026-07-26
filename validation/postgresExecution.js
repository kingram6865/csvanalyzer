import pgPromise from 'pg-promise';
import { databaseContexts } from '../src/config/databaseContexts.js';
import { analyzeCsv } from '../src/index.js';
import { CsvDataInserter } from '../src/lib/CsvDataInserter.js';
import { SqlExecutor } from '../src/lib/SqlExecutor.js';
import { buildServerConnectionConfig } from '../src/lib/utilities.js';
import {
  assert,
  createCsvValidationFixture,
  createValidationTableName,
  removeValidationDirectory,
} from './utilities.js';

const validationTableName = createValidationTableName('csvreader_pg_validation');

const {
  temporaryDirectory,
  csvFilePath,
} = await createCsvValidationFixture({
  directoryPrefix:
    'csvreader-postgres-validation-',
  fileName:
    'postgres-executor-sample.csv',
});

let sqlExecutor = null;
let pgp = null;
let database = null;
let tableCreated = false;

try {
  sqlExecutor = new SqlExecutor().setContext('postgres');

  assert(
    sqlExecutor.getDialect() === 'postgres',
    'The postgres context returned the wrong dialect.',
  );

  const result = await analyzeCsv(csvFilePath, {
      dialect: sqlExecutor.getDialect(),
      tableName: validationTableName,
      inferNotNull: true,
    },
  );

  assert(typeof result.sql === 'string' && result.sql.trim().length > 0, 'PostgreSQL SQL was not generated.');

  assert(
    typeof result.insertSql === 'string' && result.insertSql.trim().length > 0,
    'PostgreSQL insert SQL was not generated.',
  );


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

  tableCreated = true;

  assert(execution.contextName === 'postgres', 'Execution returned the wrong context name.');
  assert(execution.dialect === 'postgres', 'Execution returned the wrong dialect.');

  assert(execution.rowsRead === 2, `Expected 2 CSV rows to be read, received ${execution.rowsRead}.`);
  assert(execution.rowsInserted === 2, `Expected 2 CSV rows to be inserted, received ${execution.rowsInserted}.`);


  const postgresContext = databaseContexts.postgres;
  const connectionConfig = buildServerConnectionConfig('postgres', postgresContext.connection);

  pgp = pgPromise();
  database = pgp(connectionConfig);

  const table = await database.oneOrNone(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = $1
    `,
    [result.tableName],
  );

  assert(
    table?.table_name === result.tableName,
    `PostgreSQL table "${result.tableName}" was not created.`,
  );

  const columns = await database.any(
    `
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [result.tableName],
  );

  const columnDefinitions = Object.fromEntries(
    columns.map((column) => [
      column.column_name,
      {
        dataType: column.data_type,
        isNullable: column.is_nullable,
      },
    ]),
  );

  assert(
    columnDefinitions.id?.dataType === 'integer',
    `Expected id to be integer, received ` +
      `"${columnDefinitions.id?.dataType}".`,
  );

  assert(
    columnDefinitions.amount?.dataType === 'numeric',
    `Expected amount to be numeric, received ` +
      `"${columnDefinitions.amount?.dataType}".`,
  );

  assert(
    columnDefinitions.active?.dataType === 'boolean',
    `Expected active to be boolean, received ` +
      `"${columnDefinitions.active?.dataType}".`,
  );

  assert(
    columnDefinitions.created_at?.dataType ===
      'timestamp with time zone',
    `Expected created_at to be timestamp with time zone, ` +
      `received ` +
      `"${columnDefinitions.created_at?.dataType}".`,
  );

  assert(
    columnDefinitions.description?.dataType ===
      'character varying',
    `Expected description to be character varying, received ` +
      `"${columnDefinitions.description?.dataType}".`,
  );

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    assert(definition.isNullable === 'NO', `Expected "${columnName}" to be NOT NULL.`);
  }

  const quotedTableName = `"${result.tableName.replaceAll('"', '""')}"`;
  const insertedRows = await database.any(
    `
      SELECT
        id,
        amount::text AS amount,
        active,
        to_char(
          created_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) AS created_at,
        description
      FROM ${quotedTableName}
      ORDER BY id
    `,
  );

  const expectedRows = [
    {
      id: 1,
      amount: '12.50',
      active: true,
      created_at: '2026-07-21T12:00:00Z',
      description: 'Alpha',
    },
    {
      id: 2,
      amount: '7.25',
      active: false,
      created_at: '2026-07-22T13:30:00Z',
      description: 'Beta',
    },
  ];

  assert(
    JSON.stringify(insertedRows) === JSON.stringify(expectedRows),
    `PostgreSQL inserted rows did not match the CSV data.\n` +
      `Expected: ${JSON.stringify(expectedRows)}\n` +
      `Received: ${JSON.stringify(insertedRows)}`,
  );

  console.log('PostgreSQL SQL execution passed');
} finally {
  if (pgp) {
    pgp.end();
  }

  if (tableCreated && sqlExecutor) {
    const quotedTableName = `"${validationTableName.replaceAll('"', '""')}"`;
    await sqlExecutor.execute(`DROP TABLE IF EXISTS ${quotedTableName};`);
  }

  await removeValidationDirectory(temporaryDirectory);
}
