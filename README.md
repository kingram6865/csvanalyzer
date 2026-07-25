# csvreader

`csvreader` analyzes a CSV file to infer column names, data types, sizes, precision, scale, nullability, and example values.

It generates a `CREATE TABLE` statement for:

* PostgreSQL
* MySQL
* SQLite

The generated SQL can be displayed, written to a `.sql` file, executed against a configured database context, or both written and executed.

> `csvreader` currently creates the inferred table structure only. It does not insert the CSV rows into the database.

## Installation

Install the project dependencies:

```bash
npm install
```

## Command-line usage

```text
node readCsv.js <csv-file> \
  [--write-sql] \
  [--execute-sql <database-context>] \
  [--sql-path <directory>] \
  [--sql-file-name <filename.sql>]
```

### Analyze a CSV

```bash
node readCsv.js data/example.csv
```

This analyzes the CSV, displays the inferred columns, and prints PostgreSQL `CREATE TABLE` SQL.

PostgreSQL is the default SQL-generation dialect when no database execution context is selected.

### Write the generated SQL to a file

```bash
node readCsv.js data/example.csv --write-sql
```

By default, the SQL file is written beside the input CSV using the CSV filename:

```text
data/example.sql
```

### Choose an output directory

```bash
node readCsv.js data/example.csv \
  --write-sql \
  --sql-path generated
```

### Choose an output filename

```bash
node readCsv.js data/example.csv \
  --write-sql \
  --sql-file-name inventory.sql
```

`--sql-path` and `--sql-file-name` require `--write-sql`.

### Execute the generated SQL

Pass the name of a configured database context:

```bash
node readCsv.js data/example.csv --execute-sql postgres
```

```bash
node readCsv.js data/example.csv --execute-sql mysql
```

```bash
node readCsv.js data/example.csv --execute-sql sqlite
```

The selected database context controls both:

1. The SQL dialect used to generate the `CREATE TABLE` statement.
2. The database connection used to execute the statement.

### Write and execute the SQL

```bash
node readCsv.js data/example.csv \
  --write-sql \
  --execute-sql postgres
```

Writing the SQL file and executing the SQL are independent operations.

## Options

| Option                           | Description                                                             |
| -------------------------------- | ----------------------------------------------------------------------- |
| `--write-sql`                    | Write the generated SQL to a `.sql` file.                               |
| `--execute-sql <context>`        | Execute the generated SQL using a named database context.               |
| `--sql-path <directory>`         | Directory where the SQL file should be written. Requires `--write-sql`. |
| `--sql-file-name <filename.sql>` | Filename for the generated SQL file. Requires `--write-sql`.            |

## Database environment

Create a `.env` file in the project root.

### PostgreSQL

```dotenv
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPW=password
PGDB=database_name
```

Execute using:

```bash
node readCsv.js data/example.csv --execute-sql postgres
```

### MySQL

```dotenv
MYSQLHOST=localhost
MYSQLPORT=3306
MYSQLUSER=mysql_user
MYSQLPW=password
MYSQLDB=database_name
```

Execute using:

```bash
node readCsv.js data/example.csv --execute-sql mysql
```

### SQLite

```dotenv
SQLITEDB=/full/path/to/database.sqlite
```

Execute using:

```bash
node readCsv.js data/example.csv --execute-sql sqlite
```

SQLite creates the database file when it does not already exist, provided the containing directory is available and writable.

## Database contexts

Database contexts are defined in:

```text
src/config/databaseContexts.js
```

Each context contains:

```js
{
  dialect: 'postgres' | 'mysql' | 'sqlite',
  connection: {
    // Driver-specific connection values
  },
}
```

The context name does not have to match the dialect name. Additional contexts may point to the same database engine:

```js
export const databaseContexts = {
  reporting: {
    dialect: 'postgres',
    connection: {
      host: process.env.REPORTING_PGHOST,
      port: process.env.REPORTING_PGPORT,
      user: process.env.REPORTING_PGUSER,
      password: process.env.REPORTING_PGPW,
      database: process.env.REPORTING_PGDB,
    },
  },
};
```

That context would be selected with:

```bash
node readCsv.js data/example.csv --execute-sql reporting
```

## Validation

### Syntax and local validation

```bash
npm test
```

This runs:

* Project-wide JavaScript syntax validation
* Database-context selection validation
* PostgreSQL, MySQL, and SQLite SQL-generation validation
* Isolated SQLite execution validation

The local validation does not require a live PostgreSQL or MySQL server.

### Run an individual validation

```bash
npm run validate:context
npm run validate:generation
npm run validate:sqlite
```

### Live PostgreSQL and MySQL validation

```bash
npm run validate:database
```

These checks use the PostgreSQL and MySQL contexts configured in `.env`.

Each live validation:

1. Creates a uniquely named temporary table.
2. Confirms the generated column definitions through database metadata.
3. Drops the temporary table during cleanup.

### Run the complete validation suite

```bash
npm run validate:all
```

## Project structure

```text
readCsv.js
src/
  config/
    databaseContexts.js
  index.js
  lib/
    ColumnProfiler.js
    CsvFileReader.js
    CsvSchemaAnalyzer.js
    SqlDialects.js
    SqlExecutor.js
    SqlFileWriter.js
    ValueTypeInferer.js
    utilities.js
validation/
  context.js
  mysqlExecution.js
  postgresExecution.js
  sqlGeneration.js
  sqliteExecution.js
  utilities.js
```
