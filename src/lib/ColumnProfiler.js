import { Buffer } from 'node:buffer';

const NUMERIC_TYPES = new Set([
  'integer',
  'decimal',
  'float',
]);

function mergeTypes(currentType, nextType) {
  if (currentType === null) {
    return nextType;
  }

  if (currentType === nextType) {
    return currentType;
  }

  if (
    NUMERIC_TYPES.has(currentType) &&
    NUMERIC_TYPES.has(nextType)
  ) {
    if (currentType === 'float' || nextType === 'float') {
      return 'float';
    }

    if (currentType === 'decimal' || nextType === 'decimal') {
      return 'decimal';
    }

    return 'integer';
  }

  if (
    (currentType === 'date' && nextType === 'datetime') ||
    (currentType === 'datetime' && nextType === 'date')
  ) {
    return 'datetime';
  }

  return 'string';
}

function compareIntegerStrings(left, right) {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);

  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

export class ColumnProfiler {
  constructor({
    sourceName,
    name,
    inferer,
    maximumExamples = 3,
  }) {
    this.sourceName = sourceName;
    this.name = name;
    this.inferer = inferer;
    this.maximumExamples = maximumExamples;

    this.totalCount = 0;
    this.emptyCount = 0;
    this.nonEmptyCount = 0;

    this.inferredType = null;

    this.maxLength = 0;
    this.maxBytes = 0;

    this.maxIntegerDigits = 0;
    this.maxScale = 0;

    this.minValue = null;
    this.maxValue = null;

    this.datetimeCount = 0;
    this.timezoneCount = 0;

    this.examples = [];
    this.exampleSet = new Set();
  }

  add(rawValue) {
    const originalValue = String(rawValue ?? '');

    this.totalCount += 1;

    this.maxLength = Math.max(
      this.maxLength,
      Array.from(originalValue).length,
    );

    this.maxBytes = Math.max(
      this.maxBytes,
      Buffer.byteLength(originalValue, 'utf8'),
    );

    const inferred = this.inferer.infer(originalValue);

    if (inferred.type === 'empty') {
      this.emptyCount += 1;
      return;
    }

    this.nonEmptyCount += 1;

    this.inferredType = mergeTypes(
      this.inferredType,
      inferred.type,
    );

    if (
      inferred.type === 'integer' ||
      inferred.type === 'decimal'
    ) {
      this.maxIntegerDigits = Math.max(
        this.maxIntegerDigits,
        inferred.integerDigits,
      );

      this.maxScale = Math.max(
        this.maxScale,
        inferred.scale,
      );
    }

    if (inferred.type === 'integer') {
      if (
        this.minValue === null ||
        compareIntegerStrings(inferred.value, this.minValue) < 0
      ) {
        this.minValue = inferred.value;
      }

      if (
        this.maxValue === null ||
        compareIntegerStrings(inferred.value, this.maxValue) > 0
      ) {
        this.maxValue = inferred.value;
      }
    }

    if (inferred.type === 'datetime') {
      this.datetimeCount += 1;

      if (inferred.hasTimezone) {
        this.timezoneCount += 1;
      }
    }

    if (
      this.examples.length < this.maximumExamples &&
      !this.exampleSet.has(inferred.value)
    ) {
      this.examples.push(inferred.value);
      this.exampleSet.add(inferred.value);
    }
  }

  getTimezoneMode() {
    if (this.datetimeCount === 0) {
      return null;
    }

    if (this.timezoneCount === 0) {
      return 'none';
    }

    if (this.timezoneCount === this.datetimeCount) {
      return 'all';
    }

    return 'mixed';
  }

  toResult() {
    const inferredType = this.inferredType ?? 'string';

    const precision =
      inferredType === 'integer' ||
      inferredType === 'decimal'
        ? this.maxIntegerDigits + this.maxScale
        : null;

    return {
      sourceName: this.sourceName,
      name: this.name,

      inferredType,

      totalCount: this.totalCount,
      nonEmptyCount: this.nonEmptyCount,
      emptyCount: this.emptyCount,

      nullableCandidate: this.emptyCount > 0,

      maxLength: this.maxLength,
      maxBytes: this.maxBytes,

      precision,
      scale:
        inferredType === 'decimal'
          ? this.maxScale
          : inferredType === 'integer'
            ? 0
            : null,

      minValue:
        inferredType === 'integer'
          ? this.minValue
          : null,

      maxValue:
        inferredType === 'integer'
          ? this.maxValue
          : null,

      timezoneMode: this.getTimezoneMode(),

      examples: this.examples,
    };
  }
}
