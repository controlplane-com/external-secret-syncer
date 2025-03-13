import { DurationSchema, toMillis } from './common';

test('duration schema', () => {
  const valid = ['4h', '1m', '5s', '5h4m1s', '5m1s', '7h3s'];
  const invalid = ['4', '4m1', '4h1', '4s1', '5s4m', 's', 'm', 'h', undefined];

  for (const value of valid) {
    expect(() => DurationSchema.parse(value)).not.toThrow();
  }

  for (const value of invalid) {
    expect(() => DurationSchema.parse(value)).toThrow();
  }
});

test('toMillis', () => {
  const testCases = [
    { input: '', expected: 0 },
    { input: '4h', expected: 14400000 },
    { input: '1m', expected: 60000 },
    { input: '5s', expected: 5000 },
    { input: '5h4m1s', expected: 18241000 },
    { input: '5m1s', expected: 301000 },
    { input: '7h3s', expected: 25203000 },
  ];

  for (const { input, expected } of testCases) {
    expect(toMillis(input)).toBe(expected);
  }
});

test('optional duration', () => {
  const OptionalDurationSchema = DurationSchema.optional();

  expect(() => OptionalDurationSchema.parse(undefined)).not.toThrow();
  expect(OptionalDurationSchema.parse(undefined)).toBe(undefined);
});
