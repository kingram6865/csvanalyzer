import { databaseContexts, } from '../config/databaseContexts.js';
import { buildServerConnectionConfig, requireConnectionValues, validateSql } from './utilities.js';

const SUPPORTED_DIALECTS = new Set([ 'postgres', 'mysql', 'sqlite', ]);

/**
 * Manages named context selection and delegates execution according
 * to the dialect defined by the selected context.
 */
export class SqlExecutor {
  /**
   * @param {*} param0
   */
  constructor({ contexts = databaseContexts } = {}) {
    if (!contexts || typeof contexts !== 'object' || Array.isArray(contexts)) {
      throw new Error('SqlExecutor requires a database context registry.');
    }

    this.contexts = contexts;
    this.contextName = null;
    this.context = null;
  }

  setContext(contextName) {
    if (typeof contextName !== 'string' || contextName.trim().length === 0) {
      throw new Error('A database context name is required.',);
    }

    const selectedContextName = contextName.trim();

    // Object.hasOwn() ensures only explicitly configured contexts can be selected
    if (!Object.hasOwn(this.contexts, selectedContextName,)) {
      const availableContexts = Object.keys(this.contexts).join(', ') || 'none';

      throw new Error(
        `Unknown database context ` +
        `"${selectedContextName}". ` +
        `Available contexts: ${availableContexts}.`,
      );
    }

    const context = this.contexts[selectedContextName];

    if (
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context)
    ) {
      throw new Error(
        `Database context "${selectedContextName}" ` +
        'does not define a valid context object.',
      );
    }

    // Validate the dialect contained in the context
    if (!SUPPORTED_DIALECTS.has(context.dialect)) {
      throw new Error(
        `Database context "${selectedContextName}" ` +
        `uses unsupported dialect ` +
        `"${context.dialect}".`,
      );
    }

    if (
      !context.connection ||
      typeof context.connection !== 'object' ||
      Array.isArray(context.connection)
    ) {
      throw new Error(
        `Database context "${selectedContextName}" ` +
        'does not define a connection object.',
      );
    }

    this.contextName = selectedContextName;
    this.context = context;

    return this;
  }

  getDialect() {
    return this.getSelectedContext().dialect;
  }

  // Executes the generated SQL using the driver associated with the
  // selected context's dialect

  async execute(sql) {
    validateSql(sql);
    const context = this.getSelectedContext();

    switch (context.dialect) {
      case 'postgres':
        await this.executePostgres(sql, context.connection);
        break;
      case 'mysql':
        await this.executeMySql(sql, context.connection);
        break;
      case 'sqlite':
        await this.executeSqlite(sql, context.connection);
        break;
      default:
        throw new Error(`Unsupported SQL execution dialect: ${context.dialect}.`);
    }

    return {contextName: this.contextName, dialect: context.dialect, };
  }

  async executeImport({ createTableSql, insertSql, insertRows }) {
    let insertionResult;
    const context = this.getSelectedContext();

    validateSql(createTableSql);
    validateSql(insertSql);

    if (typeof insertRows !== 'function') {
      throw new TypeError('SQL import requires an insertRows function.');
    }

    switch (context.dialect) {
      case 'postgres':
        insertionResult = await this.executePostgresImport(
          createTableSql,
          insertSql,
          insertRows,
          context.connection,
        );
        break;
      case 'mysql':
        insertionResult = await this.executeMySqlImport(
          createTableSql,
          insertSql,
          insertRows,
          context.connection,
        );
        break;
      case 'sqlite':
        insertionResult = await this.executeSqliteImport(
          createTableSql,
          insertSql,
          insertRows,
          context.connection,
        );
        break;
      default:
        throw new Error(`Unsupported SQL execution dialect: ${context.dialect}.`);
    }

    return {
      contextName: this.contextName,
      dialect: context.dialect,
      rowsRead: insertionResult.rowsRead,
      rowsInserted: insertionResult.rowsInserted,
    };
  }

  // Prevents getDialect() or execute() from being called before setContext().
  getSelectedContext() {
    if (!this.context || !this.contextName) {
      throw new Error('A database context must be selected before SQL execution.');
    }

    return this.context;
  }

  // Executes SQL against PostgreSQL using pg-promise.
  async executePostgres(sql, connection) {
    const connectionConfig = buildServerConnectionConfig(this.contextName, connection);
    const pgPromiseModule = await import('pg-promise');
    const pgPromise = pgPromiseModule.default ?? pgPromiseModule;
    const pgp = pgPromise();

     try {
      const database = pgp(connectionConfig);
      await database.none(sql);
     } finally {
      pgp.end();
     }
  }

  async executePostgresImport(createTableSql, insertSql, insertRows, connection) {
    const connectionConfig = buildServerConnectionConfig(this.contextName, connection);
    const pgPromiseModule = await import('pg-promise');
    const pgPromise = pgPromiseModule.default ?? pgPromiseModule;
    const pgp = pgPromise();
    const database = pgp(connectionConfig);

    try {
      return await database.tx(async (transaction) => {
        await transaction.none(createTableSql);
        return insertRows((values) => transaction.none(insertSql, values));
      });
    } finally {
      pgp.end();
    }
  }

  // Executes SQL against MySQL using mysql2's Promise API.
  async executeMySql(sql, connection) {
  const connectionConfig = buildServerConnectionConfig(this.contextName, connection);
  const mysqlModule = await import('mysql2/promise');
  const mysql = mysqlModule.default ?? mysqlModule;
  const databaseConnection = await mysql.createConnection(connectionConfig);

  try {
    await databaseConnection.query(sql);
  } finally {
    await databaseConnection.end();
  }
  }

  async executeMySqlImport(createTableSql, insertSql, insertRows, connection) {
    const connectionConfig = buildServerConnectionConfig(this.contextName, connection);
    const mysqlModule = await import('mysql2/promise');
    const mysql = mysqlModule.default ?? mysqlModule;
    const databaseConnection = await mysql.createConnection(connectionConfig);

    try {
      await databaseConnection.query(createTableSql);
      await databaseConnection.beginTransaction();

      try {
        const result = await insertRows((values) => databaseConnection.execute(insertSql, values));
        await databaseConnection.commit();
        return result;
      } catch(error) {
        await databaseConnection.rollback();
        throw error;
      }
    } finally {
      await databaseConnection.end();
    }
  }

  // Executes SQL against the SQLite database file configured by SQLITEDB.
  async executeSqlite(sql, connection) {
  requireConnectionValues(this.contextName, connection, ['filename']);
  const sqliteModule = await import('better-sqlite3');
  const Database = sqliteModule.default;
  const database = new Database(connection.filename);

  try {
    // better-sqlite3 executes SQL synchronously through exec().
    database.exec(sql);
  } finally {
    database.close();
  }
  }

  async executeSqliteImport(createTableSql, insertSql, insertRows, connection) {
    requireConnectionValues(this.contextName, connection, ['filename']);
    const sqliteModule = await import('better-sqlite3');
    const Database = sqliteModule.default;
    const database = new Database(connection.filename);

    database.exec('BEGIN');

    try {
      database.exec(createTableSql);
      const insertStatement = database.prepare(insertSql);

      const result = await insertRows((values) => {
        insertStatement.run(...values);
      });

      database.exec('COMMIT');
      return result;
    } catch(error) {
      database.exec('ROLLBACK');
      throw error;
    } finally {
      database.close();
    }
  }
}
