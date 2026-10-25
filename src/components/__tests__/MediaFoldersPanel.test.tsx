import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { treeMock, createMock, moveMock } = vi.hoisted(() => ({
  treeMock: vi.fn(),
  createMock: vi.fn(),
  moveMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  mediaFolderApi: {
    tree: treeMock,
    get: vi.fn(),
    create: createMock,
    move: moveMock,
  },
}));

const capability = vi.hoisted(() => ({ write: true }));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ me: { id: 'u1' } }),
  hasCapability: (_me: unknown, _siteId: unknown, cap: string) => (cap === 'write' ? capability.write : true),
}));

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const messageMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, message: messageMock };
});

import { MediaFoldersPanel } from '../MediaFoldersPanel';

const folders = [
  {
    id: 'f-1', siteId: 'site-1', parentId: null, name: 'images', path: '/images',
    sortOrder: 0, depth: 0, directAssetCount: 1, totalAssetCount: 3,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'f-2', siteId: 'site-1', parentId: 'f-1', name: '2026', path: '/images/2026',
    sortOrder: 0, depth: 1, directAssetCount: 2, totalAssetCount: 2,
    createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  },
];

describe('MediaFoldersPanel', () => {
  beforeEach(() => {
    capability.write = true;
    treeMock.mockReset().mockResolvedValue(folders);
    createMock.mockReset().mockResolvedValue(folders[0]);
    moveMock.mockReset().mockResolvedValue(folders[1]);
    messageMock.success.mockReset();
    messageMock.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads the folder tree with paths and asset counts', async () => {
    render(<MediaFoldersPanel siteId="site-1" />);

    await waitFor(() => expect(treeMock).toHaveBeenCalledWith('site-1'), { timeout: 5000 });
    expect((await screen.findAllByText('/images', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(screen.getByText('/images/2026')).toBeTruthy();
    // 根级标记 + 资产计数字段（直属/累计）
    expect(screen.getByText('根级')).toBeTruthy();
    expect(screen.getByText('直属资产')).toBeTruthy();
    expect(screen.getByText('累计资产')).toBeTruthy();
  }, 30000);

  it('creates a root-level folder with the parent defaulting to root', async () => {
    render(<MediaFoldersPanel siteId="site-1" />);
    await screen.findAllByText('/images', {}, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /新建目录/ }));
    fireEvent.change(await screen.findByPlaceholderText('如：banners'), { target: { value: 'banners' } });
    fireEvent.click(screen.getByRole('button', { name: /确认创建/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith('site-1', {
      name: 'banners', parentId: null,
    }), { timeout: 15000 });
    expect(messageMock.success).toHaveBeenCalledWith('媒体目录已创建');
  }, 30000);

  it('requires a folder name before creating', async () => {
    render(<MediaFoldersPanel siteId="site-1" />);
    await screen.findAllByText('/images', {}, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /新建目录/ }));
    fireEvent.click(await screen.findByRole('button', { name: /确认创建/ }));

    await waitFor(() => expect(createMock).not.toHaveBeenCalled(), { timeout: 15000 });
  }, 30000);

  it('moves a folder to the selected parent (defaults to root)', async () => {
    render(<MediaFoldersPanel siteId="site-1" />);
    await screen.findAllByText('/images', {}, { timeout: 5000 });

    // 行序按物化路径：[/images, /images/2026]，取第二行（子目录）的搬移按钮
    fireEvent.click(screen.getAllByRole('button', { name: '搬移目录' })[1]);
    fireEvent.click(await screen.findByRole('button', { name: /确认搬移/ }));

    await waitFor(() => expect(moveMock).toHaveBeenCalledWith('site-1', 'f-2', { parentId: null }),
      { timeout: 15000 });
    expect(messageMock.success).toHaveBeenCalledWith('媒体目录已搬移（子目录与资产挂载路径同步更新）');
  }, 30000);

  it('keeps folders read-only without write capability', async () => {
    capability.write = false;
    render(<MediaFoldersPanel siteId="site-1" />);
    await screen.findAllByText('/images', {}, { timeout: 5000 });

    expect((screen.getByRole('button', { name: /新建目录/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('当前站点角色无 write 能力，仅可查看媒体目录。')).toBeTruthy();
  }, 30000);
});
