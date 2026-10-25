import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { message } from 'antd';

const { listMock, pendingTasksMock, rolesMock, usersMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  pendingTasksMock: vi.fn(),
  rolesMock: vi.fn(),
  usersMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  workflowApi: {
    list: listMock,
    pendingTasks: pendingTasksMock,
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
    delegate: vi.fn(),
    notifications: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    listTemplates: vi.fn(),
    saveTemplate: vi.fn(),
    previewTemplate: vi.fn(),
    preferences: vi.fn(),
    savePreferences: vi.fn(),
  },
  rolesApi: { list: rolesMock },
  usersApi: { list: usersMock },
}));

vi.mock('../../api/client', () => ({ QUIET: 'quiet' }));
vi.mock('../../context/SiteContext', () => ({
  RequireSite: ({ children }: { children: ReactNode }) => children,
  useSite: () => ({ siteId: 'site-1' }),
}));
vi.mock('@monaco-editor/react', () => ({ default: () => null }));
vi.mock('../../components/AiReviewBriefCard', () => ({ AiReviewBriefCard: () => null }));
vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));

import WorkflowPage from '../Workflow';

const pendingTask = {
  id: 't-9',
  contentItemId: 'c-1',
  contentVersion: 1,
  sourceStatus: 'DRAFT',
  targetStatus: 'IN_REVIEW',
  assignee: 'reviewer',
  status: 'PENDING',
  createdAt: '2026-10-15T00:00:00Z',
  requiredApprovers: 1,
  confirmedApprovers: 0,
};

function stubEmptyCatalogs() {
  listMock.mockResolvedValue([]);
  rolesMock.mockResolvedValue([]);
  usersMock.mockResolvedValue([]);
}

describe('工作流待办：通知深链 /workflow?task=', () => {
  it('opens the 待办 tab and highlights the deep-linked review task', async () => {
    stubEmptyCatalogs();
    pendingTasksMock.mockResolvedValue([pendingTask]);

    const { container } = render(
      <MemoryRouter initialEntries={['/workflow?task=t-9']}>
        <WorkflowPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(pendingTasksMock).toHaveBeenCalled());
    await waitFor(() => {
      const row = container.querySelector('tr[data-row-key="t-9"]');
      expect(row?.className).toContain('ant-table-row-selected');
    });
    // 直接落在「待办」，而不是默认的流程设计器
    expect(container.querySelector('.ant-tabs-tab-active')?.textContent).toContain('待办');
  });

  it('tells the user when the deep-linked task is not in the to-do list', async () => {
    vi.mocked(message.info).mockClear();
    stubEmptyCatalogs();
    pendingTasksMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/workflow?task=t-missing']}>
        <WorkflowPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(message.info).toHaveBeenCalledWith('该审核任务不在您的待办列表（可能已被处理或委派）');
    });
  });
});
