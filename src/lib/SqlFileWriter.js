import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SqlFileWriter {
  async write(sql, outputPath) {
    if (!sql) {
      throw new Error(
        'SQL cannot be written because no SQL was generated.',
      );
    }

    const normalizedPath =
      path.extname(outputPath).toLowerCase() === '.sql'
        ? outputPath
        : `${outputPath}.sql`;

    const resolvedPath = path.resolve(normalizedPath);

    await mkdir(path.dirname(resolvedPath), {
      recursive: true,
    });

    await writeFile(
      resolvedPath,
      `${sql.trim()}\n`,
      'utf8',
    );

    return resolvedPath;
  }
}
