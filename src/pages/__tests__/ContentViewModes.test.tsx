import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 内容搜索：缩略图 / 列表 / 表格三种显示方式（下拉切换），
 * 以及「内容无预览图时回退默认图片」。
 */

const { treeMock, modelListMock, folderTreeMock, searchMock } = vi.hoisted(() => ({
  treeMock: vi.fn(),
  modelListMock: vi.fn(),
  folderTreeMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  categoriesApi: { tree: treeMock },
  contentsApi: { search: searchMock, setStatus: vi.fn(), batchStatus: vi.fn(), batchDelete: vi.fn() },
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
vi.mock('../../components/BatchAiPanel', () => ({ default: () => null }));
vi.mock('../../components/AiAssistantPanel', () => ({ default: () => null }));
vi.mock('../../components/AiCitationStatPanel', () => ({ default: () => null }));
vi.mock('../../components/SitePermissionsModal', () => ({ default: () => null }));
vi.mock('../../components/ShareIssueModal', () => ({ default: () => null }));

import ContentPage from '../Content';

const PREVIEW_ASSET = '7f0f0b9e-53c1-4a6e-9a0b-2f8c1d7e4a11';

function item(id: string, title: string, previewImage?: string) {
  return {
    id,
    siteId: 'site-1',
    contentTypeId: 'ct-1',
    title,
    status: 'DRAFT',
    currentVersion: 1,
    previewImage,
  };
}

async function switchView(current: string, next: string) {
  fireEvent.click(screen.getByRole('button', { name: '切换显示方式' }));
  let scope!: HTMLElement;
  await waitFor(() => {
    scope = document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)') as HTMLElement;
    expect(scope).toBeTruthy();
  });
  fireEvent.click(within(scope).getByText(next));
  await waitFor(() => expect(screen.getByRole('button', { name: '切换显示方式' }).textContent).toContain(next));
  expect(current).not.toBe(next);
}

describe('内容搜索：列表显示方式', () => {
  beforeEach(() => {
    localStorage.removeItem('powercms.content.viewMode');
    treeMock.mockResolvedValue([]);
    modelListMock.mockResolvedValue([
      { id: 'ct-1', code: 'news', title: '新闻', status: 'PUBLISHED', version: 1, objectType: 'SHARED', isSystem: false },
    ]);
    folderTreeMock.mockResolvedValue([]);
    searchMock.mockResolvedValue([
      item('c1', '有图文章', PREVIEW_ASSET),
      item('c2', '无图文章'),
    ]);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem('powercms.content.viewMode');
  });

  it('下拉菜单可切换缩略图 / 列表 / 表格，缺预览图使用默认图片', async () => {
    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>,
    );
    await screen.findByText('有图文章');

    // 默认表格
    expect(document.querySelector('.ant-table')).toBeTruthy();

    await switchView('表格', '缩略图');
    expect(document.querySelector('.content-thumb-grid')).toBeTruthy();
    await screen.findByText('无图文章');
    const covers = Array.from(document.querySelectorAll('.content-thumb-cover img')) as HTMLImageElement[];
    expect(covers.map((img) => img.getAttribute('src'))).toEqual(
      expect.arrayContaining([`/media-thumb/site-1/${PREVIEW_ASSET}`]),
    );
    expect(covers.some((img) => (img.getAttribute('src') ?? '').includes('content-placeholder'))).toBe(true);

    await switchView('缩略图', '列表');
    expect(document.querySelector('.content-list-view')).toBeTruthy();

    await switchView('列表', '表格');
    expect(document.querySelector('.ant-table')).toBeTruthy();
  });
});
