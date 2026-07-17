import { analyzeCsv } from './src/index.js';

const filePath = process.argv[2];
const writeSqlFile = process.argv[3];

if (!filePath) {
  console.error('Usage: node analyzeCsv.js <csv-file>');
  process.exit(1);
}

try {
  const result = await analyzeCsv(filePath, {
      dialect: 'mysql',
      writeSqlFile,
      maxRows: 10000,
      inferNotNull: false,
      maximumExamples: 3,
      // csv: {
      //   delimiter: ',',
      //   quote: '"',
      // },
    },
  );

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

  console.log(`\nTable name: ${result.tableName}`);
  console.log(`SQL file: ${result.sqlFilePath}`);
  console.log(result.sql);
} catch (error) {
  console.error(
    `Unable to analyze CSV: ${error.message}`,
  );

  process.exit(1);
}
