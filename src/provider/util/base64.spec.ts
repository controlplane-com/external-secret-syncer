import { isBase64 } from './base64';

describe('isBase64', () => {
  it('accepts canonical base64 with padding', () => {
    expect(isBase64('aGVsbG8=')).toBe(true); // "hello"
    expect(isBase64('aGVsbG8gd29ybGQhIQ==')).toBe(true); // "hello world!!"
  });

  it('accepts canonical base64 without padding', () => {
    expect(isBase64('aGVsbG8h')).toBe(true); // "hello!"
  });

  it('accepts plain text that happens to be canonical base64', () => {
    // heuristic limitation, documented on the function
    expect(isBase64('test')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isBase64('')).toBe(false);
  });

  it('rejects lengths that are not a multiple of 4', () => {
    expect(isBase64('abc')).toBe(false);
    expect(isBase64('aGVsbG8')).toBe(false);
  });

  it('rejects characters outside the base64 alphabet', () => {
    expect(isBase64('hello world!')).toBe(false);
    expect(isBase64('aGVs bG8=')).toBe(false);
  });

  it('rejects surrounding whitespace (trimming is the caller’s job)', () => {
    expect(isBase64('aGVsbG8=\n')).toBe(false);
  });

  it('rejects base64-shaped but non-canonical strings', () => {
    expect(isBase64('ab==')).toBe(false); // canonical form is "aQ=="
    expect(isBase64('a===')).toBe(false);
  });
});
