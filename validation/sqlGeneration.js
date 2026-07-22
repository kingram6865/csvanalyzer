import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeCsv } from '../src/index.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(sql, fragment, dialect) {
  assert(
    sql.includes(fragment),
    `${dialect} SQL did not contain: ${fragment}\n\n${sql}`,
  );
}

function assertDoesNotContain(sql, fragment, dialect) {
  assert(
    !sql.includes(fragment),
    `${dialect} SQL unexpectedly contained: ${fragment}\n\n${sql}`,
  );
}

const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'csvreader-validation-'),
);

const csvFilePath = path.join(
  temporaryDirectory,
  'dialect-sample.csv',
);

try {
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

  assertContains(
    sqliteResult.sql,
    '"active" INTEGER NOT NULL',
    'SQLite',
  );

  assertContains(
    sqliteResult.sql,
    '"created_at" TEXT NOT NULL',
    'SQLite',
  );

  assertDoesNotContain(sqliteResult.sql, 'ENGINE=InnoDB', 'SQLite');

  console.log('SQLite generation passed');

  try {
    await analyzeCsv(
      csvFilePath,
      {
        dialect: 'toString',
      },
    );

    throw new Error(
      'Inherited dialect validation did not run.',
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith(
        'Unsupported SQL dialect: toString.',
      )
    ) {
      throw error;
    }

    console.log(
      'Inherited dialect validation passed',
    );
  }

  console.log('SQL dialect generation passed');
} finally {
  await rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
}
