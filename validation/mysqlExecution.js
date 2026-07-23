import mysql from 'mysql2/promise';
import { databaseContexts } from '../src/config/databaseContexts.js';
import { analyzeCsv } from '../src/index.js';
import { SqlExecutor } from '../src/lib/SqlExecutor.js';
import { buildServerConnectionConfig } from '../src/lib/utilities.js';
import {
  assert,
  createCsvValidationFixture,
  createValidationTableName,
  removeValidationDirectory,
} from './utilities.js';

const validationTableName = createValidationTableName('csvreader_mysql_validation');

const { temporaryDirectory, csvFilePath } = await createCsvValidationFixture({
  directoryPrefix: 'csvreader-mysql-validation-',
  fileName: 'mysql-executor-sample.csv',
});

let sqlExecutor = null;
let databaseConnection = null;
let tableCreated = false;

try {
  sqlExecutor = new SqlExecutor().setContext('mysql');

  assert(
    sqlExecutor.getDialect() === 'mysql',
    'The mysql context returned the wrong dialect.',
  );

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

  const execution = await sqlExecutor.execute(result.sql);

  tableCreated = true;

  assert(
    execution.contextName === 'mysql',
    'Execution returned the wrong context name.',
  );

  assert(
    execution.dialect === 'mysql',
    'Execution returned the wrong dialect.',
  );

  const mysqlContext = databaseContexts.mysql;

  const connectionConfig = buildServerConnectionConfig('mysql', mysqlContext.connection);

  databaseConnection = await mysql.createConnection(connectionConfig);

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

  assert(
    columnDefinitions.active?.dataType === 'tinyint',
    `Expected active to be tinyint, received ` +
      `"${columnDefinitions.active?.dataType}".`,
  );

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

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    assert(
      definition.isNullable === 'NO',
      `Expected "${columnName}" to be NOT NULL.`,
    );
  }

  console.log('MySQL SQL execution passed');
} finally {

  if (tableCreated && databaseConnection) {
    const quotedTableName = `\`${validationTableName .replaceAll('`', '``')}\``;
    await databaseConnection.query(`DROP TABLE IF EXISTS ${quotedTableName};`);
  }

  if (tableCreated && !databaseConnection && sqlExecutor) {
    const quotedTableName = `\`${validationTableName.replaceAll('`', '``')}\``;
    await sqlExecutor.execute(`DROP TABLE IF EXISTS ${quotedTableName};`);
  }

  if (databaseConnection) {await databaseConnection.end();}

  await removeValidationDirectory(temporaryDirectory);
}
