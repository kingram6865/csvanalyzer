import mysql from 'mysql2/promise';
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

  assert(
    typeof result.insertSql === 'string' &&
      result.insertSql.trim().length > 0,
    'MySQL insert SQL was not generated.',
  );

  const csvDataInserter = new CsvDataInserter();
  tableCreated = true;

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



  assert(
    execution.contextName === 'mysql',
    'Execution returned the wrong context name.',
  );

  assert(
    execution.dialect === 'mysql',
    'Execution returned the wrong dialect.',
  );

  assert(
    execution.rowsRead === 2,
    `Expected 2 CSV rows to be read, received ` +
      `${execution.rowsRead}.`,
  );

  assert(
    execution.rowsInserted === 2,
    `Expected 2 CSV rows to be inserted, received ` +
      `${execution.rowsInserted}.`,
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

  const quotedTableName = `\`${result.tableName.replaceAll('`', '``')}\``;

  const [insertedRows] = await databaseConnection.query(
    `
      SELECT
        id,
        amount,
        active,
        created_at,
        description
      FROM ${quotedTableName}
      ORDER BY id
    `,
  );

  const expectedRows = [
    {
      id: 1,
      amount: '12.50',
      active: 1,
      created_at: '2026-07-21T12:00:00Z',
      description: 'Alpha',
    },
    {
      id: 2,
      amount: '7.25',
      active: 0,
      created_at: '2026-07-22T13:30:00Z',
      description: 'Beta',
    },
  ];

  assert(
    JSON.stringify(insertedRows) === JSON.stringify(expectedRows),
    `MySQL inserted rows did not match the CSV data.\n` +
      `Expected: ${JSON.stringify(expectedRows)}\n` +
      `Received: ${JSON.stringify(insertedRows)}`,
  );

  console.log('MySQL SQL execution passed');
} finally {
  try {
    if (tableCreated && databaseConnection) {
      const quotedTableName = `\`${validationTableName.replaceAll('`', '``')}\``;
      await databaseConnection.query(`DROP TABLE IF EXISTS ${quotedTableName};`);
    }

    if (tableCreated && !databaseConnection && sqlExecutor) {
      const quotedTableName = `\`${validationTableName.replaceAll('`', '``')}\``;
      await sqlExecutor.execute(`DROP TABLE IF EXISTS ${quotedTableName};`);
    }
  } finally {
    if (databaseConnection) {
      await databaseConnection.end();
    }

    await removeValidationDirectory(temporaryDirectory);
  }
}
