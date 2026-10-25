import { describe, expect, it } from 'vitest';
import {
  CONTAINER_FORM_DEFAULTS,
  parseContainerConfig,
  readContainerForm,
  writeContainerForm,
} from '../containerConfig';
import type { VisualContainer } from '../../api/types';

const container = (config: string): VisualContainer => ({
  id: 'c-1', siteId: 'site-1', name: 'c-home-feature', allowedComponentTypes: '[]', config,
  currentVersion: 4, containerStructures: [], createdAt: '', updatedAt: '',
});

/**
 * 线上真实形态（powercom / c-home-feature）：单一 Code 模式，渲染源写在 `zeroContentFtl`，
 * **没有 `code` 键**，同时带 `query` 与 `title_s` / `sub_s`。
 */
const HOME_FEATURE_FTL = '<#-- 功能特点 --><#assign rows = items!contentQuery("home-feature", 20, "sortOrder")><button class="pc-fcard">${item.title_s!}</button>';
const HOME_FEATURE_CONFIG = JSON.stringify({
  type: 'ZERO_CONTENT',
  query: { contentType: 'home-feature', limit: 20, orderBy: 'sortOrder', status: 'PUBLISHED', as: 'items' },
  zeroContentFtl: HOME_FEATURE_FTL,
  title_s: '功能特点',
  sub_s: 'Features',
  preLoopFtl: '',
  postLoopFtl: '',
  maxContents: 0,
});

describe('parseContainerConfig', () => {
  it('解析失败或非对象时退化为空对象，不抛错', () => {
    expect(parseContainerConfig(undefined)).toEqual({});
    expect(parseContainerConfig('')).toEqual({});
    expect(parseContainerConfig('not json')).toEqual({});
    expect(parseContainerConfig('[1,2]')).toEqual({});
    expect(parseContainerConfig('null')).toEqual({});
  });

  it('解析合法对象', () => {
    expect(parseContainerConfig('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('readContainerForm', () => {
  it('code 缺失时回退到 zeroContentFtl —— 单一 Code 模式必须把 FTL 显示进 Code 框', () => {
    const form = readContainerForm(container(HOME_FEATURE_CONFIG));
    expect(form.code).toBe(HOME_FEATURE_FTL);
    expect(form.zeroContentFtl).toBe(HOME_FEATURE_FTL);
    expect(form.maxContents).toBe(0);
  });

  it('同时存在 code 与 zeroContentFtl 时以 code 为准', () => {
    const form = readContainerForm(container(JSON.stringify({ maxContents: 0, zeroContentFtl: 'FTL', code: 'CODE' })));
    expect(form.code).toBe('CODE');
  });

  it('code 为空串时同样回退到 zeroContentFtl', () => {
    const form = readContainerForm(container(JSON.stringify({ maxContents: 0, zeroContentFtl: 'FTL', code: '' })));
    expect(form.code).toBe('FTL');
  });

  it('config 损坏时不抛错，返回空表单值', () => {
    expect(readContainerForm(container('{oops'))).toEqual({
      description: '', maxContents: 0, preLoopFtl: '', postLoopFtl: '', zeroContentFtl: '', code: '',
    });
  });

  it('不回填 name（name 由调用方以容器记录为准，避免覆盖）', () => {
    expect(readContainerForm(container(HOME_FEATURE_CONFIG))).not.toHaveProperty('name');
  });
});

describe('writeContainerForm', () => {
  it('单一 Code 模式同步写入 zeroContentFtl 与 code（渲染读前者，编辑器读后者）', () => {
    const config = JSON.parse(writeContainerForm({
      ...CONTAINER_FORM_DEFAULTS, name: 'c-1', maxContents: 0, code: 'MY_FTL',
    })) as Record<string, unknown>;
    expect(config.type).toBe('ZERO_CONTENT');
    expect(config.zeroContentFtl).toBe('MY_FTL');
    expect(config.code).toBe('MY_FTL');
  });

  it('保留表单不管理的键（query / title_s / sub_s）—— 服务端是整份替换，不做合并', () => {
    const form = readContainerForm(container(HOME_FEATURE_CONFIG));
    const written = JSON.parse(writeContainerForm(
      { ...CONTAINER_FORM_DEFAULTS, ...form, name: 'c-home-feature' },
      HOME_FEATURE_CONFIG,
    )) as Record<string, unknown>;
    expect(written.query).toEqual({
      contentType: 'home-feature', limit: 20, orderBy: 'sortOrder', status: 'PUBLISHED', as: 'items',
    });
    expect(written.title_s).toBe('功能特点');
    expect(written.sub_s).toBe('Features');
    expect(written.zeroContentFtl).toBe(HOME_FEATURE_FTL);
  });

  it('未编辑 Code 框直接保存不会清空 zeroContentFtl（原缺陷：保存即空白 + 服务端报「必须配置 zeroContentFtl」）', () => {
    const form = readContainerForm(container(HOME_FEATURE_CONFIG));
    const written = writeContainerForm({ ...CONTAINER_FORM_DEFAULTS, ...form, name: 'c-home-feature' }, HOME_FEATURE_CONFIG);
    expect((JSON.parse(written) as Record<string, unknown>).zeroContentFtl).toBe(HOME_FEATURE_FTL);
  });

  it('Content Type 绑定模式不触碰单一 Code 字段，避免切换形态时丢失已配置 FTL', () => {
    const config = JSON.parse(writeContainerForm(
      { ...CONTAINER_FORM_DEFAULTS, name: 'c-1', maxContents: 5, preLoopFtl: 'PRE', postLoopFtl: 'POST', code: 'SHOULD_NOT_LEAK' },
      HOME_FEATURE_CONFIG,
    )) as Record<string, unknown>;
    expect(config.type).toBe('CONTENT');
    expect(config.maxContents).toBe(5);
    expect(config.preLoopFtl).toBe('PRE');
    expect(config.postLoopFtl).toBe('POST');
    expect(config.zeroContentFtl).toBe(HOME_FEATURE_FTL);
    expect(config.query).toEqual(expect.objectContaining({ contentType: 'home-feature' }));
  });

  it('无 base 的新建容器只产出表单字段', () => {
    const config = JSON.parse(writeContainerForm({
      ...CONTAINER_FORM_DEFAULTS, name: 'new', maxContents: 0, code: 'FTL',
    })) as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(
      ['code', 'description', 'maxContents', 'postLoopFtl', 'preLoopFtl', 'type', 'zeroContentFtl'].sort(),
    );
  });

  it('往返稳定：read → write → read 保持不变', () => {
    const first = readContainerForm(container(HOME_FEATURE_CONFIG));
    const written = writeContainerForm({ ...CONTAINER_FORM_DEFAULTS, ...first, name: 'n' }, HOME_FEATURE_CONFIG);
    const second = readContainerForm(container(written));
    expect(second).toEqual(first);
  });
});
