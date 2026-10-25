import { describe, expect, it } from 'vitest';
import type { FieldDef, LayoutElement } from '../../api/types';
import { formatRepeatGroupLabel, makeRepeatGroupField, mergeInspectorDraft } from '../Models';

/**
 * 模型设计器 · 重复组显示名称与画布标签（修复 2026-10-22）。
 *
 * <p>① 属性检查器的「显示名称」写在 `name`，而画布卡片标签读的是 `config.title`，
 * 两者此前互不同步 → 改完显示名称画布纹丝不动；② GY/T 202.1 标准限定词（class_rg …）
 * 此前一律显示内置双语标签，用户自定义的标题被完全遮蔽；③ 水合（保存重开）时
 * `config.title` 被强制回填标准中文名，自定义标题丢失。本用例锁定三条修复语义。</p>
 */

const repeatGroup = (partial: Partial<FieldDef> = {}): FieldDef => ({
  code: 'repeat_1',
  name: '重复组',
  fieldType: 'REPEAT_GROUP',
  required: false,
  sortOrder: 10,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
  uniqueField: false,
  fieldConfig: { title: '重复组', variableName: 'repeat_1', minItems: 0, maxItems: -1 },
  ...partial,
});

const layoutEl = (config: Record<string, unknown>): LayoutElement => ({
  elementType: 'REPEAT_GROUP',
  sortOrder: 10,
  config,
  children: [],
});

describe('重复组显示名称 → 画布标签', () => {
  it('编辑显示名称时同步写入组标题，画布标签随之变化', () => {
    const edited = mergeInspectorDraft(repeatGroup(), { name: '获奖记录' });
    expect(edited.fieldConfig?.title).toBe('获奖记录');
    expect(formatRepeatGroupLabel(edited)).toBe('获奖记录');
  });

  it('编辑组标题时回填显示名称，两个输入框保持一致', () => {
    const edited = mergeInspectorDraft(repeatGroup(), { fieldConfig: { title: '组员名单' } });
    expect(edited.name).toBe('组员名单');
    expect(formatRepeatGroupLabel(edited)).toBe('组员名单');
  });

  it('普通数据字段不受同步影响（仍按 name 展示，title 不被强写）', () => {
    const text = repeatGroup({ code: 'title_s', name: '标题', fieldType: 'STRING', fieldConfig: {} });
    const edited = mergeInspectorDraft(text, { name: '文章标题' });
    expect(edited.name).toBe('文章标题');
    expect(edited.fieldConfig?.title).toBeUndefined();
  });
});

describe('GY/T 202.1 标准限定词标签', () => {
  it('未自定义时仍显示内置双语标准标签', () => {
    const field = makeRepeatGroupField(layoutEl({ variableName: 'class_rg', title: '分类' }));
    expect(formatRepeatGroupLabel(field)).toBe('分类（Class）');
  });

  it('种子数据的缩写标题（版权所有者 vs 版权所有者名称）视为未自定义', () => {
    const field = makeRepeatGroupField(
      layoutEl({ variableName: 'copyright_owners_rg', title: '版权所有者' }),
    );
    expect(formatRepeatGroupLabel(field)).toBe('版权所有者名称（Name of Copyright Owner）');
  });

  it('自定义过标题的标准组以自定义值展示，且水合后不被标准中文名覆盖', () => {
    const field = makeRepeatGroupField(layoutEl({ variableName: 'class_rg', title: '我的分类' }));
    expect(field.name).toBe('我的分类');
    expect(field.fieldConfig?.title).toBe('我的分类');
    expect(formatRepeatGroupLabel(field)).toBe('我的分类');
  });

  it('标准组改显示名称后，保存（写入 config.title）再重开仍显示新名称', () => {
    // 设计器内：改显示名称 → 同步到 title → 序列化时以 cfg.title 落库
    const edited = mergeInspectorDraft(
      makeRepeatGroupField(layoutEl({ variableName: 'class_rg', title: '分类' })),
      { name: '节目分类' },
    );
    expect(edited.fieldConfig?.title).toBe('节目分类');
    // 重新水合：cfg.title = 落库的新名称
    const reloaded = makeRepeatGroupField(layoutEl({ variableName: 'class_rg', title: '节目分类' }));
    expect(formatRepeatGroupLabel(reloaded)).toBe('节目分类');
  });
});
