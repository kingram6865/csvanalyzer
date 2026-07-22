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
// mysql2/promise is used independently after SqlExecutor runs so the
// validation can confirm that the table was actually created.
import mysql from 'mysql2/promise';

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
// Small assertion helper that identifies the exact failed condition.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// [ADDED]
// Generate a unique table name so this validation does not collide
// with an existing table or another validation run.
const validationTableName =
  `csvreader_mysql_validation_` +
  `${process.pid}_${Date.now()}`;

const temporaryDirectory = await mkdtemp(
  path.join(
    os.tmpdir(),
    'csvreader-mysql-validation-',
  ),
);

const csvFilePath = path.join(
  temporaryDirectory,
  'mysql-executor-sample.csv',
);

// [ADDED]
// These variables remain available to the finally block so cleanup
// occurs after both successful and failed validation.
let sqlExecutor = null;
let databaseConnection = null;
let tableCreated = false;

try {
  // [ADDED]
  // Exercise integer, decimal, boolean, timezone-aware datetime,
  // and string SQL generation.
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
  // Select the actual mysql context defined in:
  //
  //   src/config/databaseContexts.js
  //
  // This validates the MySQL values loaded from .env.
  sqlExecutor = new SqlExecutor()
    .setContext('mysql');

  assert(
    sqlExecutor.getDialect() === 'mysql',
    'The mysql context returned the wrong dialect.',
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
    'MySQL SQL was not generated.',
  );

  // [ADDED]
  // Execute the generated CREATE TABLE statement through SqlExecutor.
  const execution = await sqlExecutor.execute(
    result.sql,
  );

  tableCreated = true;

  assert(
    execution.contextName === 'mysql',
    'Execution returned the wrong context name.',
  );

  assert(
    execution.dialect === 'mysql',
    'Execution returned the wrong dialect.',
  );

  // [ADDED]
  // Build the same normalized MySQL connection configuration used
  // by SqlExecutor.
  const mysqlContext =
    databaseContexts.mysql;

  const connectionConfig =
    buildServerConnectionConfig(
      'mysql',
      mysqlContext.connection,
    );

  // [ADDED]
  // Open an independent MySQL connection for verification.
  databaseConnection =
    await mysql.createConnection(
      connectionConfig,
    );

  // [ADDED]
  // Confirm that the expected table exists in the configured database.
  const [tableRows] =
    await databaseConnection.execute(
      `
        SELECT TABLE_NAME AS tableName
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?
      `,
      [result.tableName],
    );

  assert(
    tableRows.length === 1 &&
      tableRows[0].tableName === result.tableName,
    `MySQL table "${result.tableName}" was not created.`,
  );

  // [ADDED]
  // Read the generated column definitions from MySQL metadata.
  const [columnRows] =
    await databaseConnection.execute(
      `
        SELECT
          COLUMN_NAME AS columnName,
          DATA_TYPE AS dataType,
          IS_NULLABLE AS isNullable
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
        ORDER BY ORDINAL_POSITION
      `,
      [result.tableName],
    );

  const columnDefinitions =
    Object.fromEntries(
      columnRows.map((column) => [
        column.columnName,
        {
          dataType: column.dataType,
          isNullable: column.isNullable,
        },
      ]),
    );

  // [ADDED]
  // MySQL reports INTEGER columns through information_schema as int.
  assert(
    columnDefinitions.id?.dataType === 'int',
    `Expected id to be int, received ` +
      `"${columnDefinitions.id?.dataType}".`,
  );

  assert(
    columnDefinitions.amount?.dataType === 'decimal',
    `Expected amount to be decimal, received ` +
      `"${columnDefinitions.amount?.dataType}".`,
  );

  // [ADDED]
  // MySQL BOOLEAN is an alias for TINYINT(1), so information_schema
  // reports the underlying type as tinyint.
  assert(
    columnDefinitions.active?.dataType === 'tinyint',
    `Expected active to be tinyint, received ` +
      `"${columnDefinitions.active?.dataType}".`,
  );

  // [ADDED]
  // The existing MySQL dialect preserves timezone-bearing datetimes
  // as VARCHAR because DATETIME does not retain the timezone suffix.
  assert(
    columnDefinitions.created_at?.dataType === 'varchar',
    `Expected created_at to be varchar, received ` +
      `"${columnDefinitions.created_at?.dataType}".`,
  );

  assert(
    columnDefinitions.description?.dataType === 'varchar',
    `Expected description to be varchar, received ` +
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
    'MySQL SQL execution passed',
  );
} finally {
  // [ADDED]
  // Remove the validation table before closing the independent
  // verification connection.
  if (
    tableCreated &&
    databaseConnection
  ) {
    const quotedTableName =
      `\`${validationTableName
        .replaceAll('`', '``')}\``;

    await databaseConnection.query(
      `DROP TABLE IF EXISTS ${quotedTableName};`,
    );
  }

  // [ADDED]
  // If execution succeeded but the independent verification
  // connection was not established, use SqlExecutor for cleanup.
  if (
    tableCreated &&
    !databaseConnection &&
    sqlExecutor
  ) {
    const quotedTableName =
      `\`${validationTableName
        .replaceAll('`', '``')}\``;

    await sqlExecutor.execute(
      `DROP TABLE IF EXISTS ${quotedTableName};`,
    );
  }

  if (databaseConnection) {
    await databaseConnection.end();
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
