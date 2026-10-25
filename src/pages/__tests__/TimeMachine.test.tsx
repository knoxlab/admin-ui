import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { atMock, treeMock, modelsMock, readonlyMock } = vi.hoisted(() => ({
  atMock: vi.fn(),
  treeMock: vi.fn(),
  modelsMock: vi.fn(),
  readonlyMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  timeMachineApi: { at: atMock },
  categoriesApi: { tree: treeMock },
  modelsApi: { list: modelsMock },
}));

vi.mock('../../api/client', () => ({
  setReadOnlySnapshot: readonlyMock,
  /** 页面只用到写入接口；读取值由用例通过 readonlyMock 的调用序列断言。 */
  getReadOnlySnapshot: () => null,
}));

vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({ siteId: 'site-1' }),
  RequireSite: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../i18n/locale', () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}|${JSON.stringify(vars)}` : key) }));

import TimeMachinePage from '../TimeMachine';
import type { TimeMachineSnapshot } from '../../api/types';

const AT = '2026-09-18T10:00:00Z';

function snapshot(partial: Partial<TimeMachineSnapshot> = {}): TimeMachineSnapshot {
  return {
    at: AT,
    earliestContentCreatedAt: '2026-01-01T00:00:00Z',
    total: 2,
    notYetCreated: 0,
    items: [
      {
        id: 'a',
        categoryId: 'news',
        contentTypeId: 'type-1',
        contentTypeCode: 'article',
        contentTypeName: '文章',
        title: '夏季促销',
        routePath: '/news/summer',
        templatePath: '/t/news',
        version: 3,
        modelVersion: 2,
        versionCreatedAt: '2026-09-17T08:30:00Z',
        createdBy: 'editor',
        createdByName: '编辑甲',
        fieldValues: '{"body_t":"当时的正文"}',
        currentStatus: 'PUBLISHED',
      },
      {
        id: 'b',
        categoryId: 'video',
        contentTypeId: 'type-2',
        contentTypeCode: 'video',
        contentTypeName: '视频',
        title: '产品视频',
        routePath: '/video/intro',
        version: 1,
        modelVersion: 1,
        versionCreatedAt: '2026-09-16T08:30:00Z',
        createdBy: 'editor',
        fieldValues: '{}',
        currentStatus: 'DRAFT',
      },
    ],
    ...partial,
  };
}

