const INTEGER_PATTERN = /^[+-]?(?:0|[1-9]\d*)$/;

const DECIMAL_PATTERN =
  /^[+-]?(?:0|[1-9]\d*)\.\d+$/;

const FLOAT_PATTERN =
  /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d+)?)[eE][+-]?\d+$/;

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getNumericSize(value) {
  const unsignedValue = value.replace(/^[+-]/, '');
  const [wholePart, fractionalPart = ''] = unsignedValue.split('.');

  return {
    integerDigits: wholePart.length,
    scale: fractionalPart.length,
  };
}

function parseDate(value) {
  const match = value.match(DATE_PATTERN);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  if (!isValidDateParts(Number(year), Number(month), Number(day))) {
    return null;
  }

  return {
    type: 'date',
  };
}

function parseDateTime(value) {
  const match = value.match(DATETIME_PATTERN);

  if (!match) {
    return null;
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = '0',
    ,
    timezone,
  ] = match;

  if (!isValidDateParts(Number(year), Number(month), Number(day))) {
    return null;
  }

  if (
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return null;
  }

  if (timezone && timezone !== 'Z') {
    const [timezoneHour, timezoneMinute] = timezone
      .slice(1)
      .split(':')
      .map(Number);

    if (timezoneHour > 23 || timezoneMinute > 59) {
      return null;
    }
  }

  return {
    type: 'datetime',
    hasTimezone: Boolean(timezone),
  };
}

export class ValueTypeInferer {
  infer(rawValue) {
    const value = String(rawValue ?? '').trim();

    if (value === '') {
      return {
        type: 'empty',
        value,
      };
    }

    if (/^(true|false)$/i.test(value)) {
      return {
        type: 'boolean',
        value,
      };
    }

    const date = parseDate(value);

    if (date) {
      return {
        ...date,
        value,
      };
    }

    const dateTime = parseDateTime(value);

    if (dateTime) {
      return {
        ...dateTime,
        value,
      };
    }

    if (INTEGER_PATTERN.test(value)) {
      return {
        type: 'integer',
        value,
        ...getNumericSize(value),
      };
    }

    if (DECIMAL_PATTERN.test(value)) {
      return {
        type: 'decimal',
        value,
        ...getNumericSize(value),
      };
    }

    if (FLOAT_PATTERN.test(value)) {
      return {
        type: 'float',
        value,
      };
    }

    return {
      type: 'string',
      value,
    };
  }
}
