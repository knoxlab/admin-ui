import { describe, expect, it } from 'vitest';
import {
  codeInRange,
  composeClassNumber,
  findImitationRule,
  flattenRegionTree,
  gyz199Subdivision,
  imitationSuffix,
  regionToTreeData,
  resolveSpecialTables,
  type RegionNode,
} from '../gyz199Compose';

describe('findImitationRule', () => {
  it('matches a base code declared in imitation rules', () => {
    const rule = findImitationRule('J1689');
    expect(rule).toBeDefined();
    expect(rule?.label).toContain('仿中国音乐');
    expect(rule?.order).toContain('imitation');
  });

  it('returns undefined for codes not in any rule', () => {
    expect(findImitationRule('Z99')).toBeUndefined();
    expect(findImitationRule('')).toBeUndefined();
  });
});

describe('codeInRange', () => {
  it('returns true when code is inside the inclusive range', () => {
    expect(codeInRange('J1650', 'J1613', 'J1685')).toBe(true);
    expect(codeInRange('J1613', 'J1613', 'J1685')).toBe(true);
    expect(codeInRange('J1685', 'J1613', 'J1685')).toBe(true);
  });

  it('returns false when code is outside the range', () => {
    expect(codeInRange('J1700', 'J1613', 'J1685')).toBe(false);
    expect(codeInRange('J1600', 'J1613', 'J1685')).toBe(false);
  });

  it('returns false when code starts with a different letter family', () => {
    expect(codeInRange('K1650', 'J1613', 'J1685')).toBe(false);
  });

  it('rejects codes that are too short', () => {
    expect(codeInRange('J', 'J1613', 'J1685')).toBe(false);
  });
});

describe('imitationSuffix', () => {
  it('strips the given prefix from the full code', () => {
    expect(imitationSuffix('J1625', 'J16')).toBe('25');
  });

  it('returns the original when the prefix does not match', () => {
    expect(imitationSuffix('K1625', 'J16')).toBe('K1625');
  });
});

describe('resolveSpecialTables', () => {
  it('includes song table for J1619 base codes', () => {
    const tables = resolveSpecialTables('J1619');
    const keys = tables.map((t) => t.title);
    expect(keys.some((k) => k.includes('歌曲'))).toBe(true);
  });

  it('includes instrumental table for J1621/J1635 base codes', () => {
    expect(resolveSpecialTables('J1621').some((t) => t.title.includes('器乐'))).toBe(true);
    expect(resolveSpecialTables('J1635').some((t) => t.title.includes('器乐'))).toBe(true);
  });

  it('includes politics_country for A39', () => {
    const tables = resolveSpecialTables('A39');
    expect(tables.some((t) => t.title.includes('政治'))).toBe(true);
  });

  it('includes hk_mo for A3613/A3623', () => {
    expect(resolveSpecialTables('A3613').some((t) => t.title.includes('港澳'))).toBe(true);
    expect(resolveSpecialTables('A3623').some((t) => t.title.includes('港澳'))).toBe(true);
  });

  it('returns empty for unrelated base code', () => {
    expect(resolveSpecialTables('B12')).toEqual([]);
  });
});

describe('composeClassNumber', () => {
  it('uses defaultOrder when parts.order is empty', () => {
    const out = composeClassNumber({
      baseCode: 'J1689',
      imitationSuffix: '25',
      generalCode: '05',
    });
    // defaultOrder: imitation, special, world, china, nation, general
    // Only segments with non-empty values are appended; general is appended with a "-" prefix.
    expect(out.classNumber).toBe('J1689 25-05');
    // classCaption is empty because no *_Name was supplied for the chosen segments.
    expect(out.classCaption).toBe('');
  });

  it('joins labels with single spaces when names are provided', () => {
    const out = composeClassNumber({
      baseCode: 'J1689',
      baseName: '中国音乐',
      imitationSuffix: '25',
      imitationName: '民歌',
      generalCode: '05',
      generalName: '总论',
    });
    expect(out.classNumber).toBe('J1689 25-05');
    expect(out.classCaption).toBe('中国音乐 民歌 总论');
  });

  it('respects custom order when provided', () => {
    const out = composeClassNumber({
      baseCode: 'F89',
      worldCode: 'US',
      generalCode: '01',
      order: ['world', 'general'],
    });
    expect(out.classNumber).toBe('F89<US>-01');
  });

  it('wraps world/china/nation with their respective brackets', () => {
    const out = composeClassNumber({
      baseCode: 'X',
      worldCode: 'US',
      chinaCode: 'BJ',
      nationCode: 'ZH',
      order: ['world', 'china', 'nation'],
    });
    expect(out.classNumber).toBe('X<US>(BJ){ZH}');
  });

  it('prefixes general with "-"', () => {
    const out = composeClassNumber({ baseCode: 'X', generalCode: '09' });
    expect(out.classNumber).toBe('X-09');
  });

  it('omits segments when their code is missing', () => {
    const out = composeClassNumber({ baseCode: 'X' });
    expect(out.classNumber).toBe('X');
    expect(out.classCaption).toBe('');
  });

  it('joins labels with single spaces', () => {
    const out = composeClassNumber({
      baseCode: 'J1689',
      baseName: '中国音乐',
      imitationSuffix: '25',
      imitationName: '民歌',
    });
    expect(out.classCaption).toBe('中国音乐 民歌');
  });
});

describe('flattenRegionTree', () => {
  it('walks tree in depth-first pre-order', () => {
    const tree: RegionNode[] = [
      {
        code: '1',
        name: 'Asia',
        children: [
          { code: '11', name: 'China' },
          { code: '12', name: 'Japan' },
        ],
      },
      { code: '2', name: 'Europe' },
    ];
    const flat = flattenRegionTree(tree);
    expect(flat.map((n) => n.code)).toEqual(['1', '11', '12', '2']);
  });

  it('returns empty array for empty input', () => {
    expect(flattenRegionTree([])).toEqual([]);
  });
});

describe('regionToTreeData', () => {
  it('produces antd-compatible tree nodes with title and value', () => {
    const tree: RegionNode[] = [
      { code: '1', name: 'Asia', children: [{ code: '11', name: 'China' }] },
    ];
    const out = regionToTreeData(tree);
    expect(out[0].title).toBe('1 Asia');
    expect(out[0].value).toBe('1');
    expect(out[0].children?.[0].title).toBe('11 China');
  });

  it('omits children property when node has no children', () => {
    const out = regionToTreeData([{ code: '1', name: 'X' }]);
    expect(out[0].children).toBeUndefined();
  });
});

describe('gyz199Subdivision data integrity', () => {
  it('exposes defaultOrder with the expected leading segment', () => {
    expect(gyz199Subdivision.defaultOrder[0]).toBe('imitation');
  });
});