describe('TimeMachinePage（FR-CV-VER-009/010）', () => {
  beforeEach(() => {
    atMock.mockReset().mockResolvedValue(snapshot());
    treeMock.mockReset().mockResolvedValue([
      { id: 'news', name: '新闻', pathAlias: 'news', sortOrder: 0, depth: 0 },
      { id: 'video', name: '视频', pathAlias: 'video', sortOrder: 1, depth: 0 },
    ]);
    modelsMock.mockReset().mockResolvedValue([
      {
        id: 'type-1', siteId: 'site-1', code: 'article', name: '文章', version: 1, status: 'PUBLISHED',
        fields: [{
          code: 'body_t', name: '正文', fieldType: 'TEXT', required: false, sortOrder: 1, readOnly: false,
          i18n: false, adminIndex: false, publicIndex: false, sortable: false, filterable: false, highlight: false,
        }],
      },
    ]);
    readonlyMock.mockReset();
  });

  afterEach(() => cleanup());

  it('进入页面即按当前时刻查询，并以只读标记包住整段浏览（离开页面撤销）', async () => {
    const { unmount } = render(<TimeMachinePage />);

    await waitFor(() => expect(atMock).toHaveBeenCalledWith('site-1', expect.any(String)));
    // 先以请求时间点置位，再以服务端回显的时刻收敛
    await waitFor(() => expect(readonlyMock).toHaveBeenCalledWith(AT));
    expect(readonlyMock.mock.calls[0][0]).not.toBeNull();

    unmount();
    // 离开页面必须撤销只读标记：否则用户之后所有编辑都会被 403 挡住
    expect(readonlyMock).toHaveBeenLastCalledWith(null);
  });

  it('展示只读提示、状态栏与三栏内容，且详情默认落在列表首行', async () => {
    render(<TimeMachinePage />);

    await waitFor(() => expect(screen.getByTestId('time-machine-readonly-alert')).toBeTruthy());
    expect(screen.getByTestId('time-machine-mode').textContent).toContain('时间机器模式（只读）');
    await waitFor(() => expect(screen.getAllByTestId('time-machine-item')).toHaveLength(2));

    // 详情默认选中列表首行（由 effect 驱动，需等一次重渲染）
    await waitFor(() => expect(screen.getByTestId('time-machine-detail')).toBeTruthy());
    const detail = screen.getByTestId('time-machine-detail');
    expect(detail.textContent).toContain('夏季促销');
    expect(detail.textContent).toContain('v3');
    // 字段展示名走模型定义而不是字段码
    expect(detail.textContent).toContain('正文');
    expect(detail.textContent).toContain('当时的正文');
  });

  it('页面不提供任何编辑/发布/删除入口（只读视图）', async () => {
    render(<TimeMachinePage />);
    await waitFor(() => expect(screen.getByTestId('time-machine-page')).toBeTruthy());

    for (const label of ['新建内容', '发布', '删除', '保存', '编辑']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    // 只有「查询 / 回到现在」两个动作按钮
    expect(screen.getByTestId('time-machine-query')).toBeTruthy();
    expect(screen.getByTestId('time-machine-now')).toBeTruthy();
  });

  it('关键词筛选立即作用于列表，并把详情切到筛出的第一行', async () => {
    render(<TimeMachinePage />);
    await waitFor(() => expect(screen.getAllByTestId('time-machine-item')).toHaveLength(2));

    fireEvent.change(screen.getByTestId('time-machine-keyword'), { target: { value: '/video' } });

    await waitFor(() => expect(screen.getAllByTestId('time-machine-item')).toHaveLength(1));
    expect(screen.getByTestId('time-machine-detail').textContent).toContain('产品视频');
    expect(screen.getByTestId('time-machine-detail').textContent).not.toContain('夏季促销');
  });

  it('时间点早于内容创建时间时给出明确提示，而不是笼统的「暂无数据」', async () => {
    atMock.mockResolvedValue(snapshot({
      total: 0,
      items: [],
      earliestContentCreatedAt: '2026-09-19T00:00:00Z',
      notYetCreated: 3,
    }));

    render(<TimeMachinePage />);

    await waitFor(() => expect(screen.getByTestId('time-machine-before-creation')).toBeTruthy());
    expect(screen.getByTestId('time-machine-before-creation').textContent).toContain('该时间点早于内容创建时间');
    // 「另有 N 条在该时间点之后才创建」帮助解释列表为什么比现在少
    expect(screen.getByTestId('time-machine-not-yet-created').textContent).toContain('3');
  });

  it('站点本就没有内容时不误报为「早于创建时间」', async () => {
    atMock.mockResolvedValue(snapshot({ total: 0, items: [], earliestContentCreatedAt: null, notYetCreated: 0 }));

    render(<TimeMachinePage />);

    await waitFor(() => expect(screen.getByText('该站点暂无内容')).toBeTruthy());
    expect(screen.queryByTestId('time-machine-before-creation')).toBeNull();
  });

  it('栏目树节点计数含子树（与点击后的列表条数一致），点击后筛选列表', async () => {
    render(<TimeMachinePage />);
    await waitFor(() => expect(screen.getAllByTestId('time-machine-item')).toHaveLength(2));

    const tree = screen.getByTestId('time-machine-category-tree');
    await waitFor(() => expect(tree.textContent).toContain('新闻 (1)'));
    expect(tree.textContent).toContain('视频 (1)');

    fireEvent.click(screen.getByText('视频 (1)'));
    await waitFor(() => expect(screen.getAllByTestId('time-machine-item')).toHaveLength(1));
    expect(screen.getByTestId('time-machine-detail').textContent).toContain('产品视频');
  });

  it('查询失败时提示失败且不影响只读标记（写请求依然被拦）', async () => {
    atMock.mockRejectedValue(new Error('boom'));

    render(<TimeMachinePage />);

    await waitFor(() => expect(atMock).toHaveBeenCalled());
    expect(readonlyMock).toHaveBeenCalledWith(expect.any(String));
    expect(readonlyMock).not.toHaveBeenCalledWith(null);
  });
});
