import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * 站点与环境页提示信息层契约：
 * 1. 默认展示页面提示层（信息 Alert）；
 * 2. 提示层右上角关闭图标可将其隐藏，隐藏后标题右上角出现「?」图标；
 * 3. 点击「?」图标可再次显示提示层，且「?」图标随提示层恢复而消失。
 */
const { listMock, tFn } = vi.hoisted(() => ({
  listMock: vi.fn(),
  /** 中文原文即键（与生产 t() 在 zh-CN 下同语义）。 */
  tFn: (key: string) => key,
}));

vi.mock('../../api', () => ({
  sitesApi: {
    list: listMock,
    get: vi.fn(),
    create: vi.fn(),
    freeze: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    deletionPreview: vi.fn(),
    delete: vi.fn(),
    members: vi.fn(),
    authorizationPolicy: vi.fn(),
    saveAuthorizationPolicy: vi.fn(),
    accessGuidance: vi.fn(),
    saveAccessGuidance: vi.fn(),
    accessAudit: vi.fn(),
  },
}));

vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({
    sites: [{ id: 'site-1', siteKey: 'live', name: '主站', status: 'ACTIVE',
      createdAt: '', updatedAt: '' }],
    refresh: vi.fn(),
    setSiteId: vi.fn(),
    siteId: 'site-1',
  }),
  RequireSite: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../i18n/locale', () => ({ t: tFn }));
vi.mock('../../components/SitePermissionsModal', () => ({ default: () => null }));

import SitesPage from '../Sites';

const SITE = { id: 'site-1', siteKey: 'live', name: '主站', status: 'ACTIVE',
  createdAt: '', updatedAt: '' };
/** 提示文案片段（正则安全）。 */
const HINT = '当前工作站点可通过顶部下拉切换';

describe('站点与环境 · 提示信息层隐藏/恢复', () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([SITE]);
  });

  afterEach(() => cleanup());

  it('默认展示提示层，标题右上角无「?」按钮', () => {
    render(<SitesPage />);
    expect(screen.getByText(new RegExp(HINT))).toBeTruthy();
    expect(screen.queryByRole('button', { name: '显示页面说明' })).toBeNull();
  });

  it('关闭图标隐藏提示层；「?」图标出现后可再次显示', async () => {
    render(<SitesPage />);
    expect(screen.getByText(new RegExp(HINT))).toBeTruthy();

    // 1. 提示层右上角关闭图标 → 隐藏
    const closer = document.querySelector('.ant-alert-close-icon');
    expect(closer).toBeTruthy();
    fireEvent.click(closer!);
    expect(screen.queryByText(new RegExp(HINT))).toBeNull();

    // 2. 隐藏后标题右上角出现「?」
    const help = await screen.findByRole('button', { name: '显示页面说明' });

    // 3. 点击「?」→ 提示层恢复，「?」消失
    fireEvent.click(help);
    expect(screen.getByText(new RegExp(HINT))).toBeTruthy();
    expect(screen.queryByRole('button', { name: '显示页面说明' })).toBeNull();
  });
});
