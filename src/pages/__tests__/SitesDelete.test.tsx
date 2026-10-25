import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * FR-SITE-LC-007 归档站点删除的前端契约：
 * 1. 删除按钮只出现在已归档站点上（进行中站点无入口）；
 * 2. 点击先请求删除预览——有外部引用阻断项时逐条**提示**，确认按钮禁用（不允许删除）；
 * 3. 可删除时展示影响面与不可撤销警告，确认后调用删除接口并刷新列表。
 */
const { listMock, previewMock, deleteMock, refreshMock, tFn } = vi.hoisted(() => ({
  listMock: vi.fn(),
  previewMock: vi.fn(),
  deleteMock: vi.fn(),
  refreshMock: vi.fn(),
  /** 中文原文即键 + {count} 插值（与生产 t() 同语义，便于断言插值后的提示文案）。 */
  tFn: (key: string, vars?: Record<string, string | number>) =>
    vars
      ? key.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m))
      : key,
}));

vi.mock('../../api', () => ({
  sitesApi: {
    list: listMock,
    get: vi.fn(),
    create: vi.fn(),
    freeze: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    deletionPreview: previewMock,
    delete: deleteMock,
    members: vi.fn(),
    authorizationPolicy: vi.fn(),
    saveAuthorizationPolicy: vi.fn(),
    accessGuidance: vi.fn(),
    saveAccessGuidance: vi.fn(),
    accessAudit: vi.fn(),
  },
}));

vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({
    sites: [{ id: 'site-active', siteKey: 'live', name: '进行中站点', status: 'ACTIVE',
      createdAt: '', updatedAt: '' }],
    refresh: refreshMock,
    setSiteId: vi.fn(),
    siteId: 'site-active',
  }),
  RequireSite: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../i18n/locale', () => ({ t: tFn }));
vi.mock('../../components/SitePermissionsModal', () => ({ default: () => null }));

import SitesPage from '../Sites';
import { message } from 'antd';

const ARCHIVED = { id: 'site-arch', siteKey: 'old', name: '归档旧站', status: 'ARCHIVED',
  createdAt: '', updatedAt: '' };

/** 渲染并切到「已归档」页签，返回归档站点的删除按钮。 */
async function openArchivedTab() {
  render(<SitesPage />);
  fireEvent.click(await screen.findByRole('tab', { name: /已归档/ }));
  await waitFor(() => expect(listMock).toHaveBeenCalled());
  return await screen.findByTestId('site-delete-button');
}

describe('站点与环境 · 归档站点删除（FR-SITE-LC-007）', () => {
  beforeEach(() => {
    // 默认：归档列表能取到归档站点（各用例可再覆盖）
    listMock.mockReset().mockResolvedValue([ARCHIVED]);
    previewMock.mockReset();
    deleteMock.mockReset();
    refreshMock.mockReset().mockResolvedValue(undefined);
    deleteMock.mockResolvedValue(undefined);
    vi.mocked(message.success).mockClear();
  });

  afterEach(() => cleanup());

  it('删除入口只在已归档站点上（进行中站点不显示删除按钮）', async () => {
    render(<SitesPage />);
    // 进行中页签只有 ACTIVE 站点：无删除按钮
    expect(screen.queryByTestId('site-delete-button')).toBeNull();

    fireEvent.click(await screen.findByRole('tab', { name: /已归档/ }));
    expect(await screen.findByTestId('site-delete-button')).toBeTruthy();
    // 请求带上了归档状态过滤
    expect(listMock).toHaveBeenCalledWith({ status: 'ARCHIVED' });
  });

  it('预览有阻断项时逐条提示外部引用，确认按钮禁用（先提示、不删除）', async () => {
    previewMock.mockResolvedValue({
      siteId: ARCHIVED.id,
      status: 'ARCHIVED',
      impact: { content_type: 2, content_item: 4 },
      blockers: [{ code: 'USER_HOME_SITE', message: '被 2 个用户设为主站点', count: 2 }],
      deletable: false,
    });

    const deleteButton = await openArchivedTab();
    fireEvent.click(deleteButton);

    await waitFor(() => expect(previewMock).toHaveBeenCalledWith(ARCHIVED.id));
    // 阻断提示（按 code 本地化 + {count} 插值）
    expect(await screen.findByText('无法删除')).toBeTruthy();
    expect(screen.getByText('被 2 个用户设为主站点，请先改绑或清空其主站点')).toBeTruthy();
    // 影响面照常展示
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')
        .some((li) => li.textContent?.includes('内容类型：2'))).toBe(true);
    });
    // 不可删：确认按钮禁用，删除接口从未被调用
    expect((screen.getByRole('button', { name: '永久删除' }) as HTMLButtonElement).disabled).toBe(true);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('无阻断项时展示不可撤销警告，确认后调用删除接口并刷新', async () => {
    previewMock.mockResolvedValue({
      siteId: ARCHIVED.id,
      status: 'ARCHIVED',
      impact: { content_type: 3, content_item: 7 },
      blockers: [],
      deletable: true,
    });

    const deleteButton = await openArchivedTab();
    fireEvent.click(deleteButton);

    // 不可撤销警告 + 影响面
    expect(await screen.findByText(/此操作不可撤销/)).toBeTruthy();
    expect(screen.getAllByRole('listitem')
      .some((li) => li.textContent?.includes('内容类型：3'))).toBe(true);

    const confirm = screen.getByRole('button', { name: '永久删除' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(ARCHIVED.id));
    await waitFor(() => expect(message.success).toHaveBeenCalledWith('站点已删除'));
    // 删除后刷新（进行中 + 已归档两个列表）
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(2));
  });
});
