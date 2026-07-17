import path from 'node:path';

import { CsvFileReader } from './lib/CsvFileReader.js';
import { CsvSchemaAnalyzer } from './lib/CsvSchemaAnalyzer.js';
import { SqlFileWriter } from './lib/SqlFileWriter.js';
import { ValueTypeInferer } from './lib/ValueTypeInferer.js';
import { MySqlDialect, PostgresDialect, } from './lib/SqlDialects.js';

function getDefaultSqlFilePath(filePath) {
  const parsedPath = path.parse(filePath);

  return path.join(
    parsedPath.dir,
    `${parsedPath.name}.sql`,
  );
}

export function createCsvSchemaAnalyzer({
  reader = new CsvFileReader(),
  inferer = new ValueTypeInferer(),
  dialects = {
    mysql: new MySqlDialect(),
    postgres: new PostgresDialect(),
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
    ...analysisOptions
  } = {},
) {
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

  const writtenSqlFilePath = await writer.write(
    result.sql,
    sqlFilePath ?? getDefaultSqlFilePath(filePath),
  );


  return {
    ...result,
    sqlFilePath: writtenSqlFilePath,
  };
}
