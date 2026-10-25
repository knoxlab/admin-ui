// 系统 → 工作流 → 待办：列表「内容」列显示内容标题（而不是 UUID），
// 点击标题弹出只读审核弹窗，按内容模型表单布局展示提交审核的那一版字段。
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ContentItem, ContentType, FieldDef, LayoutElement, WorkflowTask } from '../../api/types';

const {
  listMock, pendingTasksMock, rolesMock, usersMock,
  getContentMock, versionsMock, getModelMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  pendingTasksMock: vi.fn(),
  rolesMock: vi.fn(),
  usersMock: vi.fn(),
  getContentMock: vi.fn(),
  versionsMock: vi.fn(),
  getModelMock: vi.fn(),
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
  contentsApi: { get: getContentMock, versions: versionsMock },
  modelsApi: { get: getModelMock },
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

const titleField: FieldDef = {
  code: 'summary_s',
  name: '摘要字段',
  fieldType: 'TEXT',
  required: false,
  sortOrder: 0,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
};

const model = {
  id: 'ct-1',
  code: 'article',
  name: '文章',
  templateType: 'PAGE',
  version: 1,
  status: 'PUBLISHED',
  fields: [titleField],
  layout: [{
    elementType: 'FORM_SECTION',
    sortOrder: 1,
    config: { title: '正文信息', variableName: 'row', columns: 1, columnSpans: [12] },
    children: [{ elementType: 'FIELD', sortOrder: 1000, field: titleField, children: [] }],
  }] as LayoutElement[],
} as unknown as ContentType;

const task = {
  id: 't-1',
  contentItemId: 'c-1',
  contentVersion: 1,
  contentTitle: '季度工作总结',
  contentTypeId: 'ct-1',
  sourceStatus: 'DRAFT',
  targetStatus: 'IN_REVIEW',
  assignee: 'reviewer',
  status: 'PENDING',
  submitter: 'editor',
  createdAt: '2026-10-02T00:00:00Z',
  requiredApprovers: 1,
  confirmedApprovers: 0,
} as WorkflowTask;

beforeEach(() => {
  listMock.mockResolvedValue([]);
  rolesMock.mockResolvedValue([]);
  usersMock.mockResolvedValue([]);
  pendingTasksMock.mockResolvedValue([task]);
  getContentMock.mockResolvedValue({
    id: 'c-1',
    siteId: 'site-1',
    contentTypeId: 'ct-1',
    title: '季度工作总结',
    status: 'IN_REVIEW',
    currentVersion: 1,
  } as ContentItem);
  versionsMock.mockResolvedValue([
    { id: 'v1', version: 1, fieldValues: JSON.stringify({ summary_s: '本季度完成三项重点任务' }), modelVersion: 1 },
  ]);
  getModelMock.mockResolvedValue(model);
});

afterEach(() => vi.clearAllMocks());

describe('工作流待办：内容列显示标题并可打开只读审核弹窗', () => {
  it('显示标题（非 UUID），点击后按模型布局展示提交版本的字段', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/workflow?task=t-1']}>
        <WorkflowPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('季度工作总结')).toBeTruthy());
    // 待办按当前站点请求（后端据此过滤非本站点 / 已删除 / 无权限的内容）
    expect(pendingTasksMock).toHaveBeenCalledWith('site-1');
    // 列表不再直接展示 UUID（UUID 只作为悬停提示保留可追溯性）
    expect(container.querySelector('tr[data-row-key="t-1"]')?.textContent).not.toContain('c-1');

    fireEvent.click(screen.getByText('季度工作总结'));

    await waitFor(() => expect(screen.getByText('本季度完成三项重点任务')).toBeTruthy());
    expect(screen.getByText('内容审核')).toBeTruthy();
    expect(screen.getByText('摘要字段')).toBeTruthy();
  });
});
