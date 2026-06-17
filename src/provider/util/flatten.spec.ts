import { flattenJson, tryParseJsonObject } from './flatten';

describe('flattenJson', () => {
  it('returns flat keys for a shallow object', () => {
    expect(flattenJson({ a: 'x', b: 'y' })).toEqual({ a: 'x', b: 'y' });
  });

  it('flattens nested objects with dot notation', () => {
    expect(flattenJson({ db: { user: 'admin', pass: 's3cret' } })).toEqual({
      'db.user': 'admin',
      'db.pass': 's3cret',
    });
  });

  it('handles deeply nested objects', () => {
    expect(flattenJson({ a: { b: { c: { d: 'deep' } } } })).toEqual({
      'a.b.c.d': 'deep',
    });
  });

  it('coerces numbers and booleans to strings', () => {
    expect(flattenJson({ port: 5432, enabled: true })).toEqual({
      port: '5432',
      enabled: 'true',
    });
  });

  it('stringifies arrays', () => {
    expect(flattenJson({ tags: ['a', 'b', 'c'] })).toEqual({
      tags: '["a","b","c"]',
    });
  });

  it('stringifies null values', () => {
    expect(flattenJson({ x: null })).toEqual({ x: 'null' });
  });

  it('returns empty object for empty input', () => {
    expect(flattenJson({})).toEqual({});
  });

  it('mixes nested and scalar keys at same level', () => {
    expect(
      flattenJson({ db: { user: 'admin' }, api_key: 'abc123' }),
    ).toEqual({ 'db.user': 'admin', api_key: 'abc123' });
  });
});

describe('tryParseJsonObject', () => {
  it('parses a JSON object', () => {
    expect(tryParseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for a JSON array', () => {
    expect(tryParseJsonObject('[1,2,3]')).toBeNull();
  });

  it('returns null for a JSON scalar', () => {
    expect(tryParseJsonObject('"just a string"')).toBeNull();
    expect(tryParseJsonObject('42')).toBeNull();
    expect(tryParseJsonObject('true')).toBeNull();
  });

  it('returns null for a JSON null', () => {
    expect(tryParseJsonObject('null')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(tryParseJsonObject('not json at all')).toBeNull();
    expect(tryParseJsonObject('{broken')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(tryParseJsonObject('')).toBeNull();
  });
});
