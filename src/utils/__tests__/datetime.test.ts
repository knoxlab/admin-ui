import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDateTimeSeconds,
  formatHourMinute,
  getDisplayTimezone,
  isValidTimezone,
  resetDisplayTimezone,
  setDisplayTimezone,
  DATE_FALLBACK,
} from '../datetime';

describe('datetime utils（全站时间展示口径统一）', () => {
  describe('formatDateTime', () => {
    it('formats a local date-time string as YYYY-MM-DD HH:mm', () => {
      expect(formatDateTime('2026-09-19T10:03:04')).toBe('2026-09-19 10:03');
    });

    it('接受 Date 与时间戳入参', () => {
      const date = new Date(2026, 8, 19, 10, 3, 4);
      expect(formatDateTime(date)).toBe('2026-09-19 10:03');
      expect(formatDateTime(date.getTime())).toBe('2026-09-19 10:03');
    });

    it('pad 到两位，不省略前导零', () => {
      expect(formatDateTime('2026-01-02T03:04:05')).toBe('2026-01-02 03:04');
    });

    it('null / undefined / 空串回退为缺省占位符', () => {
      expect(formatDateTime(null)).toBe(DATE_FALLBACK);
      expect(formatDateTime(undefined)).toBe(DATE_FALLBACK);
      expect(formatDateTime('')).toBe(DATE_FALLBACK);
    });

    it('无法解析的时间串回退，不渲染 Invalid Date', () => {
      expect(formatDateTime('not-a-date')).toBe(DATE_FALLBACK);
      expect(formatDateTime('2026 年 9 月 19 日')).toBe(DATE_FALLBACK);
    });

    it('支持自定义占位符（表格里的 - / N/A / ?）', () => {
      expect(formatDateTime(null, '-')).toBe('-');
      expect(formatDateTime('nope', 'N/A')).toBe('N/A');
      expect(formatDateTime('', '?')).toBe('?');
    });
  });

  describe('formatDateTimeSeconds', () => {
    it('保留秒级精度', () => {
      expect(formatDateTimeSeconds('2026-09-19T10:03:04')).toBe('2026-09-19 10:03:04');
    });

    it('缺省回退与自定义占位符一致', () => {
      expect(formatDateTimeSeconds(null)).toBe(DATE_FALLBACK);
      expect(formatDateTimeSeconds(null, '—')).toBe('—');
    });
  });

  describe('formatDate', () => {
    it('只保留日期部分', () => {
      expect(formatDate('2026-09-19T10:03:04')).toBe('2026-09-19');
    });

    it('缺失值回退', () => {
      expect(formatDate(null)).toBe(DATE_FALLBACK);
      expect(formatDate('oops', '∞')).toBe('∞');
    });
  });

  /**
   * 实时监控的分钟曲线回归：后端回带 Z 的 UTC 瞬时（`2026-10-22T12:58:00Z`），
   * 修复前前端直接 slice(11, 16) 把 UTC 墙钟上屏，东八区差 8 小时。
   */
  describe('formatHourMinute', () => {
    afterEach(() => {
      resetDisplayTimezone();
    });

    it('带 Z 的 UTC 瞬时按展示时区取时分（不再对 ISO 串裸切片）', () => {
      setDisplayTimezone('Asia/Shanghai');
      expect(formatHourMinute('2026-10-22T12:58:00Z')).toBe('20:58');

      setDisplayTimezone('America/New_York');
      expect(formatHourMinute('2026-10-22T12:58:00Z')).toBe('08:58');
    });

    it('未配置时区时按浏览器本地时区渲染', () => {
      expect(formatHourMinute(new Date(2026, 9, 22, 20, 58))).toBe('20:58');
    });

    it('缺失 / 非法值回退占位符', () => {
      expect(formatHourMinute(null)).toBe(DATE_FALLBACK);
      expect(formatHourMinute('nope', '-')).toBe('-');
    });
  });

  /**
   * DEF-CFG-03：组织设置 `defaultTimezone` 的语义是「后台展示时区（不以浏览器时区为准）」，
   * 修复前该字段只落库、无任何消费点。这里锁定展示时区的三个契约：
   * 未配置时保持历史行为、配置后按该时区重投影、非法值退化为未配置（而非渲染炸掉）。
   */
  describe('展示时区（DEF-CFG-03 defaultTimezone）', () => {
    /** UTC 瞬时常量：在 Asia/Shanghai 是 12:00，在 America/New_York 是 00:00（同日）。 */
    const UTC_NOON = '2026-09-19T04:00:00Z';

    afterEach(() => {
      resetDisplayTimezone();
    });

    it('未配置时不改变历史行为（浏览器本地时区）', () => {
      expect(getDisplayTimezone()).toBeNull();
      const expected = new Date(UTC_NOON);
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(formatDateTime(UTC_NOON)).toBe(
        `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())} ${pad(expected.getHours())}:${pad(expected.getMinutes())}`,
      );
    });

    it('配置后按该时区重投影（两个时区必然不同）', () => {
      setDisplayTimezone('Asia/Shanghai');
      const shanghai = formatDateTime(UTC_NOON);

      setDisplayTimezone('America/New_York');
      const newYork = formatDateTime(UTC_NOON);

      expect(shanghai).toBe('2026-09-19 12:00');
      expect(newYork).toBe('2026-09-19 00:00');
      expect(shanghai).not.toBe(newYork);
    });

    it('秒级与日期精度同样跟随展示时区', () => {
      setDisplayTimezone('America/New_York');

      expect(formatDateTimeSeconds(UTC_NOON)).toBe('2026-09-19 00:00:00');
      expect(formatDate(UTC_NOON)).toBe('2026-09-19');
    });

    it('非法 / 空时区退化为未配置，不影响其余格式化', () => {
      setDisplayTimezone('Not/AZone');
      expect(getDisplayTimezone()).toBeNull();
      setDisplayTimezone('   ');
      expect(getDisplayTimezone()).toBeNull();
      setDisplayTimezone(null);
      expect(getDisplayTimezone()).toBeNull();
      // 退化后仍能正常渲染，不出现 Invalid Date
      expect(formatDateTime('2026-09-19T10:03:04')).toBe('2026-09-19 10:03');
    });

    it('isValidTimezone 拦未知时区、放行 IANA 名称', () => {
      expect(isValidTimezone('Asia/Shanghai')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Not/AZone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });
});
