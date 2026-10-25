import { describe, expect, it } from 'vitest';
import type { ContentType, FieldDef, LayoutElement } from '../../api/types';
import { collectFields } from '../contentFields';

const field = (code: string, fieldType = 'TEXT', sortOrder = 0): FieldDef => ({
  code,
  name: code,
  fieldType,
  required: false,
  sortOrder,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
});

const type = (partial: Partial<ContentType>): ContentType => ({ id: 't1', siteId: 's1', code: 'c', name: 'c', version: 1, status: 'PUBLISHED', ...partial }) as ContentType;

/**
 * 本函数由 `pages/Content.tsx` 提取为共享工具（FR-CV-VER-009 时间机器与版本快照必须与编辑器同一字段口径）。
 * 此处锁定「布局优先 / 分区与标签页透传 / 重复组合成一个槽位 / 按 sortOrder 兜底排序」四条既有语义。
 */
describe('collectFields', () => {
  it('无模型时返回空数组', () => {
    expect(collectFields(undefined)).toEqual([]);
  });

  it('无布局时退回 fields 并按 sortOrder 排序', () => {
    const out = collectFields(type({ fields: [field('b', 'TEXT', 2), field('a', 'TEXT', 1)] }));
    expect(out.map((f) => f.code)).toEqual(['a', 'b']);
  });

  it('无布局时过滤结构型字段（分区/重复组/标签页不是可填值字段）', () => {
    const out = collectFields(type({
      fields: [field('title'), field('sec', 'FORM_SECTION'), field('tabs', 'TAB'), field('rg', 'REPEAT_GROUP')],
    }));
    expect(out.map((f) => f.code)).toEqual(['title']);
  });

  it('有布局时按布局树展开：FIELD 取字段、分区与标签页透传子节点', () => {
    const layout = [
      { elementType: 'FORM_SECTION', children: [ { elementType: 'FIELD', field: field('a') } ] },
      { elementType: 'TAB', children: [ { elementType: 'FIELD', field: field('b') } ] },
    ] as unknown as LayoutElement[];
    expect(collectFields(type({ layout })).map((f) => f.code)).toEqual(['a', 'b']);
  });

  it('重复组合成单个 REPEAT_GROUP 槽位（子字段嵌在数组值里，不平铺）', () => {
    const layout = [{
      elementType: 'REPEAT_GROUP',
      sortOrder: 1,
      config: { variableName: 'class_rg', title: '班级' },
      children: [{ elementType: 'FIELD', field: field('program_class') }],
    }] as unknown as LayoutElement[];
    const out = collectFields(type({ layout }));
    expect(out.map((f) => f.code)).toEqual(['class_rg']);
    expect(out[0].fieldType).toBe('REPEAT_GROUP');
    expect(out[0].name).toBe('班级');
  });

  it('布局优先于 fields（同一模型同时存在两者时只按布局展开）', () => {
    const layout = [{ elementType: 'FIELD', field: field('from_layout') }] as unknown as LayoutElement[];
    const out = collectFields(type({ layout, fields: [field('from_fields')] }));
    expect(out.map((f) => f.code)).toEqual(['from_layout']);
  });
});
