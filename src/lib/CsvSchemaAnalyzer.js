import path from 'node:path';

import { ColumnProfiler } from './ColumnProfiler.js';

function normalizeIdentifier(value, fallback) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const identifier = normalized || fallback;

  return /^\d/.test(identifier)
    ? `column_${identifier}`
    : identifier;
}

function createUniqueColumnNames(headers) {
  const usedNames = new Set();

  return headers.map((header, index) => {
    const baseName = normalizeIdentifier(
      header,
      `column_${index + 1}`,
    );

    let candidate = baseName;
    let suffix = 2;

    while (usedNames.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }

    usedNames.add(candidate);

    return candidate;
  });
}

export class CsvSchemaAnalyzer {
  constructor({
    reader,
    inferer,
    dialects,
  }) {
    this.reader = reader;
    this.inferer = inferer;
    this.dialects = dialects;
  }

  async analyze(
    filePath,
    {
      dialect = null,
      tableName = null,
      maxRows = Infinity,
      inferNotNull = false,
      maximumExamples = 3,
    } = {},
  ) {
    let profilers = [];

    const readResult = await this.reader.read(
      filePath,
      {
        onHeaders: (headers) => {
          const columnNames =
            createUniqueColumnNames(headers);

          profilers = headers.map(
            (sourceName, index) =>
              new ColumnProfiler({
                sourceName,
                name: columnNames[index],
                inferer: this.inferer,
                maximumExamples,
              }),
          );
        },

        onRow: (row) => {
          profilers.forEach((profiler, index) => {
            profiler.add(row[index]);
          });
        },
      },
      {
        maxRows,
      },
    );

    const columns = profilers.map((profiler) =>
      profiler.toResult(),
    );

    const defaultTableName = path.basename(
      filePath,
      path.extname(filePath),
    );

    const normalizedTableName = normalizeIdentifier(
      tableName ?? defaultTableName,
      'imported_data',
    );

    let sql = null;

    if (dialect !== null) {
      const sqlDialect = this.dialects[dialect];

      if (!sqlDialect) {
        throw new Error(
          `Unsupported SQL dialect: ${dialect}. ` +
          'Supported values are mysql and postgres.',
        );
      }

      sql = sqlDialect.createTable({
        tableName: normalizedTableName,
        columns,
        inferNotNull,
      });
    }

    return {
      filePath,
      tableName: normalizedTableName,
      rowsAnalyzed: readResult.rowsRead,
      columnCount: columns.length,
      columns,
      dialect,
      sql,
    };
  }
}
