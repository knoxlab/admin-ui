import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 内容搜索页：行内归档/删除 + 批量操作条（提交审核 / 发布 / 设为草稿 / 归档 / 删除）。
 *
 * <p>重点锁定三件会直接影响「能否用」的事：</p>
 * <ol>
 *   <li><b>仅已归档可删除</b>：未归档行的「删除」置灰（点了才报错是糟糕体验，且服务端同样拒绝）；</li>
 *   <li><b>删除必须确认</b>：单条与批量删除都走 Modal.confirm，不可一键误删；</li>
 *   <li><b>批量走单次请求</b>：批量状态/删除各发一个请求（后端逐条成败），不是前端循环 N 次。</li>
 * </ol>
 */

const {
  treeMock, modelListMock, folderTreeMock, searchMock,
  setStatusMock, batchStatusMock, batchDeleteMock,
} = vi.hoisted(() => ({
  treeMock: vi.fn(),
  modelListMock: vi.fn(),
  folderTreeMock: vi.fn(),
  searchMock: vi.fn(),
  setStatusMock: vi.fn(),
  batchStatusMock: vi.fn(),
  batchDeleteMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  categoriesApi: { tree: treeMock },
  contentsApi: {
    search: searchMock,
    setStatus: setStatusMock,
    batchStatus: batchStatusMock,
    batchDelete: batchDeleteMock,
  },
  foldersApi: { tree: folderTreeMock },
  modelsApi: { list: modelListMock },
  pageCompositionApi: {},
  previewApi: {},
  sitesApi: {},
  usersApi: {},
  workflowApi: {},
}));
vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({ siteId: 'site-1' }),
  RequireSite: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ me: {} }),
  hasCapability: () => true,
}));
// 编辑器/面板组件不在本测试关注面内，置空避免拉入各自的 API 依赖
vi.mock('../../components/BatchAiPanel', () => ({ default: () => null }));
vi.mock('../../components/AiAssistantPanel', () => ({ default: () => null }));
vi.mock('../../components/AiCitationStatPanel', () => ({ default: () => null }));
vi.mock('../../components/SitePermissionsModal', () => ({ default: () => null }));
vi.mock('../../components/ShareIssueModal', () => ({ default: () => null }));

import ContentPage from '../Content';

function item(id: string, title: string, status: string) {
  return {
    id, siteId: 'site-1', contentTypeId: 'ct-1', title, status,
    currentVersion: 1, updatedAt: '2026-10-10T06:00:00Z',
  };
}

async function renderSearched() {
  render(
    <MemoryRouter>
      <ContentPage />
    </MemoryRouter>,
  );
  // 首屏自动检索：等列表出现再交互
  await screen.findByText('草稿文章');
}

/**
 * 批量条按钮查询：antd Button 对「恰好两个汉字」的文案会插入空格（无障碍名成「发 布」），
 * 因此归档/发布/删除这类两字按钮必须用正则匹配。
 */
function barButton(label: string) {
  const twoCjk = label.split('').join('\\s*');
  return screen.getByRole('button', { name: new RegExp(`^\\s*${twoCjk}\\s*$`) });
}

/** 行操作下拉默认 hover 触发，jsdom 里用 mouseOver 打开；关闭的下拉仍挂在 DOM 上，需限定到可见容器。 */
async function openRowMenu(index: number) {
  fireEvent.mouseOver(screen.getAllByLabelText('更多操作')[index]);
  let scope!: HTMLElement;
  await waitFor(() => {
    scope = document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)') as HTMLElement;
    expect(scope).toBeTruthy();
  });
  return within(scope);
}

/**
 * 等确认弹窗出现并返回其标题节点。
 * antd confirm 为异步渲染且单例复用同一节点（残留弹窗会先带着旧标题命中查询），
 * 因此必须等到标题是期望内容，而不是仅仅存在。
 */
async function confirmTitle(expected: string) {
  let title!: HTMLElement;
  await waitFor(() => {
    title = document.querySelector('.ant-modal-confirm-title') as HTMLElement;
    expect(title?.textContent).toContain(expected);
  });
  return title;
}

