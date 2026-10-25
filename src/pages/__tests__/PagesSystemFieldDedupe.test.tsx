import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ContentType } from '../../api/types';

const mocks = vi.hoisted(() => ({
  pageList: vi.fn(),
  modelList: vi.fn(),
  templateList: vi.fn(),
  folderTree: vi.fn(),
  contentCreate: vi.fn(),
}));

vi.mock('../../api', () => ({
  pagesApi: { list: mocks.pageList },
  modelsApi: { list: mocks.modelList },
  visualLayoutApi: { templates: mocks.templateList },
  foldersApi: { tree: mocks.folderTree },
  contentsApi: { create: mocks.contentCreate },
  pageCompositionApi: { get: vi.fn().mockResolvedValue(null), save: vi.fn(), unbind: vi.fn() },
  relationsApi: {},
  tagsApi: {},
  categoriesApi: {},
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('../../context/SiteContext', () => ({
  useSite: () => ({ siteId: 'site-1', site: { id: 'site-1', name: '站点' } }),
  RequireSite: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));

import PagesPage from '../Pages';

/**
 * 系统字段瘦身回归（2026-09-22）：模型布局含系统字段 title_s 时，「添加页面」对话框的
 * 内置「标题」输入必须退场（此前内置标题 + 模型表单 title_s 双份输入，且互不同步）。
 *
 * <p>标题由模型表单按设计器排版位置承载，保存时映射为条目级标题（title_s → title）。
 */
describe('添加页面 · 系统字段 title_s 与内置标题去重', () => {
  const modelWithTitleS = {
    id: 'ct-1',
    siteId: 'site-1',
    code: 'news',
    name: '新闻文章',
    status: 'PUBLISHED',
    objectType: 'PAGE',
    templateType: 'PAGE',
    enabled: true,
    fields: [
      { id: 'f-1', code: 'title_s', name: '标题', fieldType: 'STRING', sortOrder: 10, isSystem: true, systemFieldType: 'title' },
      { id: 'f-2', code: 'body_t', name: '正文', fieldType: 'RICH_TEXT', sortOrder: 20 },
    ],
    layout: [],
  } as unknown as ContentType;

  const modelWithoutTitleS = {
    ...modelWithTitleS,
    id: 'ct-2',
    code: 'plain',
    name: '普通页面',
    fields: [{ id: 'f-3', code: 'body_t', name: '正文', fieldType: 'RICH_TEXT', sortOrder: 10 }],
  } as unknown as ContentType;

  /** 页面属性绑定控件模型（2026-09-22）：所属栏目/URL/页面模板/可视化模板 四项 🔒 绑定字段。 */
  const modelWithBindings = {
    ...modelWithTitleS,
    id: 'ct-3',
    code: 'bound',
    name: '绑定页面',
    fields: [
      { id: 'f-1', code: 'title_s', name: '标题', fieldType: 'STRING', sortOrder: 10, isSystem: true, systemFieldType: 'title' },
      { id: 'f-4', code: 'folder_id_s', name: '所属栏目', fieldType: 'STRING', sortOrder: 20, isSystem: true, systemFieldType: 'folder' },
      { id: 'f-5', code: 'route_path_s', name: 'URL', fieldType: 'STRING', sortOrder: 30, isSystem: true, systemFieldType: 'route' },
      { id: 'f-6', code: 'template_path_s', name: '页面模板', fieldType: 'STRING', sortOrder: 40, isSystem: true, systemFieldType: 'template' },
      { id: 'f-7', code: 'visual_template_s', name: '可视化模板', fieldType: 'STRING', sortOrder: 50, isSystem: true, systemFieldType: 'visualTemplate' },
    ],
    layout: [],
  } as unknown as ContentType;

  const openCreateDialog = async (menuLabel: string): Promise<HTMLElement> => {
    render(<PagesPage />);
    const addButton = await screen.findByText('添加页面');
    fireEvent.click(addButton.closest('button') as HTMLElement);
    const menuItem = await screen.findByText(menuLabel);
    fireEvent.click(menuItem);
    return screen.findByRole('dialog');
  };

  beforeEach(() => {
    mocks.pageList.mockResolvedValue([]);
    mocks.templateList.mockResolvedValue([]);
    mocks.folderTree.mockResolvedValue([]);
    mocks.contentCreate.mockResolvedValue({ id: 'page-new' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('模型含 title_s 时只渲染模型表单标题，内置标题输入退场', async () => {
    mocks.modelList.mockResolvedValue([modelWithTitleS]);
    const dialog = await openCreateDialog('新闻文章 (news)');

    // 修复前：内置 Form.Item name="title" 与模型表单 title_s 同时存在（两个标题输入）
    expect(dialog.querySelector('#title_s')).toBeTruthy();
    expect(dialog.querySelector('#title')).toBeNull();
    // 标题在对话框内仅出现一次（模型表单按设计器排版位置渲染）
    expect(within(dialog).getAllByText('标题')).toHaveLength(1);
  });

  it('模型不含 title_s 时保留内置标题输入（兜底）', async () => {
    mocks.modelList.mockResolvedValue([modelWithoutTitleS]);
    const dialog = await openCreateDialog('普通页面 (plain)');

    expect(dialog.querySelector('#title')).toBeTruthy();
    expect(dialog.querySelector('#title_s')).toBeNull();
  });

  it('保存时 title_s 映射为条目级标题，并原样进入 fieldValues 契约码', async () => {
    mocks.modelList.mockResolvedValue([modelWithTitleS]);
    const dialog = await openCreateDialog('新闻文章 (news)');

    fireEvent.change(dialog.querySelector('#title_s') as HTMLElement, {
      target: { value: '新闻标题' },
    });
    fireEvent.click(within(dialog).getByText('创建页面'));

    await waitFor(() => expect(mocks.contentCreate).toHaveBeenCalled());
    const payload = mocks.contentCreate.mock.calls[0][1];
    expect(payload.title).toBe('新闻标题');
    expect(String(payload.fieldValues)).toContain('"title_s"');
    expect(String(payload.fieldValues)).toContain('新闻标题');
  });

  it('模型含页面属性绑定时内置输入项退场（绑定控件按布局渲染）', async () => {
    mocks.modelList.mockResolvedValue([modelWithBindings]);
    const dialog = await openCreateDialog('绑定页面 (bound)');

    // 内置页面属性输入项全部退场
    expect(dialog.querySelector('#folderId')).toBeNull();
    expect(dialog.querySelector('#routePath')).toBeNull();
    expect(dialog.querySelector('#templatePath')).toBeNull();
    expect(dialog.querySelector('#visualTemplateId')).toBeNull();
    // 绑定控件各渲染一次（ModelFormRenderer 按设计器布局位置渲染）
    for (const label of ['所属栏目', 'URL', '页面模板', '可视化模板']) {
      expect(within(dialog).getAllByText(label)).toHaveLength(1);
    }
    expect(dialog.querySelector('#route_path_s')).toBeTruthy();
    expect(dialog.querySelector('#template_path_s')).toBeTruthy();
  });

  it('页面属性绑定值映射条目级实体列，且不入 fieldValues', async () => {
    mocks.modelList.mockResolvedValue([modelWithBindings]);
    const dialog = await openCreateDialog('绑定页面 (bound)');

    fireEvent.change(dialog.querySelector('#title_s') as HTMLElement, {
      target: { value: '绑定标题' },
    });
    fireEvent.change(dialog.querySelector('#route_path_s') as HTMLElement, {
      target: { value: '/bound/path' },
    });
    fireEvent.change(dialog.querySelector('#template_path_s') as HTMLElement, {
      target: { value: '/templates/bound.ftl' },
    });
    fireEvent.click(within(dialog).getByText('创建页面'));

    await waitFor(() => expect(mocks.contentCreate).toHaveBeenCalled());
    const payload = mocks.contentCreate.mock.calls[0][1];
    // 值映射条目级实体列（folder_id/route_path/template_path；可视化模板走页面组成绑定）
    expect(payload.routePath).toBe('/bound/path');
    expect(payload.templatePath).toBe('/templates/bound.ftl');
    // 绑定值不入 fieldValues（无镜像；title_s 为契约码例外仍写入）
    expect(String(payload.fieldValues)).not.toContain('route_path_s');
    expect(String(payload.fieldValues)).not.toContain('template_path_s');
    expect(String(payload.fieldValues)).toContain('title_s');
  });
});
