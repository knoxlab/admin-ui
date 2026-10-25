import { describe, expect, it } from 'vitest';
import { isMenuAllowedByLayout, menuLayoutFor } from '../appMenuLayout';

describe('menuLayoutFor', () => {
  it('业务分组映射到对应内置布局', () => {
    expect(menuLayoutFor('/content')).toBe('content');
    expect(menuLayoutFor('/content?type=article')).toBe('content');
    expect(menuLayoutFor('/media')).toBe('media');
    expect(menuLayoutFor('/models')).toBe('model');
    expect(menuLayoutFor('/publish/tasks')).toBe('publish');
    expect(menuLayoutFor('/identity?tab=users')).toBe('users');
  });

  it('「系统 › 工作流」属 workflow 布局（OBS-11-09：此前未映射而常显）', () => {
    expect(menuLayoutFor('/workflow')).toBe('workflow');
  });

  it('「内容 › 时间机器」随内容布局可见（FR-CV-VER-009）', () => {
    expect(menuLayoutFor('/time-machine')).toBe('content');
    expect(isMenuAllowedByLayout('/time-machine', ['content'])).toBe(true);
    expect(isMenuAllowedByLayout('/time-machine', ['media'])).toBe(false);
  });

  it('系统分组其余项仍属 site-settings', () => {
    expect(menuLayoutFor('/sites')).toBe('site-settings');
    expect(menuLayoutFor('/packages')).toBe('site-settings');
  });

  it('dashboard / settings 等常显页不参与布局过滤', () => {
    expect(menuLayoutFor('/dashboard')).toBeNull();
    expect(menuLayoutFor('/settings')).toBeNull();
  });
});

describe('isMenuAllowedByLayout', () => {
  it('持有该布局时可见', () => {
    expect(isMenuAllowedByLayout('/workflow', ['workflow'])).toBe(true);
  });

  it('未持有该布局时隐藏（OBS-11-09）', () => {
    expect(isMenuAllowedByLayout('/workflow', ['dashboard', 'content'])).toBe(false);
  });

  it('空布局数组表示无任何后台布局，除常显页外一律不可见', () => {
    expect(isMenuAllowedByLayout('/content', [])).toBe(false);
    expect(isMenuAllowedByLayout('/dashboard', [])).toBe(true);
  });

  it('layouts 为 undefined 时按「无布局」处理（App 层用 me 是否存在先行放行）', () => {
    expect(isMenuAllowedByLayout('/workflow', undefined)).toBe(false);
    expect(isMenuAllowedByLayout('/dashboard', undefined)).toBe(true);
  });
});
