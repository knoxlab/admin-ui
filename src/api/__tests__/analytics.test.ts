import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { analyticsRange } from '../analytics';

describe('analyticsRange', () => {
  beforeEach(() => {
    // Fix the date to 2026-09-04 for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('today()', () => {
    it('returns [today, today] as [from, to]', () => {
      const [from, to] = analyticsRange.today();
      expect(from).toBe('2026-09-04');
      expect(to).toBe('2026-09-04');
    });
  });

  describe('last7()', () => {
    it('returns a 7-day range ending today', () => {
      const [from, to] = analyticsRange.last7();
      expect(to).toBe('2026-09-04');
      expect(from).toBe('2026-08-29');
    });

    it('has from exactly 6 days before to', () => {
      const [from, to] = analyticsRange.last7();
      const fromDate = new Date(from + 'T00:00:00');
      const toDate = new Date(to + 'T00:00:00');
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(6);
    });
  });
});
