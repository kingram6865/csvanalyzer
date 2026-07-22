// [ADDED]
// Use Node's temporary-directory utilities so the validation does not
// leave a test CSV inside the repository.
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';

import os from 'node:os';
import path from 'node:path';

// [ADDED]
// analyzeCsv() is the public orchestration function being validated.
import { analyzeCsv } from '../src/index.js';

// [ADDED]
// Small assertion helper so each failure reports the specific SQL
// behavior that did not match expectations.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// [ADDED]
// Verify that generated SQL contains an expected fragment.
function assertContains(sql, fragment, dialect) {
  assert(
    sql.includes(fragment),
    `${dialect} SQL did not contain: ${fragment}\n\n${sql}`,
  );
}

// [ADDED]
// Verify that generated SQL does not contain a fragment belonging to
// another database engine.
function assertDoesNotContain(sql, fragment, dialect) {
  assert(
    !sql.includes(fragment),
    `${dialect} SQL unexpectedly contained: ${fragment}\n\n${sql}`,
  );
}

// [ADDED]
// Create an isolated directory for the validation CSV.
const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'csvreader-validation-'),
);

const csvFilePath = path.join(
  temporaryDirectory,
  'dialect-sample.csv',
);

try {
  // [ADDED]
  // These values exercise integer, decimal, boolean, timezone-aware
  // datetime, and string inference.
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
  // Generate PostgreSQL SQL through the registered postgres dialect.
  const postgresResult = await analyzeCsv(
    csvFilePath,
    {
      dialect: 'postgres',
      inferNotNull: true,
    },
  );

  assert(
    postgresResult.dialect === 'postgres',
    'PostgreSQL result did not retain its dialect.',
  );

  assertContains(
    postgresResult.sql,
    'CREATE TABLE "dialect_sample"',
    'PostgreSQL',
  );

  assertContains(
    postgresResult.sql,
    '"active" BOOLEAN NOT NULL',
    'PostgreSQL',
  );

  assertContains(
    postgresResult.sql,
    '"created_at" TIMESTAMP WITH TIME ZONE NOT NULL',
    'PostgreSQL',
  );

  assertDoesNotContain(
    postgresResult.sql,
    'ENGINE=InnoDB',
    'PostgreSQL',
  );

  console.log('PostgreSQL generation passed');

  // [ADDED]
  // Generate MySQL SQL through the registered mysql dialect.
  const mysqlResult = await analyzeCsv(
    csvFilePath,
    {
      dialect: 'mysql',
      inferNotNull: true,
    },
  );

  assert(
    mysqlResult.dialect === 'mysql',
    'MySQL result did not retain its dialect.',
  );

  assertContains(
    mysqlResult.sql,
    'CREATE TABLE `dialect_sample`',
    'MySQL',
  );

  assertContains(
    mysqlResult.sql,
    '`active` BOOLEAN NOT NULL',
    'MySQL',
  );

  // [ADDED]
  // The existing MySQL dialect preserves timezone-bearing datetimes
  // as text because MySQL DATETIME does not retain timezone offsets.
  assertContains(
    mysqlResult.sql,
    '`created_at` VARCHAR(40) NOT NULL',
    'MySQL',
  );

  assertContains(
    mysqlResult.sql,
    'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    'MySQL',
  );

  console.log('MySQL generation passed');

  // [ADDED]
  // Generate SQLite SQL through the newly registered sqlite dialect.
  const sqliteResult = await analyzeCsv(
    csvFilePath,
    {
      dialect: 'sqlite',
      inferNotNull: true,
    },
  );

  assert(
    sqliteResult.dialect === 'sqlite',
    'SQLite result did not retain its dialect.',
  );

  assertContains(
    sqliteResult.sql,
    'CREATE TABLE "dialect_sample"',
    'SQLite',
  );

  // [ADDED]
  // SQLite stores booleans using INTEGER affinity.
  assertContains(
    sqliteResult.sql,
    '"active" INTEGER NOT NULL',
    'SQLite',
  );

  // [ADDED]
  // SQLite preserves date and datetime source values as TEXT.
  assertContains(
    sqliteResult.sql,
    '"created_at" TEXT NOT NULL',
    'SQLite',
  );

  assertDoesNotContain(
    sqliteResult.sql,
    'ENGINE=InnoDB',
    'SQLite',
  );

  console.log('SQLite generation passed');

  console.log('SQL dialect generation passed');
} finally {
  // [ADDED]
  // Remove the temporary directory and CSV whether validation succeeds
  // or an assertion throws.
  await rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
}
