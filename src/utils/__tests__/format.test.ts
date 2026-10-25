import { describe, expect, it } from 'vitest';
import { formatBytes, FORMAT_FALLBACK } from '../format';

describe('formatBytes（流量列可读化）', () => {
  it('字节级不带小数', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('KB / MB / GB 按 1024 进制保留一位小数', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(48265008)).toBe('46.0 MB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GB');
  });

  it('大数封顶到 TB，不出现科学计数法', () => {
    expect(formatBytes(1024 ** 4 * 3)).toBe('3.0 TB');
  });

  it('null / undefined / 非数字 / 负数回退占位符（不渲染 NaN B）', () => {
    expect(formatBytes(null)).toBe(FORMAT_FALLBACK);
    expect(formatBytes(undefined)).toBe(FORMAT_FALLBACK);
    expect(formatBytes(Number.NaN)).toBe(FORMAT_FALLBACK);
    expect(formatBytes(-1)).toBe(FORMAT_FALLBACK);
  });

  it('支持自定义占位符', () => {
    expect(formatBytes(null, '-')).toBe('-');
  });
});
