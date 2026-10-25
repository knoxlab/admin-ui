import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContentItem, ContentType, FieldDef } from '../../api/types';
import ContentRefPicker from '../ContentRefPicker';

const { listMock, searchMock, getMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  searchMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('../../api', () => ({
  modelsApi: { list: listMock },
  contentsApi: { search: searchMock, get: getMock },
}));

afterEach(() => cleanup());

function makeType(overrides: Partial<ContentType> & { id: string; code: string; name: string }): ContentType {
  return {
    version: 1,
    status: 'PUBLISHED',
    templateType: 'PAGE',
    objectType: 'PAGE',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ContentItem> & { id: string; title: string; contentTypeId: string }): ContentItem {
  return {
    siteId: 'site-1',
    status: 'DRAFT',
    currentVersion: 1,
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const article = makeType({ id: 'type-article', code: 'article', name: '文章' });
const news = makeType({ id: 'type-news', code: 'news', name: '新闻' });
const movie = makeType({ id: 'type-movie', code: 'movie', name: '电影', objectType: 'MEDIA' });
const member = makeType({ id: 'type-member', code: 'member', name: '会员资料', isSystem: true });
const retired = makeType({ id: 'type-retired', code: 'retired', name: '已废弃', status: 'DEPRECATED' });

function field(config: Record<string, unknown> = {}): FieldDef {
  return {
    code: 'field7_s',
    name: '内容引用',
    fieldType: 'CONTENT_REF',
    required: false,
    sortOrder: 0,
    readOnly: false,
    i18n: false,
    adminIndex: false,
    publicIndex: false,
    sortable: false,
    filterable: false,
    highlight: false,
    fieldConfig: config,
  };
}

describe('ContentRefPicker', () => {
  beforeEach(() => {
    listMock.mockReset();
    searchMock.mockReset();
    getMock.mockReset();
    getMock.mockResolvedValue(null);
    listMock.mockResolvedValue([article, news, movie, member, retired]);
    searchMock.mockImplementation(async (_siteId: string, params: { contentTypeId?: string; keyword?: string }) => {
      const rows = [
        makeItem({ id: 'a1', title: '手册', contentTypeId: article.id, createdAt: '2026-10-02T00:00:00Z' }),
        makeItem({ id: 'n1', title: '今日新闻', contentTypeId: news.id, status: 'PUBLISHED', createdAt: '2026-10-03T00:00:00Z' }),
        makeItem({ id: 'm1', title: '示例电影', contentTypeId: movie.id, status: 'PUBLISHED', createdAt: '2026-10-04T00:00:00Z' }),
      ];
      return rows.filter((row) => row.contentTypeId === params.contentTypeId
        && (!params.keyword || row.title.includes(params.keyword)));
    });
  });

  it('只列出内容搜索允许的模型，排除媒体库和系统类型', async () => {
    render(<ContentRefPicker field={field()} siteId="site-1" />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));

    expect(await screen.findByText('手册')).toBeTruthy();
    expect(screen.getByText('今日新闻')).toBeTruthy();
    expect(screen.queryByText('示例电影')).toBeNull();
    const typeIds = searchMock.mock.calls.map((call) => call[1].contentTypeId);
    expect(typeIds).toContain(article.id);
    expect(typeIds).toContain(news.id);
    expect(typeIds).not.toContain(movie.id);
    expect(typeIds).not.toContain(member.id);
    expect(typeIds).not.toContain(retired.id);
  });

  it('字段允许媒体类型时仍不超出内容搜索范围', async () => {
    render(<ContentRefPicker field={field({ allowedContentTypes: ['movie'] })} siteId="site-1" />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));
    expect(await screen.findByText('没有可引用的内容类型')).toBeTruthy();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('只检索字段允许的内容类型，并按标题检索', async () => {
    render(<ContentRefPicker field={field({ allowedContentTypes: ['article'] })} siteId="site-1" />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));
    expect(await screen.findByText('手册')).toBeTruthy();
    expect(screen.queryByText('今日新闻')).toBeNull();

    const input = screen.getByPlaceholderText('搜索标题');
    fireEvent.change(input, { target: { value: '不存在' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(searchMock.mock.calls.some((call) => call[1].keyword === '不存在')).toBe(true);
    });
    await waitFor(() => expect(screen.queryByText('手册')).toBeNull());
  });

  it('单选确定后回写内容编号，多选回写数组', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ContentRefPicker field={field()} siteId="site-1" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));
    fireEvent.click(await screen.findByText('手册'));
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));
    expect(onChange).toHaveBeenCalledWith('a1');

    onChange.mockClear();
    rerender(<ContentRefPicker field={field({ allowMultiple: true })} siteId="site-1" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));
    fireEvent.click(await screen.findByText('手册'));
    fireEvent.click(screen.getByText('今日新闻'));
    fireEvent.click(screen.getByRole('button', { name: /^选\s*择$/ }));
    expect(onChange).toHaveBeenCalledWith(['a1', 'n1']);
  });

  it('列表超过一页时先展示一页', async () => {
    searchMock.mockImplementation(async (_siteId: string, params: { contentTypeId?: string }) => {
      if (params.contentTypeId !== article.id) return [];
      return Array.from({ length: 30 }, (_, index) => makeItem({
        id: `row-${index}`,
        title: `长列表${index}`,
        contentTypeId: article.id,
        createdAt: `2026-10-${String(30 - index).padStart(2, '0')}T00:00:00Z`,
      }));
    });
    render(<ContentRefPicker field={field({ allowedContentTypes: ['article'] })} siteId="site-1" />);
    fireEvent.click(screen.getByRole('button', { name: /选择内容/ }));
    expect(await screen.findByText('长列表0')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText(/长列表/).length).toBe(24);
    });
  });
});
