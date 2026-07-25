import { CsvFileReader } from './CsvFileReader.js';

function convertCsvValue(rawValue, column) {
  const originalValue = String(rawValue ?? '');
  const trimmedValue = originalValue.trim();

  if (trimmedValue === '') {
    return null;
  }

  if (column.inferredType === 'boolean') {
    return trimmedValue.toLowerCase() === 'true' ? 1 : 0;
  }

  if (column.inferredType === 'string') {
    return originalValue;
  }

  return trimmedValue;
}

export class CsvDataInserter {
  constructor({ reader = new CsvFileReader() } = {}) {
    this.reader = reader;
  }

  async insert(
    filePath,
    {
      columns,
      insertRow,
      maxRows = Infinity,
    },
  ) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new TypeError('CSV insertion requires at least one column.');
    }

    if (typeof insertRow !== 'function') {
      throw new TypeError('CSV insertion requires an insertRow function.');
    }

    let rowsInserted = 0;

    const readResult = await this.reader.read(
      filePath,
      {
        onHeaders: (headers) => {
          if (headers.length !== columns.length) {
            throw new Error(
              `CSV header count ${headers.length} does not match ` +
              `the analyzed column count ${columns.length}.`,
            );
          }
        },

        onRow: async (row) => {
          const values = row.map((value, index) =>
            convertCsvValue(value, columns[index]),
          );

          await insertRow(values);
          rowsInserted += 1;
        },
      },
      {
        maxRows,
      },
    );

    return {
      rowsRead: readResult.rowsRead,
      rowsInserted,
    };
  }
}
