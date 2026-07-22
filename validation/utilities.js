import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const validationCsv = [
  'id,amount,active,created_at,description',
  '1,12.50,true,2026-07-21T12:00:00Z,Alpha',
  '2,7.25,false,2026-07-22T13:30:00Z,Beta',
].join('\n');

export function assert(condition,message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function createCsvValidationFixture({
  directoryPrefix,
  fileName,
  csv = validationCsv,
}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), directoryPrefix));
  const csvFilePath = path.join(temporaryDirectory, fileName);

  await writeFile(csvFilePath, csv, 'utf8');

  return { temporaryDirectory, csvFilePath };
}

export async function removeValidationDirectory(
  temporaryDirectory,
) {
  await rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
}

export function createValidationTableName(
  prefix,
) {
  return (
    `${prefix}_` +
    `${process.pid}_${Date.now()}`
  );
}
