import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import {
  assert,
  createCsvValidationFixture,
  removeValidationDirectory,
} from './utilities.js';

const executeFile = promisify(execFile);

const validationDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);

const projectDirectory = path.resolve(
  validationDirectory,
  '..',
);

const {
  temporaryDirectory,
  csvFilePath,
} = await createCsvValidationFixture({
  directoryPrefix: 'csvreader-cli-validation-',
  fileName: 'cli-sample.csv',
});

const sqliteFilePath = path.join(
  temporaryDirectory,
  'cli-validation.sqlite',
);

try {
  const { stdout } = await executeFile(
    process.execPath,
    [
      path.join(projectDirectory, 'readCsv.js'),
      csvFilePath,
      '--execute-sql',
      'sqlite',
    ],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        SQLITEDB: sqliteFilePath,
      },
    },
  );

  assert(
    stdout.includes(
      'Executed SQL using database context "sqlite" (sqlite).',
    ),
    'The CLI did not report successful SQLite execution.',
  );

  assert(
    stdout.includes('Inserted 2 of 2 CSV rows.'),
    'The CLI did not report the expected inserted row count.',
  );

  const database = new Database(
    sqliteFilePath,
    {
      readonly: true,
    },
  );

  try {
    const rows = database
      .prepare(
        `
          SELECT
            id,
            amount,
            active,
            created_at,
            description
          FROM "cli_sample"
          ORDER BY id
        `,
      )
      .all();

    const expectedRows = [
      {
        id: 1,
        amount: 12.5,
        active: 1,
        created_at: '2026-07-21T12:00:00Z',
        description: 'Alpha',
      },
      {
        id: 2,
        amount: 7.25,
        active: 0,
        created_at: '2026-07-22T13:30:00Z',
        description: 'Beta',
      },
    ];

    assert(
      JSON.stringify(rows) === JSON.stringify(expectedRows),
      `CLI-inserted rows did not match the CSV data.\n` +
        `Expected: ${JSON.stringify(expectedRows)}\n` +
        `Received: ${JSON.stringify(rows)}`,
    );
  } finally {
    database.close();
  }

  console.log('CLI SQLite import passed');
} finally {
  await removeValidationDirectory(temporaryDirectory);
}
