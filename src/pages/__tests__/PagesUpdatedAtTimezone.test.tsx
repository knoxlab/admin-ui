import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import type { PageInfo } from '../../api/types';

const mocks = vi.hoisted(() => ({
  pageList: vi.fn(),
  modelList: vi.fn(),
  templateList: vi.fn(),
  folderTree: vi.fn(),
}));

vi.mock('../../api', () => ({
  pagesApi: { list: mocks.pageList },
  modelsApi: { list: mocks.modelList },
  visualLayoutApi: { templates: mocks.templateList },
  foldersApi: { tree: mocks.folderTree },
  // Pages 模块顶层还会引入其余 api 命名空间（内容编辑器跳转、页面组成），给空壳即可
  contentsApi: {},
  pageCompositionApi: {},
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({ siteId: 'site-1', site: { id: 'site-1', name: '站点' } }),
  RequireSite: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));

import PagesPage from '../Pages';

/**
 * DEF-KB-03 回归：页面管理列表的「最后编辑」必须按**本地时区**渲染。
 *
 * <p>缺陷成因：列渲染直接对后端 ISO 串做 `replace('T', ' ').slice(0, 19)`，把 UTC 墙钟当本地墙钟显示
 * （实测本地 `12:48:07` 被显示为 `04:48:07`，与同一条内容在「文章列表 / AI 问答日志」里的时间差 8 小时）。
 * 现改走 `utils/datetime.formatDateTimeSeconds`（`dayjs` 本地化）。
 *
 * <p>断言刻意用 `dayjs` 计算期望值而非写死字符串：测试环境时区不同（CI 常为 UTC）时仍然成立，
 * 只有在**非 UTC** 环境下才额外验证「不再等于原始 UTC 切片」——那正是本缺陷的形态。
 */
describe('页面管理 · 最后编辑时间列（DEF-KB-03）', () => {
  /** 后端 `Instant` 序列化形态：UTC 瞬时（本地东八区应为 12:48:07）。 */
  const UTC_INSTANT = '2026-09-20T04:48:07Z';

  const page: PageInfo = {
    id: 'p-1',
    title: 'ZXQ 页面',
    routePath: '/zxq',
    status: 'PUBLISHED',
    contentTypeId: 'ct-1',
    currentVersion: 1,
    updatedAt: UTC_INSTANT,
  };

  beforeEach(() => {
    mocks.pageList.mockResolvedValue([page]);
    mocks.modelList.mockResolvedValue([]);
    mocks.templateList.mockResolvedValue([]);
    mocks.folderTree.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染为本地墙钟，而不是原始 ISO 串的 UTC 切片', async () => {
    render(<PagesPage />);

    const expected = dayjs(UTC_INSTANT).format('YYYY-MM-DD HH:mm:ss');
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
    if (dayjs().utcOffset() !== 0) {
      // 非 UTC 环境（本地开发为东八区）：原始 UTC 切片必须**不再出现**——这正是缺陷形态本身
      expect(screen.queryByText('2026-09-20 04:48:07')).toBeNull();
    }
  });
});
