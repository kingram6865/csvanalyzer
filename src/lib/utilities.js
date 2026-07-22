const supportedOptions = new Map([
  ['--write-sql', { property: 'writeSqlFile', requiresValue: false, },],
  ['--execute-sql', { property: 'databaseContextName', requiresValue: true, },],
  ['--sql-path', { property: 'sqlFilePath', requiresValue: true, },],
  ['--sql-file-name', { property: 'sqlFileName', requiresValue: true, },],
]);

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    String(value).trim().length === 0
  );
}

function normalizePort(value, contextName) {
  if (isMissing(value)) {
    return null;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Database context "${contextName}" has an invalid port: ${value}.`);
  }

  return port;
}

export function fitsRange(column, minimum, maximum) {
  if (column.minValue === null || column.maxValue === null) {
    return false;
  }

  return (
    BigInt(column.minValue) >= minimum &&
    BigInt(column.maxValue) <= maximum
  );
}

export function suggestedVarcharLength(maxLength) {
  if (maxLength === 0) {
    return null;
  }

  const sizes = [16, 32, 64, 128, 255];

  return sizes.find((size) => maxLength <= size) ?? null;
}

export function renderColumn({
  identifier,
  dataType,
  nullableCandidate,
  inferNotNull,
}) {
  const nullConstraint =
    inferNotNull && !nullableCandidate
      ? ' NOT NULL'
      : '';

  return `  ${identifier} ${dataType}${nullConstraint}`;
}

export function parseArguments(args) {
  const parsedArguments = {
    csvFilePath: null,
    writeSqlFile: false,
    databaseContextName: null,
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

export function requireConnectionValues(contextName, connection, requiredProperties) {
  if ( !connection || typeof connection !== 'object' || Array.isArray(connection)) {
    throw new Error(
      `Database context "${contextName}" does not define a connection object.`);
  }

  const missingProperties = requiredProperties.filter(
    (property) => isMissing(connection[property]),
  );

  if (missingProperties.length > 0) {
    throw new Error(
      `Database context "${contextName}" is missing required ` +
      `connection values: ${missingProperties.join(', ')}.`,
    );
  }
}

export function buildServerConnectionConfig(contextName, connection) {
  requireConnectionValues(
    contextName,
    connection,
    ['host', 'user', 'database'],
  );

  const port = normalizePort(connection.port, contextName);

  const connectionConfig = {
    host: connection.host,
    user: connection.user,
    password: connection.password,
    database: connection.database,
  };

  if (port !== null) {
    connectionConfig.port = port;
  }

  return connectionConfig;
}

export function validateSql(sql) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    throw new Error('SQL execution requires a non-empty SQL string.');
  }
}

export function normalizeIdentifier(value, fallback) {
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

export function createUniqueColumnNames(headers) {
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
