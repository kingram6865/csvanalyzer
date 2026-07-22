import path from 'node:path';

import { CsvFileReader } from './lib/CsvFileReader.js';
import { CsvSchemaAnalyzer } from './lib/CsvSchemaAnalyzer.js';
import { SqlFileWriter } from './lib/SqlFileWriter.js';
import { ValueTypeInferer } from './lib/ValueTypeInferer.js';
import { MySqlDialect, PostgresDialect, SqliteDialect, } from './lib/SqlDialects.js';

export function createCsvSchemaAnalyzer({
  reader = new CsvFileReader(),
  inferer = new ValueTypeInferer(),
  dialects = {
    mysql: new MySqlDialect(),
    postgres: new PostgresDialect(),
    sqlite: new SqliteDialect(),
  },
} = {}) {
  return new CsvSchemaAnalyzer({
    reader,
    inferer,
    dialects,
  });
}

export async function analyzeCsv(
  filePath,
  {
    csv = {},
    writeSqlFile = false,
    sqlFilePath = null,
    sqlFileName = null,
    ...analysisOptions
  } = {},
) {
  if (
    sqlFileName !== null &&
    (
      sqlFileName.length === 0 ||
      sqlFileName === '.' ||
      sqlFileName === '..' ||
      path.posix.basename(sqlFileName) !== sqlFileName ||
      path.win32.basename(sqlFileName) !== sqlFileName
    )
  ) {
    throw new Error(
      'sqlFileName must contain a filename only, not a path.',
    );
  }

  const analyzer = createCsvSchemaAnalyzer({
    reader: new CsvFileReader(csv),
  });

  const result = await analyzer.analyze(
    filePath,
    analysisOptions,
  );

  if (!writeSqlFile) {
    return {
      ...result,
      sqlFilePath: null,
    };
  }

  if (!result.sql) {
    throw new Error(
      'writeSqlFile requires a SQL dialect.',
    );
  }

  const writer = new SqlFileWriter();

  const parsedInputPath = path.parse(filePath);
  const outputDirectory = sqlFilePath ?? parsedInputPath.dir;
  const outputFileName = sqlFileName ?? `${parsedInputPath.name}.sql`;

  const writtenSqlFilePath = await writer.write(
    result.sql,
    path.join(outputDirectory, outputFileName),
  );

  return {
    ...result,
    sqlFilePath: writtenSqlFilePath,
  };
}
