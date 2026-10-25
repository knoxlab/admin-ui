import { describe, expect, it } from 'vitest';

import {
  parseBranding,
  resolveBrand,
  brandCssVars,
  BRAND_PRIMARY_VAR,
  BRAND_SECONDARY_VAR,
  DEFAULT_BRAND_PRIMARY,
  DEFAULT_BRAND_SECONDARY,
  DEFAULT_LOGIN_BACKGROUND,
} from '../branding';

/**
 * DEF-CFG-03：`backendSecondaryColor` 修复前「能存、能读、无行为」。品牌解析收敛为唯一入口
 * 后，登录页与管理端外壳共用同一套缺省值，次色才真正有消费方。
 */
describe('branding utils', () => {
  it('解析合法 JSON', () => {
    expect(parseBranding('{"backendPrimaryColor":"#ff4d4f"}')).toEqual({
      backendPrimaryColor: '#ff4d4f',
    });
  });

  it('非法 JSON / 非对象 / 空值一律回退空配置而不是抛错', () => {
    expect(parseBranding('{oops')).toEqual({});
    expect(parseBranding('"a string"')).toEqual({});
    expect(parseBranding('null')).toEqual({});
    expect(parseBranding(null)).toEqual({});
    expect(parseBranding(undefined)).toEqual({});
    expect(parseBranding('')).toEqual({});
  });

  it('缺省值填充：三个品牌位各自独立回落', () => {
    expect(resolveBrand({})).toEqual({
      primary: DEFAULT_BRAND_PRIMARY,
      secondary: DEFAULT_BRAND_SECONDARY,
      loginBackground: DEFAULT_LOGIN_BACKGROUND,
    });
    expect(resolveBrand(null)).toEqual({
      primary: DEFAULT_BRAND_PRIMARY,
      secondary: DEFAULT_BRAND_SECONDARY,
      loginBackground: DEFAULT_LOGIN_BACKGROUND,
    });
  });

  it('显式配置覆盖缺省（含次色 —— 修复前它没有任何消费方）', () => {
    expect(resolveBrand({
      backendPrimaryColor: '#ff4d4f',
      backendSecondaryColor: '#52c41a',
      loginBackground: '#000000',
    })).toEqual({
      primary: '#ff4d4f',
      secondary: '#52c41a',
      loginBackground: '#000000',
    });
  });

  it('空串按未配置处理，不把空色值透传给样式', () => {
    expect(resolveBrand({ backendSecondaryColor: '' })).toEqual({
      primary: DEFAULT_BRAND_PRIMARY,
      secondary: DEFAULT_BRAND_SECONDARY,
      loginBackground: DEFAULT_LOGIN_BACKGROUND,
    });
  });

  it('brandCssVars 下发主色与次色两个变量', () => {
    expect(brandCssVars({ primary: '#111111', secondary: '#222222', loginBackground: '#333333' })).toEqual({
      '--pc-brand-primary': '#111111',
      '--pc-brand-secondary': '#222222',
    });
  });
});

/**
 * 跨文件契约：`backendSecondaryColor` 修复前是「能存、能读、无行为」的空转配置，
 * 现在由管理端外壳以 CSS 变量下发、`App.css` 消费。
 *
 * <p>这里只钉住**变量名与取值**这一半（纯函数可测的那一半）。另一半「`App.css` 真的取了
 * 这两个变量」需要读 CSS 原文，而本仓库未装 `@types/node`（`node:fs` 无类型）、
 * vitest 的 CSS 处理链又把 `?raw` 导入返回成空串，两条路都不通；为一条断言引入
 * `@types/node` 不划算。**该半由浏览器实测覆盖**：执行报告中的端到端复验直接在真实页面读
 * `getComputedStyle(.app-shell).getPropertyValue('--pc-brand-secondary')` 与
 * `CSS.getMatchedStylesForNode` 命中的 `App.css` 规则，证明变量确实被消费。
 */
describe('品牌色消费点契约（DEF-CFG-03）', () => {
  it('主色/次色变量名稳定（App.css 按这两个名字取值，改名即断链）', () => {
    expect(BRAND_PRIMARY_VAR).toBe('--pc-brand-primary');
    expect(BRAND_SECONDARY_VAR).toBe('--pc-brand-secondary');
  });

  it('shell 下发的变量覆盖主色与次色两位，缺省也不为空', () => {
    const vars = brandCssVars(resolveBrand({}));
    expect(vars[BRAND_PRIMARY_VAR]).toBe(DEFAULT_BRAND_PRIMARY);
    expect(vars[BRAND_SECONDARY_VAR]).toBe(DEFAULT_BRAND_SECONDARY);
    expect(vars[BRAND_PRIMARY_VAR]).not.toBe('');
    expect(vars[BRAND_SECONDARY_VAR]).not.toBe('');
  });
});
