import { analyzeCsv } from './src/index.js';

const args = process.argv.slice(2);
const filePath = args[0];
const supportedOptions = new Set([
  '--write-sql',
  '--sql-path',
  '--sql-file-name',
]);

function getOptionValue(optionName) {
  const optionIndex = args.indexOf(optionName);

  if (optionIndex === -1) {
    return null;
  }

  const value = args[optionIndex + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

if (!filePath || filePath.startsWith('--')) {
  console.error(
    'Usage: node readCsv.js <csv-file> ' +
    '[--write-sql] ' +
    '[--sql-path <directory>] ' +
    '[--sql-file-name <filename.sql>]',
  );

  process.exit(1);
}

// const writeSqlFile = sqlFilePath !== null;
// const sqlFilePath = process.argv[3] ?? null;
//
// if (!filePath) {
//   console.error('Usage: node analyzeCsv.js <csv-file>');
//   process.exit(1);
// }

try {
  const unknownOption = args.find(
    (argument) =>
      argument.startsWith('--') &&
      !supportedOptions.has(argument),
  );

  if (unknownOption) {
    throw new Error(`Unknown option: ${unknownOption}`);
  }

  const writeSqlFile = args.includes('--write-sql');
  const sqlFilePath = getOptionValue('--sql-path');
  const sqlFileName = getOptionValue('--sql-file-name');

  if ((sqlFilePath || sqlFileName) && !writeSqlFile) {
    throw new Error(
      '--sql-path and --sql-file-name require --write-sql.',
    );
  }

  const result = await analyzeCsv(filePath, {
      dialect: 'mysql',
      writeSqlFile,
      sqlFilePath,
      sqlFileName,
      maxRows: Infinity,
      inferNotNull: false,
      maximumExamples: 3,
    },
  );

  // console.log(`\nTable name: ${result.tableName}`);
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

  if (result.sqlFilePath) {
    console.log(`SQL file: ${result.sqlFilePath}`);
  }
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(`Unable to analyze CSV: ${message}`);
  process.exit(1);
}
