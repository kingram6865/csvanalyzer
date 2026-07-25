import { analyzeCsv, createCsvSchemaAnalyzer } from '../src/index.js';
import {
  assert,
  assertContains,
  assertDoesNotContain,
  createCsvValidationFixture,
  removeValidationDirectory,
} from './utilities.js';

const {temporaryDirectory, csvFilePath} = await createCsvValidationFixture({ directoryPrefix: 'csvreader-validation-', fileName: 'dialect-sample.csv' });

const longColumnPrefix = `identifier_length_validation_column_${'x'.repeat(80)}`;

const longTableName = `identifier_length_validation_table_${'x'.repeat(80)}`;

const longIdentifierCsv = [`${longColumnPrefix}a,${longColumnPrefix}b`, '1,2'].join('\n');

const { temporaryDirectory: identifierTemporaryDirectory, csvFilePath: identifierCsvFilePath } = await createCsvValidationFixture({
  directoryPrefix: 'csvreader-identifier-validation-',
  fileName: 'identifier-length-sample.csv',
  csv: longIdentifierCsv,
});

try {
  const postgresResult = await analyzeCsv(csvFilePath, { dialect: 'postgres', inferNotNull: true, },);
  assert(postgresResult.dialect === 'postgres', 'PostgreSQL result did not retain its dialect.');
  assertContains(postgresResult.sql, 'CREATE TABLE "dialect_sample"', 'PostgreSQL');
  assertContains(postgresResult.sql, '"active" BOOLEAN NOT NULL', 'PostgreSQL',);
  assertContains(postgresResult.sql, '"created_at" TIMESTAMP WITH TIME ZONE NOT NULL', 'PostgreSQL',);
  assertDoesNotContain( postgresResult.sql, 'ENGINE=InnoDB', 'PostgreSQL',);

  const postgresIdentifierResult = await analyzeCsv(identifierCsvFilePath, { dialect: 'postgres', tableName: longTableName, },);
  const postgresColumnNames = postgresIdentifierResult.columns.map((column) => column.name,);
  assert(postgresIdentifierResult.tableName.length === 63, `Expected PostgreSQL table name length 63, received ` + `${postgresIdentifierResult.tableName.length}.`,);
  assert(postgresColumnNames[0].length === 63, `Expected PostgreSQL first column length 63, received ` + `${postgresColumnNames[0].length}.`,);
  assert(postgresColumnNames[1].length === 63, `Expected PostgreSQL duplicate column length 63, received ` + `${postgresColumnNames[1].length}.`,);
  assert(postgresColumnNames[1].endsWith('_2'), 'Expected the truncated PostgreSQL duplicate column to end with "_2".',);
  assert(postgresColumnNames[0] !== postgresColumnNames[1], 'Expected truncated PostgreSQL column names to remain unique.',);
  assertContains(postgresIdentifierResult.sql, `"${postgresIdentifierResult.tableName}"`, 'PostgreSQL identifier table name',);
  assertContains(postgresIdentifierResult.sql, `"${postgresColumnNames[0]}"`, 'PostgreSQL first identifier column',);
  assertContains(postgresIdentifierResult.sql, `"${postgresColumnNames[1]}"`, 'PostgreSQL duplicate identifier column',);

  console.log('PostgreSQL generation passed');

  const mysqlResult = await analyzeCsv(csvFilePath, { dialect: 'mysql', inferNotNull: true, },);
  assert(mysqlResult.dialect === 'mysql', 'MySQL result did not retain its dialect.',);
  assertContains(mysqlResult.sql, 'CREATE TABLE `dialect_sample`', 'MySQL',);
  assertContains(mysqlResult.sql, '`active` BOOLEAN NOT NULL', 'MySQL',);
  assertContains(mysqlResult.sql, '`created_at` VARCHAR(40) NOT NULL', 'MySQL',);
  assertContains(mysqlResult.sql, 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;', 'MySQL',);

  const mysqlIdentifierResult = await analyzeCsv(
    identifierCsvFilePath,
    {
      dialect: 'mysql',
      tableName: longTableName,
    },
  );

  const mysqlColumnNames =
    mysqlIdentifierResult.columns.map(
      (column) => column.name,
    );

  assert(
    mysqlIdentifierResult.tableName.length === 64,
    `Expected MySQL table name length 64, received ` +
      `${mysqlIdentifierResult.tableName.length}.`,
  );

  assert(
    mysqlColumnNames[0].length === 64,
    `Expected MySQL first column length 64, received ` +
      `${mysqlColumnNames[0].length}.`,
  );

  assert(
    mysqlColumnNames[1].length === 64,
    `Expected MySQL duplicate column length 64, received ` +
      `${mysqlColumnNames[1].length}.`,
  );

  assert(
    mysqlColumnNames[1].endsWith('_2'),
    'Expected the truncated MySQL duplicate column to end with "_2".',
  );

  assert(
    mysqlColumnNames[0] !== mysqlColumnNames[1],
    'Expected truncated MySQL column names to remain unique.',
  );

  assertContains(
    mysqlIdentifierResult.sql,
    `\`${mysqlIdentifierResult.tableName}\``,
    'MySQL identifier table name',
  );

  assertContains(
    mysqlIdentifierResult.sql,
    `\`${mysqlColumnNames[0]}\``,
    'MySQL first identifier column',
  );

  assertContains(
    mysqlIdentifierResult.sql,
    `\`${mysqlColumnNames[1]}\``,
    'MySQL duplicate identifier column',
  );

  console.log('MySQL generation passed');

  const sqliteResult = await analyzeCsv(csvFilePath, { dialect: 'sqlite', inferNotNull: true, },);
  assert(sqliteResult.dialect === 'sqlite', 'SQLite result did not retain its dialect.',);
  assertContains(sqliteResult.sql, 'CREATE TABLE "dialect_sample"', 'SQLite',);
  assertContains(sqliteResult.sql, '"active" INTEGER NOT NULL', 'SQLite',);
  assertContains(sqliteResult.sql, '"created_at" TEXT NOT NULL','SQLite',);
  assertDoesNotContain(sqliteResult.sql, 'ENGINE=InnoDB', 'SQLite');

  const sqliteIdentifierResult = await analyzeCsv(
    identifierCsvFilePath,
    {
      dialect: 'sqlite',
      tableName: longTableName,
    },
  );

  const sqliteColumnNames =
    sqliteIdentifierResult.columns.map(
      (column) => column.name,
    );

  assert(
    sqliteIdentifierResult.tableName.length > 64,
    'Expected the SQLite table name to remain longer than 64 characters.',
  );

  assert(
    sqliteColumnNames[0].length > 64,
    'Expected the first SQLite column name to remain longer than 64 characters.',
  );

  assert(
    sqliteColumnNames[1].length > 64,
    'Expected the second SQLite column name to remain longer than 64 characters.',
  );

  assert(
    sqliteColumnNames[0] !== sqliteColumnNames[1],
    'Expected long SQLite column names to remain unique.',
  );

  assertContains(
    sqliteIdentifierResult.sql,
    `"${sqliteIdentifierResult.tableName}"`,
    'SQLite identifier table name',
  );

  assertContains(
    sqliteIdentifierResult.sql,
    `"${sqliteColumnNames[0]}"`,
    'SQLite first identifier column',
  );

  assertContains(
    sqliteIdentifierResult.sql,
    `"${sqliteColumnNames[1]}"`,
    'SQLite second identifier column',
  );

  console.log('SQLite generation passed');

  const customDialectAnalyzer = createCsvSchemaAnalyzer({
    dialects: {
      custom: {
        createTable({ tableName }) {
          return `CUSTOM TABLE ${tableName}`;
        },
      },
    },
  });

  const customDialectResult = await customDialectAnalyzer.analyze(
    identifierCsvFilePath,
    {
      dialect: 'custom',
      tableName: longTableName,
    },
  );

  assert(
    customDialectResult.tableName === longTableName,
    'Expected a custom dialect without an identifier limit to retain the table name.',
  );

  assert(
    customDialectResult.sql === `CUSTOM TABLE ${longTableName}`,
    'Expected the custom dialect to generate SQL without an identifier-limit method.',
  );

  console.log('Custom dialect compatibility passed');

  try {
    await analyzeCsv(csvFilePath, { dialect: 'toString' });

    throw new Error('Inherited dialect validation did not run.');
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
  await removeValidationDirectory(identifierTemporaryDirectory);
}
