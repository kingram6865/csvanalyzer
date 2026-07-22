// [ADDED]
// Temporary filesystem utilities keep this validation isolated from
// the project and from the SQLITEDB configured in .env.
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';

import os from 'node:os';
import path from 'node:path';

// [ADDED]
// better-sqlite3 is used after SqlExecutor completes so the validation
// can independently confirm that the table was actually created.
import Database from 'better-sqlite3';

// [ADDED]
// analyzeCsv() generates the SQLite CREATE TABLE statement.
import { analyzeCsv } from '../src/index.js';

// [ADDED]
// SqlExecutor is imported directly from its owning module.
import { SqlExecutor } from '../src/lib/SqlExecutor.js';

// [ADDED]
// Small assertion helper that reports a precise validation failure.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// [ADDED]
// Create an isolated temporary directory for both the CSV and SQLite
// database file.
const temporaryDirectory = await mkdtemp(
  path.join(
    os.tmpdir(),
    'csvreader-sqlite-validation-',
  ),
);

const csvFilePath = path.join(
  temporaryDirectory,
  'executor-sample.csv',
);

const sqliteFilePath = path.join(
  temporaryDirectory,
  'executor-validation.sqlite',
);

try {
  // [ADDED]
  // The sample exercises integer, decimal, boolean, datetime, and
  // string SQL generation.
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
  // Generate SQLite-compatible SQL from the temporary CSV.
  const result = await analyzeCsv(
    csvFilePath,
    {
      dialect: 'sqlite',
      inferNotNull: true,
    },
  );

  assert(
    typeof result.sql === 'string' &&
      result.sql.length > 0,
    'SQLite SQL was not generated.',
  );

  // [ADDED]
  // Use a custom named context so this validation does not depend on
  // SQLITEDB or any other .env value.
  const contexts = {
    localValidation: {
      dialect: 'sqlite',

      connection: {
        filename: sqliteFilePath,
      },
    },
  };

  const sqlExecutor = new SqlExecutor({
    contexts,
  }).setContext('localValidation');

  assert(
    sqlExecutor.getDialect() === 'sqlite',
    'SQLite validation context returned the wrong dialect.',
  );

  // [ADDED]
  // Execute the generated CREATE TABLE statement.
  const execution = await sqlExecutor.execute(
    result.sql,
  );

  assert(
    execution.contextName === 'localValidation',
    'Execution returned the wrong context name.',
  );

  assert(
    execution.dialect === 'sqlite',
    'Execution returned the wrong dialect.',
  );

  // [ADDED]
  // Reopen the database independently after SqlExecutor has closed
  // its own connection.
  const database = new Database(
    sqliteFilePath,
    {
      readonly: true,
    },
  );

  try {
    // [ADDED]
    // Confirm that the expected table exists.
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

    // [ADDED]
    // Confirm the generated table contains the expected columns.
    const columns = database
      .prepare(
        `PRAGMA table_info("${result.tableName}")`,
      )
      .all();

    const columnTypes = Object.fromEntries(
      columns.map((column) => [
        column.name,
        column.type,
      ]),
    );

    assert(
      columnTypes.id === 'INTEGER',
      `Expected id to be INTEGER, received ` +
        `"${columnTypes.id}".`,
    );

    assert(
      columnTypes.amount.startsWith('NUMERIC'),
      `Expected amount to use NUMERIC affinity, received ` +
        `"${columnTypes.amount}".`,
    );

    assert(
      columnTypes.active === 'INTEGER',
      `Expected active to be INTEGER, received ` +
        `"${columnTypes.active}".`,
    );

    assert(
      columnTypes.created_at === 'TEXT',
      `Expected created_at to be TEXT, received ` +
        `"${columnTypes.created_at}".`,
    );

    assert(
      columnTypes.description === 'TEXT',
      `Expected description to be TEXT, received ` +
        `"${columnTypes.description}".`,
    );
  } finally {
    database.close();
  }

  console.log(
    'SQLite SQL execution passed',
  );
} finally {
  // [ADDED]
  // Remove the temporary CSV, SQLite database, and directory whether
  // validation succeeds or fails.
  await rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
}
