import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 回归：内容检索列表 → 点击检索结果（打开编辑器）时，非 PAGE 内容也会去取「页面组成绑定」。
 * 后端对非 PAGE 条目回 400「只有 PAGE 类型可以作为页面渲染」，这是**预期内**的降级，
 * 调用方已 `.catch(() => null)`，因此必须带 QUIET，否则全局拦截器会弹这条与用户无关的错误。
 */
const { treeMock, modelListMock, modelGetMock, folderTreeMock, searchMock, contentGetMock, versionsMock, compositionGetMock } =
  vi.hoisted(() => ({
    treeMock: vi.fn(),
    modelListMock: vi.fn(),
    modelGetMock: vi.fn(),
    folderTreeMock: vi.fn(),
    searchMock: vi.fn(),
    contentGetMock: vi.fn(),
    versionsMock: vi.fn(),
    compositionGetMock: vi.fn(),
  }));

vi.mock('../../api', () => ({
  categoriesApi: { tree: treeMock },
  contentsApi: {
    search: searchMock,
    get: contentGetMock,
    versions: versionsMock,
    setStatus: vi.fn(),
    batchStatus: vi.fn(),
    batchDelete: vi.fn(),
  },
  foldersApi: { tree: folderTreeMock },
  modelsApi: { list: modelListMock, get: modelGetMock },
  pageCompositionApi: { get: compositionGetMock },
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

const row = {
  id: 'c1',
  siteId: 'site-1',
  contentTypeId: 'ct-1',
  objectType: 'SHARED',
  title: '数字资源条目',
  status: 'DRAFT',
  currentVersion: 1,
};

describe('内容搜索：非 PAGE 内容打开编辑器', () => {
  afterEach(() => cleanup());

  it('页面组成绑定查询走 QUIET，不弹「只有 PAGE 类型可以作为页面渲染」', async () => {
    treeMock.mockResolvedValue([]);
    folderTreeMock.mockResolvedValue([]);
    modelListMock.mockResolvedValue([
      { id: 'ct-1', code: 'digital_asset', name: '数字资源', status: 'PUBLISHED', version: 1, objectType: 'SHARED' },
    ]);
    modelGetMock.mockResolvedValue({
      id: 'ct-1',
      code: 'digital_asset',
      name: '数字资源',
      status: 'PUBLISHED',
      version: 1,
      objectType: 'SHARED',
      fields: [],
      layout: [],
    });
    searchMock.mockResolvedValue([row]);
    contentGetMock.mockResolvedValue(row);
    versionsMock.mockResolvedValue([{ id: 'v1', version: 1, status: 'DRAFT', fieldValues: '{}' }]);
    compositionGetMock.mockRejectedValue(
      Object.assign(new Error('只有 PAGE 类型可以作为页面渲染'), {
        response: { status: 400, data: { code: 'VALIDATION_FAILED', message: '只有 PAGE 类型可以作为页面渲染' } },
      }),
    );

    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '数字资源条目' }));

    await waitFor(() =>
      expect(compositionGetMock).toHaveBeenCalledWith('site-1', 'c1', { skipGlobalErrorToast: true }),
    );
    // 降级为空绑定：编辑器照常打开，不因为「不是 PAGE」阻断编辑
    await waitFor(() => expect(document.querySelector('.content-editor-modal')).toBeTruthy());
  });
});
