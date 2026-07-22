import { analyzeCsv } from '../src/index.js';
import {
  assert,
  assertContains,
  assertDoesNotContain,
  createCsvValidationFixture,
  removeValidationDirectory,
} from './utilities.js';

const {temporaryDirectory, csvFilePath} =
  await createCsvValidationFixture({ directoryPrefix: 'csvreader-validation-', fileName: 'dialect-sample.csv' });

try {
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
  await removeValidationDirectory(temporaryDirectory);
}