/** 点确认按钮：等弹窗渲染完成（静态 confirm 异步挂载，同步点击会拿不到节点）。 */
async function confirmOk() {
  await waitFor(() => {
    const oks = document.querySelectorAll('.ant-modal-confirm-btns .ant-btn-primary');
    expect(oks.length).toBeGreaterThan(0);
    fireEvent.click(oks[oks.length - 1] as Element);
  });
}

/** 全选（表头勾选框）→ 批量条出现。 */
function selectAll() {
  const header = document.querySelector('.ant-table-thead .ant-checkbox-input');
  fireEvent.click(header as Element);
}

describe('内容搜索：归档/删除与批量操作', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // 清跨用例的调用历史（保留各自 mockResolvedValue 于下方重设）
    treeMock.mockResolvedValue([]);
    modelListMock.mockResolvedValue([
      { id: 'ct-1', code: 'news', title: '新闻', status: 'PUBLISHED', version: 1, objectType: 'SHARED', isSystem: false },
    ]);
    folderTreeMock.mockResolvedValue([]);
    searchMock.mockResolvedValue([
      item('c1', '草稿文章', 'DRAFT'),
      item('c2', '审核中文章', 'IN_REVIEW'),
      item('c3', '已归档文章', 'ARCHIVED'),
    ]);
    setStatusMock.mockResolvedValue(undefined);
    batchStatusMock.mockResolvedValue({ succeeded: ['c1'], failed: [] });
    batchDeleteMock.mockResolvedValue({ succeeded: ['c3'], failed: [] });
  });

  afterEach(() => cleanup());

  it('未归档行的删除置灰，归档行可删除且需确认', async () => {
    await renderSearched();

    // 草稿行：删除置灰（未归档不可删）
    const menu0 = await openRowMenu(0);
    const draftDelete = await menu0.findByRole('menuitem', { name: '删除' });
    expect(draftDelete.closest('li')!.className).toContain('disabled');
    fireEvent.mouseLeave(screen.getAllByLabelText('更多操作')[0]);
    await waitFor(() => {
      expect(document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)')).toBeFalsy();
    });

    // 归档行：删除可用 → 点击弹确认 → 确认后调批量删除（单条）
    const menu2 = await openRowMenu(2);
    const archivedDelete = await menu2.findByRole('menuitem', { name: '删除' });
    expect(archivedDelete.closest('li')!.className).not.toContain('disabled');
    fireEvent.click(archivedDelete);
    await confirmOk();
    await waitFor(() => expect(batchDeleteMock).toHaveBeenCalledWith('site-1', ['c3']));
  });

  it('勾选后出现批量条，批量归档一次请求', async () => {
    await renderSearched();
    selectAll();
    await screen.findByText('已选中 3 条内容');

    fireEvent.click(barButton('归档'));
    await waitFor(() => expect(batchStatusMock).toHaveBeenCalledWith('site-1', ['c1', 'c2', 'c3'], 'ARCHIVED'));
  });

  it('批量发布需二次确认，批量删除不可跳过确认', async () => {
    await renderSearched();
    selectAll();
    await screen.findByText('已选中 3 条内容');

    // 发布：确认弹窗出现前不发请求
    fireEvent.click(barButton('发布'));
    await confirmTitle('批量发布 3 条内容');
    expect(batchStatusMock).not.toHaveBeenCalled();
    await confirmOk();
    await waitFor(() => expect(batchStatusMock).toHaveBeenCalledWith('site-1', ['c1', 'c2', 'c3'], 'PUBLISHED'));

    // 删除：同样必须过确认
    batchStatusMock.mockClear();
    fireEvent.click(barButton('删除'));
    await confirmTitle('批量删除 3 条内容');
    expect(batchDeleteMock).not.toHaveBeenCalled();
    await confirmOk();
    await waitFor(() => expect(batchDeleteMock).toHaveBeenCalledWith('site-1', ['c1', 'c2', 'c3']));
  });
});
