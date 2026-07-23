import path from 'node:path';
import { ColumnProfiler } from './ColumnProfiler.js';
import { normalizeIdentifier, createUniqueColumnNames } from './utilities.js';


export class CsvSchemaAnalyzer {
  constructor({ reader, inferer, dialects }) {
    this.reader = reader;
    this.inferer = inferer;
    this.dialects = dialects;
  }

  async analyze(filePath, {
      dialect = null,
      tableName = null,
      maxRows = Infinity,
      inferNotNull = false,
      maximumExamples = 3,
    } = {},
  ) {
    if (maxRows !== Infinity && (!Number.isInteger(maxRows) || maxRows < 0)) {
      throw new TypeError('maxRows must be Infinity or a non-negative integer.');
    }

    if (!Number.isInteger(maximumExamples) || maximumExamples < 0) {
      throw new TypeError('maximumExamples must be a non-negative integer.');
    }

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
      if (!Object.hasOwn(this.dialects, dialect)) {
        const supportedDialects = Object.keys(this.dialects).join(', ');

        throw new Error(
          `Unsupported SQL dialect: ${dialect}. ` +
          `Supported values are ${supportedDialects}.`,
        );
      }

      const sqlDialect = this.dialects[dialect];

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
