const supportedOptions = new Map([
  ['--write-sql', { property: 'writeSqlFile', requiresValue: false, },],
  ['--sql-path', { property: 'sqlFilePath', requiresValue: true, },],
  ['--sql-file-name', { property: 'sqlFileName', requiresValue: true, },],
]);

export function parseArguments(args) {
  const parsedArguments = {
    csvFilePath: null,
    writeSqlFile: false,
    sqlFilePath: null,
    sqlFileName: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = supportedOptions.get(argument);

    if (option) {
      if (!option.requiresValue) {
        parsedArguments[option.property] = true;
        continue;
      }

      const value = args[index + 1];

      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      parsedArguments[option.property] = value;
      index += 1;
      continue;
    }

    if (argument.startsWith('--')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (parsedArguments.csvFilePath !== null) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    parsedArguments.csvFilePath = argument;
  }

  return parsedArguments;
}
