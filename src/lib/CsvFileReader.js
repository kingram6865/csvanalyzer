import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';

export class CsvFileReader {
  constructor({
    encoding = 'utf8',
    ...parserOptions
  } = {}) {
    this.encoding = encoding;

    this.parserOptions = {
      bom: true,
      columns: false,
      skip_empty_lines: true,
      relax_column_count: false,
      ...parserOptions,
    };
  }

  async read(filePath, visitor, { maxRows = Infinity } = {}) {
    if (typeof visitor?.onHeaders !== 'function') {
      throw new TypeError('visitor.onHeaders must be a function');
    }

    if (typeof visitor?.onRow !== 'function') {
      throw new TypeError('visitor.onRow must be a function');
    }

    const input = createReadStream(filePath, {
      encoding: this.encoding,
    });

    const parser = input.pipe(parse(this.parserOptions));

    let headers = null;
    let rowsRead = 0;

    try {
      for await (const record of parser) {
        if (headers === null) {
          headers = record.map((header, index) => {
            const value = String(header ?? '').trim();
            return value || `column_${index + 1}`;
          });

          visitor.onHeaders(headers);
          continue;
        }

        if (rowsRead >= maxRows) {
          break;
        }

        visitor.onRow(record, rowsRead);
        rowsRead += 1;
      }
    } finally {
      if (!input.destroyed) {
        input.destroy();
      }
    }

    if (headers === null) {
      throw new Error(`CSV file contains no header row: ${filePath}`);
    }

    return {
      headers,
      rowsRead,
    };
  }
}
