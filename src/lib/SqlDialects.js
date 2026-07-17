const MYSQL_INT_MIN = -2147483648n;
const MYSQL_INT_MAX = 2147483647n;

const SIGNED_BIGINT_MIN = -9223372036854775808n;
const SIGNED_BIGINT_MAX = 9223372036854775807n;

function fitsRange(column, minimum, maximum) {
  if (column.minValue === null || column.maxValue === null) {
    return false;
  }

  return (
    BigInt(column.minValue) >= minimum &&
    BigInt(column.maxValue) <= maximum
  );
}

function suggestedVarcharLength(maxLength) {
  if (maxLength === 0) {
    return null;
  }

  const sizes = [16, 32, 64, 128, 255];

  return sizes.find((size) => maxLength <= size) ?? null;
}

function renderColumn({
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

export class MySqlDialect {
  quoteIdentifier(identifier) {
    return `\`${String(identifier).replaceAll('`', '``')}\``;
  }

  mapInteger(column) {
    if (fitsRange(column, MYSQL_INT_MIN, MYSQL_INT_MAX)) {
      return 'INTEGER';
    }

    if (
      fitsRange(
        column,
        SIGNED_BIGINT_MIN,
        SIGNED_BIGINT_MAX,
      )
    ) {
      return 'BIGINT';
    }

    if ((column.precision ?? 0) <= 65) {
      return `DECIMAL(${column.precision}, 0)`;
    }

    return 'TEXT';
  }

  mapString(column) {
    const length = suggestedVarcharLength(column.maxLength);

    return length === null
      ? 'TEXT'
      : `VARCHAR(${length})`;
  }

  mapType(column) {
    switch (column.inferredType) {
      case 'boolean':
        return 'BOOLEAN';

      case 'integer':
        return this.mapInteger(column);

      case 'decimal':
        if (
          column.precision <= 65 &&
          column.scale <= 30
        ) {
          return `DECIMAL(${column.precision}, ${column.scale})`;
        }

        return 'TEXT';

      case 'float':
        return 'DOUBLE';

      case 'date':
        return 'DATE';

      case 'datetime':
        /*
         * MySQL DATETIME does not retain an ISO timezone suffix.
         * Keep timezone-bearing or mixed values as text unless an
         * import transformation is added.
         */
        return column.timezoneMode === 'none'
          ? 'DATETIME'
          : 'VARCHAR(40)';

      case 'string':
      default:
        return this.mapString(column);
    }
  }

  createTable({
    tableName,
    columns,
    inferNotNull = false,
  }) {
    const definitions = columns.map((column) =>
      renderColumn({
        identifier: this.quoteIdentifier(column.name),
        dataType: this.mapType(column),
        nullableCandidate: column.nullableCandidate,
        inferNotNull,
      }),
    );

    return [
      `CREATE TABLE ${this.quoteIdentifier(tableName)} (`,
      definitions.join(',\n'),
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    ].join('\n');
  }
}

export class PostgresDialect {
  quoteIdentifier(identifier) {
    return `"${String(identifier).replaceAll('"', '""')}"`;
  }

  mapInteger(column) {
    if (fitsRange(column, MYSQL_INT_MIN, MYSQL_INT_MAX)) {
      return 'INTEGER';
    }

    if (
      fitsRange(
        column,
        SIGNED_BIGINT_MIN,
        SIGNED_BIGINT_MAX,
      )
    ) {
      return 'BIGINT';
    }

    return `NUMERIC(${column.precision}, 0)`;
  }

  mapString(column) {
    const length = suggestedVarcharLength(column.maxLength);

    return length === null
      ? 'TEXT'
      : `VARCHAR(${length})`;
  }

  mapType(column) {
    switch (column.inferredType) {
      case 'boolean':
        return 'BOOLEAN';

      case 'integer':
        return this.mapInteger(column);

      case 'decimal':
        return `NUMERIC(${column.precision}, ${column.scale})`;

      case 'float':
        return 'DOUBLE PRECISION';

      case 'date':
        return 'DATE';

      case 'datetime':
        if (column.timezoneMode === 'all') {
          return 'TIMESTAMP WITH TIME ZONE';
        }

        if (column.timezoneMode === 'mixed') {
          return 'TEXT';
        }

        return 'TIMESTAMP WITHOUT TIME ZONE';

      case 'string':
      default:
        return this.mapString(column);
    }
  }

  createTable({
    tableName,
    columns,
    inferNotNull = false,
  }) {
    const definitions = columns.map((column) =>
      renderColumn({
        identifier: this.quoteIdentifier(column.name),
        dataType: this.mapType(column),
        nullableCandidate: column.nullableCandidate,
        inferNotNull,
      }),
    );

    return [
      `CREATE TABLE ${this.quoteIdentifier(tableName)} (`,
      definitions.join(',\n'),
      ');',
    ].join('\n');
  }
}
