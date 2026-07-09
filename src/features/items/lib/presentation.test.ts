import { describe, expect, it } from 'vitest';
import { hopLabel, initials, warmPathLabel } from './presentation';

describe('initials', () => {
  it('takes up to two uppercased initials', () => {
    expect(initials('Jean Dupont')).toBe('JD');
    expect(initials('Sophie')).toBe('S');
    expect(initials('marie claire dubois')).toBe('MC');
  });

  it('is robust to extra whitespace and empty input', () => {
    expect(initials('  Alice   Martin  ')).toBe('AM');
    expect(initials('')).toBe('');
  });
});

describe('warmPathLabel', () => {
  it('renders the French degree label', () => {
    expect(warmPathLabel('first')).toBe('Chemin chaud · 1er degré');
    expect(warmPathLabel('second')).toBe('Chemin chaud · 2e degré');
    expect(warmPathLabel('third')).toBe('Chemin chaud · 3e degré');
  });
});

describe('hopLabel', () => {
  it('describes each degree and falls back for none', () => {
    expect(hopLabel('first')).toContain('1er degré');
    expect(hopLabel('second')).toContain('2e degré');
    expect(hopLabel('third')).toContain('3e degré');
    expect(hopLabel('none')).toBe('Aucun chemin');
  });
});
