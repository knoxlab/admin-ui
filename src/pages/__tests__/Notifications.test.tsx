import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const { notificationsMock, markReadMock, markAllReadMock } = vi.hoisted(() => ({
  notificationsMock: vi.fn(),
  markReadMock: vi.fn(),
  markAllReadMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  workflowApi: {
    notifications: notificationsMock,
    markRead: markReadMock,
    markAllRead: markAllReadMock,
  },
}));

vi.mock('../../context/SiteContext', () => ({
  RequireSite: ({ children }: { children: ReactNode }) => children,
  useSite: () => ({ siteId: 'site-1' }),
}));

import NotificationsPage from '../Notifications';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../appEvents';
import { message } from 'antd';

const sampleNotifications = [
  { id: 'n1', level: 'INFO', title: 'First', body: 'first body', createdAt: '2026-01-01T00:00:00Z', read: false },
  { id: 'n2', level: 'WARN', title: 'Second', body: 'second body', createdAt: '2026-01-02T00:00:00Z', read: true },
];

/** 记录当前路由：「前往审核」点击是 SPA 跳转，jsdom 里用它断言目标地址。 */
let lastLocation = '';
function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    lastLocation = location.pathname + location.search;
  }, [location]);
  return null;
}

/** 页面用到 useNavigate，必须在 Router 上下文里渲染。 */
function PageUnderTest() {
  return (
    <MemoryRouter initialEntries={['/notifications']}>
      <LocationProbe />
      <NotificationsPage />
    </MemoryRouter>
  );
}

describe('Notifications page', () => {
  beforeEach(() => {
    notificationsMock.mockReset();
    markReadMock.mockReset();
    markAllReadMock.mockReset();
    notificationsMock.mockResolvedValue(sampleNotifications);
    markReadMock.mockResolvedValue(undefined);
    markAllReadMock.mockResolvedValue({ updated: 1 });
    vi.mocked(message.success).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads notifications on mount and requests only unread by default', async () => {
    render(<PageUnderTest />);
    await waitFor(() => {
      expect(notificationsMock).toHaveBeenCalledWith(false);
    });
  });

  it('renders level tags in the table', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    await waitFor(() => {
      const tags = container.querySelectorAll('.ant-tag');
      expect(tags.length).toBeGreaterThan(0);
    });
  });

  it('shows the unread count tag (red) when there are unread notifications', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    await waitFor(() => {
      const unread = container.querySelectorAll('.ant-tag-red');
      expect(unread.length).toBeGreaterThan(0);
    });
  });

  it('calls markAllRead when the primary action button is clicked', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    // The "全部已读" button is the primary ant-btn-primary in the toolbar.
    const primaryBtns = container.querySelectorAll('button.ant-btn-primary');
    expect(primaryBtns.length).toBeGreaterThan(0);
    fireEvent.click(primaryBtns[0]);
    await waitFor(() => {
      expect(markAllReadMock).toHaveBeenCalled();
    });
    expect(message.success).toHaveBeenCalled();
  });

  it('disables the primary action button when there are no unread notifications', async () => {
    notificationsMock.mockResolvedValueOnce([]);
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    // The primary button should be disabled when no unread notifications exist.
    const primaryBtn = container.querySelector('button.ant-btn-primary');
    expect(primaryBtn).not.toBeNull();
    expect((primaryBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the read-status tag with processing color for unread rows', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    await waitFor(() => {
      const processingTags = container.querySelectorAll('.ant-tag-processing');
      expect(processingTags.length).toBeGreaterThan(0);
    });
  });

  it('renders the pagination control', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(container.querySelector('.ant-pagination')).not.toBeNull();
    });
  });

  it('renders without error when there are no notifications', async () => {
    notificationsMock.mockResolvedValueOnce([]);
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    // The page still renders its toolbar and table structure without crashing.
    expect(container.querySelector('.ant-table')).not.toBeNull();
  });

  // ── DEF-11-07：时间列统一为 YYYY-MM-DD HH:mm（不再受浏览器区域设置影响）──
  it('renders createdAt as YYYY-MM-DD HH:mm', async () => {
    notificationsMock.mockResolvedValue([
      { id: 'n1', level: 'INFO', title: 'First', body: 'b', createdAt: '2026-09-18T15:57:23Z', read: false },
    ]);
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(1));
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((td) => td.textContent ?? '');
    const timeCell = cells.find((c) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c));
    expect(timeCell).toBeTruthy();
    expect(cells.some((c) => /AM|PM/.test(c))).toBe(false);
  });

  // ── DEF-11-05：标记已读后必须派发事件，让 AppShell 立即刷新未读角标 ──
  it('dispatches the notifications-changed event after marking all as read', async () => {
    const onChange = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    try {
      const { container } = render(<PageUnderTest />);
      await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
      const primaryBtn = container.querySelector('button.ant-btn-primary') as HTMLButtonElement;
      fireEvent.click(primaryBtn);
      await waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
      await waitFor(() => expect(onChange).toHaveBeenCalled());
    } finally {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    }
  });

  it('dispatches the notifications-changed event after marking one row as read', async () => {
    const onChange = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    try {
      const { container } = render(<PageUnderTest />);
      await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0));
      const rowBtn = container.querySelector('tbody tr button') as HTMLButtonElement;
      fireEvent.click(rowBtn);
      await waitFor(() => expect(markReadMock).toHaveBeenCalled());
      await waitFor(() => expect(onChange).toHaveBeenCalled());
    } finally {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    }
  });

  // ── DEF-11-08 同类：加载失败必须给出反馈，不得静默呈现空态 ──
  it('shows an error message when loading notifications fails', async () => {
    notificationsMock.mockRejectedValueOnce(new Error('Network Error'));
    render(<PageUnderTest />);
    await waitFor(() => expect(message.error).toHaveBeenCalled());
  });

  it('shows an error message when marking all as read fails', async () => {
    markAllReadMock.mockRejectedValueOnce(new Error('Network Error'));
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(notificationsMock).toHaveBeenCalled());
    const primaryBtn = container.querySelector('button.ant-btn-primary') as HTMLButtonElement;
    fireEvent.click(primaryBtn);
    await waitFor(() => expect(message.error).toHaveBeenCalled());
  });

  // ── 通知中心 → 审核界面直达：等待审核类通知在正文后附「前往审核」链接 ──
  it('renders the review link after the body and navigates to the review deep link', async () => {
    lastLocation = '';
    notificationsMock.mockResolvedValue([
      {
        id: 'n1', level: 'INFO', title: '审核任务', body: '内容《首页》等待您审核',
        createdAt: '2026-10-15T00:00:00Z', read: false, link: '/tasks/t-9',
      },
    ]);
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(1));

    const anchor = await screen.findByRole('link', { name: '前往审核' });
    expect(anchor.getAttribute('href')).toBe('/tasks/t-9');
    fireEvent.click(anchor);
    await waitFor(() => expect(lastLocation).toBe('/tasks/t-9'));
  });

  it('keeps the body readable and omits the link when the notification carries no link', async () => {
    const { container } = render(<PageUnderTest />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0));
    expect(within(container).queryByRole('link', { name: '前往审核' })).toBeNull();
    expect(container.textContent).toContain('first body');
  });
});
