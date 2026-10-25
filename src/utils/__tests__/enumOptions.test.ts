import { describe, expect, it } from 'vitest';
import { enumOptionsToText, parseEnumOptions } from '../enumOptions';

describe('parseEnumOptions', () => {
  it('parses an array of { label, value } objects', () => {
    const out = parseEnumOptions([
      { label: '红色', value: 'red' },
      { label: '蓝色', value: 'blue' },
    ]);
    expect(out).toEqual([
      { label: '红色', value: 'red' },
      { label: '蓝色', value: 'blue' },
    ]);
  });

  it('falls back to value when object has no label', () => {
    const out = parseEnumOptions([{ value: 'red' }]);
    expect(out).toEqual([{ label: 'red', value: 'red' }]);
  });

  it('falls back to label when object has no value', () => {
    const out = parseEnumOptions([{ label: '红色' }]);
    expect(out).toEqual([{ label: '红色', value: '红色' }]);
  });

  it('parses an array of primitive values', () => {
    const out = parseEnumOptions(['red', 'blue']);
    expect(out).toEqual([
      { label: 'red', value: 'red' },
      { label: 'blue', value: 'blue' },
    ]);
  });

  it('parses textarea text with label:value lines', () => {
    const out = parseEnumOptions('红色:red\n蓝色:blue');
    expect(out).toEqual([
      { label: '红色', value: 'red' },
      { label: '蓝色', value: 'blue' },
    ]);
  });

  it('uses line as both label and value when no colon', () => {
    const out = parseEnumOptions('red\nblue');
    expect(out).toEqual([
      { label: 'red', value: 'red' },
      { label: 'blue', value: 'blue' },
    ]);
  });

  it('skips blank lines in textarea text', () => {
    const out = parseEnumOptions('red\n\n  \nblue');
    expect(out).toHaveLength(2);
  });

  it('ignores empty entries in arrays', () => {
    const out = parseEnumOptions(['', null, undefined, 'red']);
    // '' / null / undefined 应当被过滤
    expect(out).toEqual([{ label: 'red', value: 'red' }]);
  });

  it('returns empty array for empty input', () => {
    expect(parseEnumOptions('')).toEqual([]);
    expect(parseEnumOptions([])).toEqual([]);
  });

  it('falls back to value when label slot is empty string', () => {
    const out = parseEnumOptions([{ label: '', value: 'red' }]);
    expect(out).toEqual([{ label: 'red', value: 'red' }]);
  });
});

describe('enumOptionsToText', () => {
  it('renders label:value when label differs from value', () => {
    const text = enumOptionsToText([
      { label: '红色', value: 'red' },
      { label: '蓝色', value: 'blue' },
    ]);
    expect(text).toBe('红色:red\n蓝色:blue');
  });

  it('renders value-only when label equals value', () => {
    const text = enumOptionsToText([
      { label: 'red', value: 'red' },
    ]);
    expect(text).toBe('red');
  });

  it('round-trips with parseEnumOptions', () => {
    const src = [
      { label: '红色', value: 'red' },
      { label: 'red', value: 'red' },
    ];
    const text = enumOptionsToText(src);
    const parsed = parseEnumOptions(text);
    expect(parsed).toEqual(src);
  });
});
