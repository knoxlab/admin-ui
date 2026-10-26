import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * 站点包页空站点契约（回归）：
 * 导入站点包正是「站点列表为空」时创建首个站点的入口，
 * 页面因此**不得**套 RequireSite——否则空列表时只剩「请先创建或选择站点」，
 * 导入按钮反而不可见（鸡生蛋）。
 *
 * 断言：
 * 1. 站点列表为空 → 「导入 ZIP」按钮仍可见且可用；
 * 2. 不出现 RequireSite 的引导文案；
 * 3. 无站点可导出 → 「导出当前站点」按钮禁用。
 */
const { listMock, tFn } = vi.hoisted(() => ({
  listMock: vi.fn(),
  /** 中文原文即键（与生产 t() 在 zh-CN 下同语义）。 */
  tFn: (key: string) => key,
}));

vi.mock('../../api', () => ({
  packagesApi: {
    list: listMock,
    precheck: vi.fn(),
    import: vi.fn(),
    export: vi.fn(),
  },
}));

/** 空站点：siteId 为 null，sites 为空数组。 */
vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({
    sites: [],
    siteId: null,
    site: null,
    loading: false,
    setSiteId: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    username: 'admin',
    me: { organizationRoles: ['system-admin'] },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  }),
  isSystemAdmin: (me: { organizationRoles?: string[] } | null) =>
    !!me?.organizationRoles?.includes('system-admin'),
}));

vi.mock('../../i18n/locale', () => ({ t: tFn }));

import PackagesPage from '../Packages';

describe('站点包 · 空站点时仍可导入', () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('站点列表为空 → 「导入 ZIP」可见且可用', () => {
    render(<PackagesPage />);
    // antd 图标会干扰无障碍名称计算，按文本定位后取最近的 button
    const btn = screen.getByText('导入 ZIP').closest('button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('站点列表为空 → 不出现「请先创建或选择站点」引导', () => {
    render(<PackagesPage />);
    expect(screen.queryByText(/请先在「站点与环境」中创建或选择一个站点/)).toBeNull();
  });

  it('无当前站点 → 「导出当前站点」禁用（仅它依赖 siteId）', () => {
    render(<PackagesPage />);
    const btn = screen.getByText('导出当前站点').closest('button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });
});
