// 工作流待办 → 内容只读审核视图：字段必须按内容模型的表单布局与顺序展示，
// 且不渲染任何输入控件（审核弹窗只读，不提供改动内容的入口）。
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContentReadOnlyView, { htmlToPlainText, readOnlyValueText } from '../ContentReadOnlyView';
import type { ContentType, FieldDef, LayoutElement } from '../../api/types';

vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));
vi.mock('../../api', () => ({
  contentsApi: {},
  foldersApi: {},
  relationsApi: {},
  visualLayoutApi: {},
}));

afterEach(() => cleanup());

const field = (code: string, fieldType = 'TEXT', name = `字段${code}`): FieldDef => ({
  code,
  name,
  fieldType,
  required: false,
  sortOrder: 0,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
});

/** 设计器序列化的一行：子字段 sortOrder 按 (列号+1)*1000+序号 编码列位。 */
const rowSection = (columns: FieldDef[][], spans: number[] = []): LayoutElement => ({
  elementType: 'FORM_SECTION',
  sortOrder: 1,
  config: { title: '', variableName: 'row', columns: columns.length, ...(spans.length ? { columnSpans: spans } : {}) },
  children: columns.flatMap((cols, col) =>
    cols.map((f, i) => ({
      elementType: 'FIELD' as const,
      sortOrder: (col + 1) * 1000 + i + 1,
      field: f,
      children: [],
    })),
  ),
});

const type = (layout: LayoutElement[], fields: FieldDef[] = []): ContentType => ({
  id: 'ct-1',
  siteId: 's1',
  code: 'article',
  name: '文章',
  templateType: 'PAGE',
  version: 1,
  status: 'PUBLISHED',
  layout,
  fields,
} as unknown as ContentType);

describe('ContentReadOnlyView（按模型布局只读渲染）', () => {
  it('页签组按模型顺序渲染，字段出现在其页签页面内', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'TAB',
        sortOrder: 1,
        config: { title: 'Tabs 1' },
        children: [
          {
            elementType: 'FORM_SECTION',
            sortOrder: 1,
            config: { title: '基本信息', tabId: 'tab-a' },
            children: [rowSection([[field('title_s'), field('subtitle_s')]], [6, 6])],
          },
          {
            elementType: 'FORM_SECTION',
            sortOrder: 2,
            config: { title: '正文', tabId: 'tab-b' },
            children: [rowSection([[field('body_s', 'LONG_TEXT')]])],
          },
        ],
      },
    ];
    render(
      <ContentReadOnlyView
        type={type(layout)}
        siteId="s1"
        values={{ title_s: '标题值', subtitle_s: '副标题值', body_s: '正文内容' }}
      />,
    );

    expect(screen.getByText('基本信息')).toBeTruthy();
    expect(screen.getByText('正文')).toBeTruthy();
    // 激活页签内：标签与取值都在
    expect(screen.getByText('字段title_s')).toBeTruthy();
    expect(screen.getByText('标题值')).toBeTruthy();
    expect(screen.getByText('字段subtitle_s')).toBeTruthy();
    // 非激活页签懒渲染
    expect(screen.queryByText('正文内容')).toBeNull();

    fireEvent.click(screen.getByText('正文').closest('.ant-tabs-tab') as HTMLElement);
    expect(screen.getByText('正文内容')).toBeTruthy();
  });

  it('行列布局按设计器列宽还原（12 栅格 → antd 24 栅格）', () => {
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('left_s')], [field('right_s')]], [8, 4])])}
        siteId="s1"
        values={{ left_s: '左', right_s: '右' }}
      />,
    );
    expect(container.querySelector('.ant-col-md-16')).toBeTruthy();
    expect(container.querySelector('.ant-col-md-8')).toBeTruthy();
    // DOM 顺序 = 模型顺序
    const labels = Array.from(container.querySelectorAll('.content-readonly-field'))
      .map((el) => el.getAttribute('data-field-code'));
    expect(labels).toEqual(['left_s', 'right_s']);
  });

  it('重复组逐项列出子字段', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'REPEAT_GROUP',
        sortOrder: 1,
        config: { title: '作者', variableName: 'authors' },
        children: [
          { elementType: 'FIELD', sortOrder: 1, field: field('author_name'), children: [] },
          { elementType: 'FIELD', sortOrder: 2, field: field('author_role'), children: [] },
        ],
      },
    ];
    render(
      <ContentReadOnlyView
        type={type(layout)}
        siteId="s1"
        values={{ authors: [{ author_name: '张三', author_role: '主编' }, { author_name: '李四', author_role: '编辑' }] }}
      />,
    );
    expect(screen.getByText('作者')).toBeTruthy();
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByText('李四')).toBeTruthy();
    expect(screen.getByText(/第 1 项/)).toBeTruthy();
    expect(screen.getByText(/第 2 项/)).toBeTruthy();
  });

  it('布局未覆盖但确有取值的字段追加到「其他字段」，审核时不漏看', () => {
    const rendered = field('title_s');
    render(
      <ContentReadOnlyView
        type={type([rowSection([[rendered]])], [rendered, field('legacy_note')])}
        siteId="s1"
        values={{ title_s: '标题值', legacy_note: '历史字段值' }}
      />,
    );
    expect(screen.getByText('其他字段')).toBeTruthy();
    expect(screen.getByText('历史字段值')).toBeTruthy();
  });

  it('不渲染任何输入控件（只读）', () => {
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('title_s'), field('flag', 'BOOLEAN'), field('state', 'ENUM')]])])}
        siteId="s1"
        values={{ title_s: '标题值', flag: 'false', state: 'DRAFT' }}
      />,
    );
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    // BOOLEAN 字符串 'false' 必须显示「否」，不能被真值判断成「是」
    expect(screen.getByText('否')).toBeTruthy();
  });
});

