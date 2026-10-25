import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

/**
 * 系统日志页加载循环回归（429 缺陷）：
 * load 依赖 cursor，若重载 effect 依赖 load 函数身份，则每次 load 设置游标后
 * effect 重跑 → 无限循环，数秒内耗尽 30 次/分钟限流配额。修复后 effect 依赖
 * filterKey（筛选条件序列化），条件不变不重跑；自动刷新定时器同口径。
 */
const { apiGet, tFn } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  tFn: (key: string) => key,
}));

vi.mock('../../api/client', () => ({ api: { get: apiGet } }));
vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({ siteId: 'site-1' }),
  RequireSite: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ me: {} }),
  hasCapability: () => true,
  isSystemAdmin: () => false,
}));
vi.mock('../../i18n/I18nProvider', () => ({ useI18n: () => ({ t: tFn }) }));

import SystemLogsPage from '../SystemLogs';

describe('系统日志页 · 请求循环回归（429 缺陷）', () => {
  afterEach(() => cleanup());

  it('首屏后条件不变不再发起任何请求（load 依赖循环已断）', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url.endsWith('/stats')) {
        return Promise.resolve({ data: { total: 0, byLevel: {}, hourly: [], cachedForSeconds: 60, cached: false } });
      }
      if (url.endsWith('/modules')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { items: [], nextCursorTime: null, nextCursorId: null, hasMore: false } });
    });

    render(<SystemLogsPage />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const searchCalls = () => apiGet.mock.calls.filter(([u]) => String(u).match(/system-logs\/(runtime|access)$/)).length;
    await waitFor(() => expect(searchCalls()).toBeGreaterThanOrEqual(1));

    // 稳定窗口：无游标时 load 不应自我重触发；短暂等待确认没有循环
    const count = searchCalls();
    await new Promise((r) => setTimeout(r, 300));
    expect(searchCalls()).toBe(count);
  });

  it('有游标（hasMore）时同样不得循环加载', async () => {
    apiGet.mockReset();
    apiGet.mockImplementation((url: string) => {
      if (url.endsWith('/stats')) {
        return Promise.resolve({ data: { total: 1, byLevel: {}, hourly: [], cachedForSeconds: 60, cached: false } });
      }
      if (url.endsWith('/modules')) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: { items: [{ id: 'e1', occurredAt: '2026-09-21T07:00:00Z', level: 'INFO', service: 's',
          module: 'm', node: 'n', thread: 't', traceId: null, siteKey: null, message: 'ok',
          exceptionType: null, stack: null, truncated: false, originalBytes: 2 }],
          nextCursorTime: '2026-09-21T06:59:00Z', nextCursorId: 'e0', hasMore: true },
      });
    });

    render(<SystemLogsPage />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const searchCalls = () => apiGet.mock.calls.filter(([u]) => String(u).match(/system-logs\/(runtime|access)$/)).length;
    await waitFor(() => expect(searchCalls()).toBeGreaterThanOrEqual(1));

    const count = searchCalls();
    await new Promise((r) => setTimeout(r, 300));
    expect(searchCalls()).toBe(count);
  });

  it('切换运行/访问 Tab 必须重新检索（否则新列渲染旧 Tab 数据 → 整行空白）', async () => {
    apiGet.mockReset();
    apiGet.mockImplementation((url: string) => {
      if (url.endsWith('/stats')) {
        return Promise.resolve({ data: { total: 0, byLevel: {}, hourly: [], cachedForSeconds: 60, cached: false } });
      }
      if (url.endsWith('/modules')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { items: [], nextCursorTime: null, nextCursorId: null, hasMore: false } });
    });

    const { container } = render(<SystemLogsPage />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const searchCalls = () => apiGet.mock.calls.filter(([u]) => String(u).match(/system-logs\/(runtime|access)$/)).length;
    const runtimeCalls = () => apiGet.mock.calls.filter(([u]) => String(u).endsWith('/system-logs/runtime')).length;
    await waitFor(() => expect(runtimeCalls()).toBeGreaterThanOrEqual(1));
    const before = searchCalls();

    // 点击「访问日志」Segmented 选项
    const accessTab = container.ownerDocument.body.querySelectorAll('.ant-segmented-item')
      ? [...container.ownerDocument.body.querySelectorAll('.ant-segmented-item')]
          .find((el) => el.textContent?.includes('访问日志'))
      : undefined;
    expect(accessTab).toBeTruthy();
    accessTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(
      apiGet.mock.calls.filter(([u]) => String(u).endsWith('/system-logs/access')).length,
    ).toBeGreaterThanOrEqual(1));
    expect(searchCalls()).toBeGreaterThan(before);
  });
});
