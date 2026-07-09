import { describe, expect, it } from 'vitest';
import { parseBearerToken } from './parse-bearer';

describe('parseBearerToken', () => {
  it.each([
    ['Bearer abc123', 'abc123'],
    ['bearer abc123', 'abc123'], // scheme is case-insensitive
    ['BEARER abc123', 'abc123'],
    ['Bearer   abc123', 'abc123'], // extra spaces after the scheme
    ['  Bearer abc123  ', 'abc123'], // surrounding whitespace
  ])('parses %j -> %j', (header, expected) => {
    expect(parseBearerToken(header)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['abc123'], // no scheme
    ['Bearer'], // scheme only
    ['Bearer '], // scheme, no token
    ['Bearer    '], // scheme, whitespace only
    ['Basic abc123'], // wrong scheme
    ['Bearerabc123'], // no separator
    ['Bearer abc def'], // internal whitespace — malformed per RFC 6750
  ])('rejects %j -> null', (header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});