describe('媒体字段只读渲染（媒体引用 / 预览图）', () => {
  const ASSET = '11111111-2222-3333-4444-555555555555';

  it('IMAGE 字段只显示预览图，不显示资产编号', () => {
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('cover_s', 'IMAGE')]])])}
        siteId="s1"
        values={{ cover_s: ASSET }}
      />,
    );
    expect(screen.queryByText(ASSET)).toBeNull();
    expect(container.textContent).not.toContain(ASSET);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`/media-thumb/s1/${ASSET}`);
    // 悬停遮罩给出「点击查看大图」，点开的是原图（/media-file）
    expect(screen.getByText('点击查看大图')).toBeTruthy();
  });

  it('MEDIA_REF 视频：缩略图不带 UUID，悬停提示看视频，点击打开预览弹窗', () => {
    const value = JSON.stringify({ assetId: ASSET, kind: 'video', filename: 'demo.mp4' });
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('trailer_s', 'MEDIA_REF')]])])}
        siteId="s1"
        values={{ trailer_s: value }}
      />,
    );
    expect(container.textContent).not.toContain(ASSET);
    const thumb = screen.getByRole('button', { name: '点击查看视频' });
    expect(thumb.querySelector('img')?.getAttribute('src')).toBe(`/media-thumb/s1/${ASSET}`);

    fireEvent.click(thumb);
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(`/media-preview/s1/${ASSET}`);
  });

  it('MEDIA_REF 裸资产编号同样只给预览图，不把编号当文本输出', () => {
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('media_s', 'MEDIA_REF')]])])}
        siteId="s1"
        values={{ media_s: ASSET }}
      />,
    );
    expect(container.textContent).not.toContain(ASSET);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`/media-thumb/s1/${ASSET}`);
    // 无 kind 元数据时给通用提示，仍可点开（预览页自己按种类渲染）
    expect(screen.getByRole('button', { name: '点击查看大图 / 视频预览' })).toBeTruthy();
  });

  it('外部图片 URL 直接作为预览图与放大原图', () => {
    const { container } = render(
      <ContentReadOnlyView
        type={type([rowSection([[field('poster_s', 'IMAGE')]])])}
        siteId="s1"
        values={{ poster_s: 'https://cdn.example.com/a/b.png' }}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/a/b.png');
  });
});

describe('只读取值格式化', () => {
  it('富文本转纯文本保留段落换行、不注入 HTML', () => {
    expect(htmlToPlainText('<p>第一段</p><p>第二段<br/>换行</p><script>alert(1)</script>'))
      .toBe('第一段\n第二段\n换行');
  });

  it('枚举按选项标签展示、多值用顿号连接', () => {
    const enumField: FieldDef = {
      ...field('state', 'ENUM'),
      fieldConfig: { options: [{ label: '草稿', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' }] },
    };
    expect(readOnlyValueText(enumField, 'PUBLISHED')).toBe('已发布');
    expect(readOnlyValueText(field('tags', 'TAG'), ['a', 'b'])).toBe('a、b');
    expect(readOnlyValueText(field('title_s'), '')).toBe('');
  });
});
