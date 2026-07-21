import { analyzeCsv, SqlExecutor } from './src/index.js';
import { parseArguments } from './src/lib/utilities.js';

const usage =
  'Usage: node readCsv.js <csv-file> ' +
  '[--write-sql] ' +
  '[--execute-sql <database-context>] ' +
  '[--sql-path <directory>] ' +
  '[--sql-file-name <filename.sql>]';

try {
  const {
    csvFilePath,
    writeSqlFile,
    databaseContextName,
    sqlFilePath,
    sqlFileName,
  } = parseArguments(process.argv.slice(2));

  if (!csvFilePath) {
    console.error(usage);
    process.exit(1);
  }

  if ((sqlFilePath || sqlFileName) && !writeSqlFile) {
    throw new Error(
      '--sql-path and --sql-file-name require --write-sql.',
    );
  }

  const sqlExecutor = databaseContextName
    ? new SqlExecutor().setContext(databaseContextName)
    : null;

  const result = await analyzeCsv(csvFilePath, {
      dialect: sqlExecutor?.getDialect() ?? 'postgres',
      writeSqlFile,
      sqlFilePath,
      sqlFileName,
      maxRows: Infinity,
      inferNotNull: false,
      maximumExamples: 3,
    },
  );

  console.log(`Table name: ${result.tableName.padEnd(35, ' ')} with ${result.rowsAnalyzed.toString().padEnd(12, ' ')} rows of data`);

  console.table(
    result.columns.map((column) => ({
      sourceField: column.sourceName,
      sqlField: column.name,
      type: column.inferredType,
      maxLength: column.maxLength,
      precision: column.precision,
      scale: column.scale,
      emptyValues: column.emptyCount,
    })),
  );

  console.log(result.sql);

  if (result.sqlFilePath) {
    console.log(`SQL file: ${result.sqlFilePath}`);
  }

  if (sqlExecutor) {
    const execution = await sqlExecutor.execute(result.sql);

    console.log(
      `Executed SQL using database context ` +
      `"${execution.contextName}" (${execution.dialect}).`,
    );
  }
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(`csvreader failed: ${message}`);
  process.exit(1);
}
