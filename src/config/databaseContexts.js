import 'dotenv/config';

export const databaseContexts = {
  postgres: {
    dialect: 'postgres',
    connection: {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPW,
      database: process.env.PGDB,
    }
  },
  mysql: {
    dialect: 'mysql',
    connection: {
      host: process.env.MYSQLHOST,
      port: process.env.MYSQLPORT,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPW,
      database: process.env.MYSQLDB,
    }
  },
  sqlite: {
    dialect: 'sqlite',
    connection: {
      filename: process.env.SQLITEDB,
    }
  },
}
