// 工作流待办「点击标题」打开的只读审核弹窗：
// 必须展示任务提交审核的那一版（而不是最新版），字段按内容模型布局只读渲染。
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentItem, ContentType, FieldDef, LayoutElement, WorkflowTask } from '../../api/types';

const { getContentMock, versionsMock, getModelMock } = vi.hoisted(() => ({
  getContentMock: vi.fn(),
  versionsMock: vi.fn(),
  getModelMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  contentsApi: { get: getContentMock, versions: versionsMock },
  modelsApi: { get: getModelMock },
}));
vi.mock('../../api/client', () => ({ QUIET: 'quiet' }));
vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));

import ContentReviewModal, { parseFieldValues, pickReviewVersion } from '../ContentReviewModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const titleField: FieldDef = {
  code: 'title_s',
  name: '标题字段',
  fieldType: 'TEXT',
  required: true,
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

const item = {
  id: 'c-1',
  siteId: 's1',
  contentTypeId: 'ct-1',
  title: '最新标题',
  status: 'IN_REVIEW',
  currentVersion: 3,
  createdAt: '2026-10-01T00:00:00Z',
} as ContentItem;

const task = {
  id: 't-1',
  contentItemId: 'c-1',
  contentVersion: 2,
  sourceStatus: 'DRAFT',
  targetStatus: 'PUBLISHED',
  status: 'PENDING',
  submitter: 'editor',
  createdAt: '2026-10-02T00:00:00Z',
  requiredApprovers: 1,
  confirmedApprovers: 0,
} as WorkflowTask;

describe('ContentReviewModal（待办内容只读审核）', () => {
  it('展示提交审核的那一版内容，而非最新版', async () => {
    getContentMock.mockResolvedValue(item);
    getModelMock.mockResolvedValue(model);
    versionsMock.mockResolvedValue([
      { id: 'v3', version: 3, fieldValues: JSON.stringify({ title_s: '提交后新草稿' }), title: '最新标题', modelVersion: 1 },
      { id: 'v2', version: 2, fieldValues: JSON.stringify({ title_s: '提交审核的正文' }), title: '提交时标题', modelVersion: 1 },
    ]);

    const { container } = render(
      <ContentReviewModal open siteId="s1" task={task} onClose={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText('提交时标题')).toBeTruthy());
    expect(screen.getByText('提交审核的正文')).toBeTruthy();
    expect(screen.queryByText('提交后新草稿')).toBeNull();
    // 提交后又有新版本：明确提示本弹窗展示的是提交时的 v2
    expect(screen.getByText('提交审核后该内容又有更新')).toBeTruthy();
    // 只读：弹窗内没有任何输入控件
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  it('提交版本已被清理时回退最新版并明确提示', async () => {
    getContentMock.mockResolvedValue(item);
    getModelMock.mockResolvedValue(model);
    versionsMock.mockResolvedValue([
      { id: 'v3', version: 3, fieldValues: JSON.stringify({ title_s: '仅存的最新正文' }), title: '最新标题', modelVersion: 1 },
    ]);

    render(<ContentReviewModal open siteId="s1" task={task} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('未找到提交审核时的版本，已显示最新版本')).toBeTruthy());
    expect(screen.getByText('仅存的最新正文')).toBeTruthy();
  });

  it('内容已被删除时给出提示而不崩溃', async () => {
    getContentMock.mockRejectedValue(new Error('404'));
    versionsMock.mockRejectedValue(new Error('404'));

    render(<ContentReviewModal open siteId="s1" task={task} onClose={() => {}} />);

    await waitFor(() => expect(getContentMock).toHaveBeenCalledWith('c-1', 'quiet'));
    expect(screen.getByText('内容加载失败：可能已被删除或您没有查看权限。')).toBeTruthy();
  });
});

describe('审核版本与字段值解析', () => {
  it('优先匹配任务记录的版本，缺失时取最新版', () => {
    const rows = [
      { version: 1 } as never,
      { version: 5 } as never,
      { version: 3 } as never,
    ];
    expect(pickReviewVersion(rows, 3)?.version).toBe(3);
    expect(pickReviewVersion(rows, 4)?.version).toBe(5);
    expect(pickReviewVersion([], 2)).toBeUndefined();
  });

  it('脏 field_values 不让弹窗空掉', () => {
    expect(parseFieldValues('not-json')).toEqual({});
    expect(parseFieldValues('')).toEqual({});
    expect(parseFieldValues('[1,2]')).toEqual({});
    expect(parseFieldValues('{"a":1}')).toEqual({ a: 1 });
  });
});
