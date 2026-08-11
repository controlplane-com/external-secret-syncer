import { describe, it, expect } from '@jest/globals';
import { sanitizeCplnName } from './util';

describe('sanitizeCplnName', () => {
  it('leaves an already-valid name unchanged', () => {
    expect(sanitizeCplnName('db-password')).toBe('db-password');
  });

  it('lowercases uppercase characters', () => {
    expect(sanitizeCplnName('DATABASE_URL')).toBe('database-url');
  });

  it('replaces invalid characters with hyphens', () => {
    expect(sanitizeCplnName('Service.Token')).toBe('service-token');
    expect(sanitizeCplnName('my@api#key')).toBe('my-api-key');
  });

  it('collapses runs of hyphens', () => {
    expect(sanitizeCplnName('a___b')).toBe('a-b');
  });

  it('trims leading and trailing hyphens', () => {
    expect(sanitizeCplnName('_leading')).toBe('leading');
    expect(sanitizeCplnName('trailing_')).toBe('trailing');
  });

  it('prefixes names that do not start with a letter', () => {
    expect(sanitizeCplnName('123abc')).toBe('s-123abc');
    expect(sanitizeCplnName('-9')).toBe('s-9');
  });

  it('caps length at 63 characters without a trailing hyphen', () => {
    const result = sanitizeCplnName('a'.repeat(70));
    expect(result.length).toBe(63);
    expect(result.endsWith('-')).toBe(false);
  });

  it('falls back to "secret" when nothing valid remains', () => {
    expect(sanitizeCplnName('___')).toBe('secret');
    expect(sanitizeCplnName('')).toBe('secret');
  });
});
