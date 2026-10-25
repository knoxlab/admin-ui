import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  versionFieldLabel, versionSnapshotRows, ITEM_FIELD_LABELS,
  resolveRevertedFrom, defaultDiffRange, diffRangeWithSource,
  diffRangeFromVersion, modelVersionChange,
  sliceVersionPage, diffRangeWithPrevious, diffRangeWithCurrent, VERSION_PAGE_SIZE,
} from '../contentVersion';
import type { FieldDef } from '../../api/types';

vi.mock('../../i18n/locale', () => ({
  t: (zh: string, vars?: Record<string, string | number>) => {
    let out = `T:${zh}`;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
    return out;
  },
}));

function field(code: string, name: string): FieldDef {
  return { code, name, fieldType: 'TEXT', required: false, sortOrder: 0 } as FieldDef;
}

describe('contentVersion utils（FR-CV-VER-001/003 版本快照展示）', () => {
  beforeEach(() => {
    // nothing
  });

  describe('versionFieldLabel', () => {
    it('maps item-level system fields to their fixed labels instead of model fields', () => {
      expect(versionFieldLabel('title', [])).toBe(`T:${ITEM_FIELD_LABELS.title}`);
      expect(versionFieldLabel('routePath', [])).toBe(`T:${ITEM_FIELD_LABELS.routePath}`);
      expect(versionFieldLabel('templatePath', [])).toBe(`T:${ITEM_FIELD_LABELS.templatePath}`);
    });

    it('prefers the item-level mapping over a same-named model field', () => {
      // 模型里恰好也有个叫 title 的字段时，仍应按条目级语义展示
      expect(versionFieldLabel('title', [field('title', '模型标题')]))
        .toBe(`T:${ITEM_FIELD_LABELS.title}`);
    });

    it('resolves model field codes to their display names', () => {
      expect(versionFieldLabel('summary_t', [field('summary_t', '摘要')])).toBe('摘要');
    });

    it('falls back to the raw code when the field is not in the model', () => {
      expect(versionFieldLabel('legacy_field', [field('body_t', '正文')])).toBe('legacy_field');
    });
  });

  describe('versionSnapshotRows', () => {
    const fields = [field('summary_t', '摘要'), field('body_t', '正文')];

    it('flattens field values into labelled rows', () => {
      const rows = versionSnapshotRows(
        { fieldValues: '{"summary_t":"旧摘要","body_t":"正文"}' },
        fields,
      );

      expect(rows).toEqual([
        { code: 'summary_t', label: '摘要', text: '旧摘要' },
        { code: 'body_t', label: '正文', text: '正文' },
      ]);
    });

    it('renders composite values as pretty JSON instead of guessing child labels', () => {
      const rows = versionSnapshotRows(
        { fieldValues: '{"episodes":[{"title":"第 1 集"}]}' },
        fields,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].label).toBe('episodes');
      expect(rows[0].text).toContain('"title": "第 1 集"');
    });

    it('renders empty values as an empty string so the table can show a placeholder', () => {
      const rows = versionSnapshotRows({ fieldValues: '{"summary_t":null,"body_t":""}' }, fields);

      expect(rows.map((r) => r.text)).toEqual(['', '']);
    });

    it('tolerates malformed or non-object payloads without losing data', () => {
      expect(versionSnapshotRows({ fieldValues: 'not-json' }, fields)).toEqual([
        { code: '__raw__', label: 'T:原始数据', text: 'not-json' },
      ]);
      expect(versionSnapshotRows({ fieldValues: '[1,2]' }, fields)).toEqual([]);
      expect(versionSnapshotRows({ fieldValues: '' }, fields)).toEqual([]);
    });

    it('keeps numeric and boolean values readable', () => {
      const rows = versionSnapshotRows({ fieldValues: '{"views":3,"featured":true}' }, fields);

      expect(rows).toEqual([
        { code: 'views', label: 'views', text: '3' },
        { code: 'featured', label: 'featured', text: 'true' },
      ]);
    });
  });

  describe('resolveRevertedFrom（OBS-11-10 来源版本收敛）', () => {
    const chain = [{ version: 1 }, { version: 2 }, { version: 3 }];

    it('returns the source version when it exists in the version chain', () => {
      expect(resolveRevertedFrom({ version: 3, revertedFrom: 1 }, chain)).toBe(1);
    });

    it('returns null for versions that were not produced by a restore', () => {
      expect(resolveRevertedFrom({ version: 3 }, chain)).toBeNull();
      expect(resolveRevertedFrom({ version: 3, revertedFrom: null }, chain)).toBeNull();
    });

    it('ignores dangling references or self references so the UI never requests an impossible diff', () => {
      expect(resolveRevertedFrom({ version: 9, revertedFrom: 7 }, chain)).toBeNull();
      expect(resolveRevertedFrom({ version: 3, revertedFrom: 3 }, chain)).toBeNull();
      expect(resolveRevertedFrom({ version: 3, revertedFrom: 1.5 }, chain)).toBeNull();
    });
  });

  describe('defaultDiffRange（OBS-11-10 默认对比区间）', () => {
    it('defaults to previous → newest for ordinary saves', () => {
      expect(defaultDiffRange([{ version: 3 }, { version: 1 }, { version: 2 }]))
        .toEqual({ from: 2, to: 3 });
    });

    it('defaults to source → newest when the newest version came from a restore', () => {
      const range = defaultDiffRange([
        { version: 1 }, { version: 2 }, { version: 3, revertedFrom: 1 },
      ]);

      expect(range).toEqual({ from: 1, to: 3 });
    });

    it('falls back to previous → newest when the recorded source is not comparable', () => {
      // 来源版本已被清理 / 引用了别的内容条目版本：退回既有的「上一版本 → 最新版本」
      expect(defaultDiffRange([{ version: 2 }, { version: 3, revertedFrom: 99 }]))
        .toEqual({ from: 2, to: 3 });
    });

    it('returns null when there are fewer than two versions', () => {
      expect(defaultDiffRange([])).toBeNull();
      expect(defaultDiffRange([{ version: 1 }])).toBeNull();
    });
  });

  describe('diffRangeWithSource（OBS-11-10 行内「与来源版本对比」）', () => {
    const chain = [{ version: 1 }, { version: 2 }, { version: 5, revertedFrom: 1 }];

    it('builds source → row range for restored versions', () => {
      expect(diffRangeWithSource({ version: 5, revertedFrom: 1 }, chain)).toEqual({ from: 1, to: 5 });
    });

    it('returns null for rows without a usable source version', () => {
      expect(diffRangeWithSource({ version: 2 }, chain)).toBeNull();
      expect(diffRangeWithSource({ version: 5, revertedFrom: 4 }, chain)).toBeNull();
    });
  });

  describe('diffRangeFromVersion（规范 §15.2 行内「与指定版本对比」）', () => {
    const chain = [{ version: 3 }, { version: 1 }, { version: 2 }];

    it('uses the row as start and the newest version as end, regardless of array order', () => {
      expect(diffRangeFromVersion({ version: 1 }, chain)).toEqual({ from: 1, to: 3 });
      expect(diffRangeFromVersion({ version: 2 }, chain)).toEqual({ from: 2, to: 3 });
    });

    it('works for ordinary versions too, unlike the source-version entry', () => {
      expect(diffRangeFromVersion({ version: 2 }, chain)).not.toBeNull();
      expect(diffRangeWithSource({ version: 2 }, chain)).toBeNull();
    });

    it('returns null for the newest row so the UI does not offer an empty comparison', () => {
      expect(diffRangeFromVersion({ version: 3 }, chain)).toBeNull();
    });

    it('returns null when the chain has fewer than two versions', () => {
      expect(diffRangeFromVersion({ version: 1 }, [])).toBeNull();
      expect(diffRangeFromVersion({ version: 1 }, [{ version: 1 }])).toBeNull();
    });
  });

  describe('modelVersionChange（规范 §15.4「模型变更」提示）', () => {
    const rows = [
      { version: 1, modelVersion: 1 },
      { version: 2, modelVersion: 1 },
      { version: 3, modelVersion: 2 },
    ];

    it('reports the change when the two ends use different model versions', () => {
      expect(modelVersionChange(rows, 1, 3)).toEqual({
        from: 1, fromModelVersion: 1, to: 3, toModelVersion: 2,
      });
    });

    it('stays silent when both ends share the same model version', () => {
      expect(modelVersionChange(rows, 1, 2)).toBeNull();
    });

    it('stays silent for incomplete or unknown ranges', () => {
      expect(modelVersionChange(rows, null, 3)).toBeNull();
      expect(modelVersionChange(rows, 1, null)).toBeNull();
      expect(modelVersionChange(rows, 1, 99)).toBeNull();
      expect(modelVersionChange([], 1, 3)).toBeNull();
    });
  });

  describe('sliceVersionPage（规范 §15.1 时间线「加载更多」，FR-CV-VER-006）', () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ version: 45 - i }));

    it('exposes the first page and reports more rows when the chain is longer than one page', () => {
      const page = sliceVersionPage(rows);
      expect(page.rows).toHaveLength(VERSION_PAGE_SIZE);
      expect(page.rows[0]).toEqual({ version: 45 });
      expect(page.hasMore).toBe(true);
    });

    it('grows by one page per "load more" and stops reporting more at the end', () => {
      const second = sliceVersionPage(rows, 40);
      expect(second.rows).toHaveLength(40);
      expect(second.hasMore).toBe(true);

      const last = sliceVersionPage(rows, 60);
      expect(last.rows).toHaveLength(45);
      expect(last.hasMore).toBe(false);
    });

    it('never renders an empty timeline when the shown count is 0 or negative', () => {
      expect(sliceVersionPage(rows, 0).rows).toHaveLength(20);
      expect(sliceVersionPage(rows, -5).rows).toHaveLength(20);
    });

    it('handles chains shorter than a page without a "load more" affordance', () => {
      const page = sliceVersionPage([{ version: 2 }, { version: 1 }]);
      expect(page.rows).toHaveLength(2);
      expect(page.hasMore).toBe(false);
    });
  });

  describe('diffRangeWithPrevious / diffRangeWithCurrent（FR-CV-VER-007 版本操作）', () => {
    const chain = [{ version: 3 }, { version: 2 }, { version: 1 }];

    it('compares a version against the closest older version, regardless of chain order', () => {
      expect(diffRangeWithPrevious({ version: 3 }, chain)).toEqual({ from: 2, to: 3 });
      expect(diffRangeWithPrevious({ version: 2 }, chain)).toEqual({ from: 1, to: 2 });
    });

    it('falls back to the empty version for the very first version instead of disabling the action', () => {
      // 后端把 fromVersion=0 定义为「与空版本比较、全部字段 ADDED」
      expect(diffRangeWithPrevious({ version: 1 }, chain)).toEqual({ from: 0, to: 1 });
    });

    it('keeps the range oriented old → new when the row is newer than the current version', () => {
      expect(diffRangeWithCurrent({ version: 2 }, 5)).toEqual({ from: 2, to: 5 });
      expect(diffRangeWithCurrent({ version: 9 }, 5)).toEqual({ from: 5, to: 9 });
    });

    it('returns null when the row is the current version (nothing to compare)', () => {
      expect(diffRangeWithCurrent({ version: 5 }, 5)).toBeNull();
    });
  });
});
