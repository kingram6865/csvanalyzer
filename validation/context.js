import { SqlExecutor } from '../src/lib/SqlExecutor.js';

const contexts = {
  reporting: {
    dialect: 'postgres',
    connection: {},
  },
  inventory: {
    dialect: 'mysql',
    connection: {},
  },
  local: {
    dialect: 'sqlite',
    connection: {},
  },
};

for (const [contextName, expectedDialect] of [
  ['reporting', 'postgres'],
  ['inventory', 'mysql'],
  ['local', 'sqlite'],
]) {
  const executor = new SqlExecutor({ contexts })
    .setContext(contextName);

  const actualDialect = executor.getDialect();

  if (actualDialect !== expectedDialect) {
    throw new Error(
      `Context "${contextName}" returned "${actualDialect}" ` +
      `instead of "${expectedDialect}".`,
    );
  }

  console.log(
    `${contextName}: ${actualDialect}`,
  );
}

try {
  new SqlExecutor({ contexts })
    .setContext('missing');

  throw new Error(
    'Unknown context validation did not run.',
  );
} catch (error) {
  if (
    !error.message.startsWith(
      'Unknown database context',
    )
  ) {
    throw error;
  }

  console.log('Unknown context validation passed');
}

try {
  new SqlExecutor({
    contexts: {
      broken: null,
    },
  }).setContext('broken');

  throw new Error('Malformed context validation did not run.');
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !==
      'Database context "broken" ' +
      'does not define a valid context object.'
  ) {
    throw error;
  }

  console.log('Malformed context validation passed');
}

console.log('Context selection passed');
