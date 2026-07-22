// [ADDED]
// Temporary filesystem utilities keep the validation CSV outside
// the repository.
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';

import os from 'node:os';
import path from 'node:path';

// [ADDED]
// pg-promise is used independently after SqlExecutor runs so the
// validation can confirm the table was actually created.
import pgPromise from 'pg-promise';

import {
  databaseContexts,
} from '../src/config/databaseContexts.js';

import {
  analyzeCsv,
} from '../src/index.js';

import {
  SqlExecutor,
} from '../src/lib/SqlExecutor.js';

import {
  buildServerConnectionConfig,
} from '../src/lib/utilities.js';

// [ADDED]
// Small assertion helper that reports the exact failed condition.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// [ADDED]
// Create a unique table name so the validation does not collide with
// an existing database table or another validation run.
const validationTableName =
  `csvreader_pg_validation_` +
  `${process.pid}_${Date.now()}`;

const temporaryDirectory = await mkdtemp(
  path.join(
    os.tmpdir(),
    'csvreader-postgres-validation-',
  ),
);

const csvFilePath = path.join(
  temporaryDirectory,
  'postgres-executor-sample.csv',
);

// [ADDED]
// These variables remain available to the finally block so database
// and filesystem cleanup runs after both success and failure.
let sqlExecutor = null;
let pgp = null;
let database = null;
let tableCreated = false;

try {
  // [ADDED]
  // Exercise integer, decimal, boolean, timezone-aware datetime,
  // and string generation.
  const csv = [
    'id,amount,active,created_at,description',
    '1,12.50,true,2026-07-21T12:00:00Z,Alpha',
    '2,7.25,false,2026-07-22T13:30:00Z,Beta',
  ].join('\n');

  await writeFile(
    csvFilePath,
    csv,
    'utf8',
  );

  // [ADDED]
  // Select the actual postgres context defined in:
  //
  //   src/config/databaseContexts.js
  //
  // This validates the PostgreSQL values loaded from .env.
  sqlExecutor = new SqlExecutor()
    .setContext('postgres');

  assert(
    sqlExecutor.getDialect() === 'postgres',
    'The postgres context returned the wrong dialect.',
  );

  // [ADDED]
  // Generate SQL using the dialect selected by the database context.
  const result = await analyzeCsv(
    csvFilePath,
    {
      dialect: sqlExecutor.getDialect(),
      tableName: validationTableName,
      inferNotNull: true,
    },
  );

  assert(
    typeof result.sql === 'string' &&
      result.sql.trim().length > 0,
    'PostgreSQL SQL was not generated.',
  );

  // [ADDED]
  // Execute the generated CREATE TABLE statement through SqlExecutor.
  const execution = await sqlExecutor.execute(
    result.sql,
  );

  tableCreated = true;

  assert(
    execution.contextName === 'postgres',
    'Execution returned the wrong context name.',
  );

  assert(
    execution.dialect === 'postgres',
    'Execution returned the wrong dialect.',
  );

  // [ADDED]
  // Build the same normalized PostgreSQL connection configuration
  // used by SqlExecutor.
  const postgresContext =
    databaseContexts.postgres;

  const connectionConfig =
    buildServerConnectionConfig(
      'postgres',
      postgresContext.connection,
    );

  // [ADDED]
  // Open an independent PostgreSQL connection for verification.
  pgp = pgPromise();
  database = pgp(connectionConfig);

  // [ADDED]
  // Confirm the table exists in the active PostgreSQL schema.
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

  // [ADDED]
  // Read the generated column definitions from PostgreSQL metadata.
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

  // [ADDED]
  // Validate the PostgreSQL-specific datatype mappings.
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

  // [ADDED]
  // inferNotNull: true should produce NOT NULL for every populated
  // sample column.
  for (
    const [columnName, definition]
    of Object.entries(columnDefinitions)
  ) {
    assert(
      definition.isNullable === 'NO',
      `Expected "${columnName}" to be NOT NULL.`,
    );
  }

  console.log(
    'PostgreSQL SQL execution passed',
  );
} finally {
  // [ADDED]
  // Close the independent verification pool before using SqlExecutor
  // for table cleanup.
  if (pgp) {
    pgp.end();
  }

  // [ADDED]
  // Remove the temporary validation table even when metadata
  // verification or an assertion fails.
  if (tableCreated && sqlExecutor) {
    const quotedTableName =
      `"${validationTableName.replaceAll('"', '""')}"`;

    await sqlExecutor.execute(
      `DROP TABLE IF EXISTS ${quotedTableName};`,
    );
  }

  // [ADDED]
  // Remove the temporary CSV and directory.
  await rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
}
