import { describe, expect, it } from 'vitest';
import type { Category } from '../../api/types';
import {
  buildClassificationTemplate,
  CLASSIFICATION_CHILD_CODES,
  resolveTaxonomyRootsFromTree,
  type TaxonomyRoots,
} from '../classificationTemplate';

function cat(id: string, name: string, pathAlias: string, children?: Category[]): Category {
  return {
    id,
    name,
    pathAlias,
    sortOrder: 0,
    depth: 0,
    children,
  };
}

describe('resolveTaxonomyRootsFromTree', () => {
  it('resolves known root aliases from a flat tree', () => {
    const tree: Category[] = [
      cat('r1', '主表', 'sarft-program-class'),
      cat('r2', '总论复分', 'gyz199-general'),
      cat('r3', '世界地区', 'gyz199-world'),
      cat('r4', '中国地区', 'gyz199-china'),
      cat('r5', '中国民族', 'gyz199-nation'),
      cat('r6', '歌曲专类', 'gyz199-special-song'),
    ];
    const roots = resolveTaxonomyRootsFromTree(tree);
    expect(roots.program).toBe('r1');
    expect(roots.general).toBe('r2');
    expect(roots.world).toBe('r3');
    expect(roots.china).toBe('r4');
    expect(roots.nation).toBe('r5');
    expect(roots.special_song).toBe('r6');
  });

  it('resolves roots from nested children', () => {
    const tree: Category[] = [
      cat('root', 'Root', 'root', [
        cat('r1', '主表', 'sarft-program-class'),
        cat('r2', '总论', 'gyz199-general'),
      ]),
    ];
    const roots = resolveTaxonomyRootsFromTree(tree);
    expect(roots.program).toBe('r1');
    expect(roots.general).toBe('r2');
  });

  it('returns empty object when no aliases match', () => {
    const tree: Category[] = [cat('x', 'Other', 'other')];
    const roots = resolveTaxonomyRootsFromTree(tree);
    expect(roots).toEqual({});
  });

  it('returns empty object for empty tree', () => {
    expect(resolveTaxonomyRootsFromTree([])).toEqual({});
  });
});

describe('buildClassificationTemplate', () => {
  it('returns 9 child fields and a compose config', () => {
    const roots: TaxonomyRoots = {
      program: 'p1',
      general: 'g1',
      world: 'w1',
      china: 'c1',
      nation: 'n1',
      special_song: 's1',
    };
    const { children, compose } = buildClassificationTemplate('class_rg', roots);
    expect(children).toHaveLength(9);
    expect(compose).toBeDefined();
    expect(compose.order).toBeDefined();
  });

  it('assigns correct codes to each child field', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('class_rg', roots);
    const codes = children.map((c) => c.code);
    expect(codes).toEqual([...CLASSIFICATION_CHILD_CODES]);
  });

  it('assigns correct composeRole to each child', () => {
    const roots: TaxonomyRoots = { program: 'p1' };
    const { children } = buildClassificationTemplate('class_rg', roots);
    const roleMap = Object.fromEntries(children.map((c) => [c.code, c.fieldConfig?.composeRole]));
    expect(roleMap.program_class).toBe('base');
    expect(roleMap.class_imitation).toBe('imitation');
    expect(roleMap.class_special).toBe('special');
    expect(roleMap.class_world).toBe('world');
    expect(roleMap.class_china).toBe('china');
    expect(roleMap.class_nation).toBe('nation');
    expect(roleMap.class_general).toBe('general');
    // class_number and class_caption don't have composeRole
    expect(roleMap.class_number).toBeUndefined();
    expect(roleMap.class_caption).toBeUndefined();
  });

  it('sets taxonomyRoot from roots when provided', () => {
    const roots: TaxonomyRoots = { program: 'p1', world: 'w1' };
    const { children } = buildClassificationTemplate('class_rg', roots);
    const programField = children.find((c) => c.code === 'program_class');
    const worldField = children.find((c) => c.code === 'class_world');
    expect(programField?.fieldConfig?.taxonomyRoot).toBe('p1');
    expect(worldField?.fieldConfig?.taxonomyRoot).toBe('w1');
  });

  it('omits taxonomyRoot when root is undefined', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('class_rg', roots);
    const programField = children.find((c) => c.code === 'program_class');
    expect(programField?.fieldConfig?.taxonomyRoot).toBeUndefined();
  });

  it('uses parentCode as REPEAT_PARENT_KEY in all field configs', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('my_rg', roots);
    for (const child of children) {
      expect(child.fieldConfig?.__repeatParent).toBe('my_rg');
    }
  });

  it('marks class_number as composeOutput', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('class_rg', roots);
    const numField = children.find((c) => c.code === 'class_number');
    expect(numField?.fieldConfig?.composeOutput).toBe(true);
  });

  it('marks class_caption as composeCaption', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('class_rg', roots);
    const capField = children.find((c) => c.code === 'class_caption');
    expect(capField?.fieldConfig?.composeCaption).toBe(true);
  });

  it('class_number is filterable but class_caption is not', () => {
    const roots: TaxonomyRoots = {};
    const { children } = buildClassificationTemplate('class_rg', roots);
    const numField = children.find((c) => c.code === 'class_number');
    const capField = children.find((c) => c.code === 'class_caption');
    expect(numField?.filterable).toBe(true);
    expect(capField?.filterable).toBe(false);
  });
});

describe('CLASSIFICATION_CHILD_CODES', () => {
  it('contains exactly 9 codes', () => {
    expect(CLASSIFICATION_CHILD_CODES).toHaveLength(9);
  });

  it('starts with program_class and ends with class_caption', () => {
    expect(CLASSIFICATION_CHILD_CODES[0]).toBe('program_class');
    expect(CLASSIFICATION_CHILD_CODES[8]).toBe('class_caption');
  });
});
