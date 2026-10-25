// 回归护栏：模型驱动表单渲染器（需求 2026-09-21）。
// 页签结构控件下的字段必须渲染在其页签页面内（不得拍平为折叠面板），
// 行列布局按设计器 12 栅格列宽还原；普通字段承接 Form.Item 受控注入。
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import ModelFormRenderer from '../ModelFormRenderer';
import type { ContentType, FieldDef, LayoutElement } from '../../api/types';

vi.mock('../../i18n/locale', () => ({ t: (key: string) => key }));

afterEach(() => cleanup());

const field = (code: string, fieldType = 'TEXT'): FieldDef => ({
  code,
  name: `字段${code}`,
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

const type = (layout: LayoutElement[]): ContentType =>
  ({
    id: 'ct-1',
    siteId: 's1',
    code: 'article',
    name: '文章',
    templateType: 'PAGE',
    version: 1,
    status: 'DRAFT',
    layout,
  }) as ContentType;

/** 设计器序列化约定的一行：子字段 sortOrder 按 (列号+1)*1000+序号 编码。 */
const rowSection = (columns: string[][], spans: number[] = []): LayoutElement => ({
  elementType: 'FORM_SECTION',
  sortOrder: 1,
  config: { title: 'Row', variableName: 'row', columns: columns.length, ...(spans.length ? { columnSpans: spans } : {}) },
  children: columns.flatMap((codes, col) =>
    codes.map((code, i) => ({
      elementType: 'FIELD' as const,
      sortOrder: (col + 1) * 1000 + i + 1,
      field: field(code),
      children: [],
    })),
  ),
});

describe('ModelFormRenderer（模型驱动表单渲染器）', () => {
  it('页签结构控件：字段渲染在其页签页面内（回归：不再拍平为折叠面板）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'TAB',
        sortOrder: 1,
        config: { title: 'Tabs 1' },
        children: [
          { elementType: 'FORM_SECTION', sortOrder: 1, config: { title: '基本', tabId: 'tab-a' }, children: [rowSection([['a1']])] },
          { elementType: 'FORM_SECTION', sortOrder: 2, config: { title: '扩展', tabId: 'tab-b' }, children: [rowSection([['b1']])] },
        ],
      },
    ];
    render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" />
      </Form>,
    );
    // 页签头出现
    expect(screen.getByText('基本')).toBeTruthy();
    expect(screen.getByText('扩展')).toBeTruthy();
    // 默认页签的字段可见；非激活页签的字段不在 DOM（antd 懒渲染）—— 由工具层测试锁定归属
    expect(screen.getByText('字段a1')).toBeTruthy();
    expect(screen.queryByText('字段b1')).toBeNull();
  });

  it('根级分区：字段按设计器列宽渲染在行网格内', () => {
    const layout: LayoutElement[] = [rowSection([['x1'], ['x2']], [8, 4])];
    const { container } = render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" />
      </Form>,
    );
    expect(screen.getByText('字段x1')).toBeTruthy();
    expect(screen.getByText('字段x2')).toBeTruthy();
    // antd md=16/md=8 栅格类名存在（12 栅格列宽 × 2 映射到 24 栅格）
    expect(container.querySelector('.ant-col-md-16')).toBeTruthy();
    expect(container.querySelector('.ant-col-md-8')).toBeTruthy();
  });

  it('模型无字段时渲染占位文案（不抛错）', () => {
    render(
      <Form>
        <ModelFormRenderer
          type={{
            id: 'ct-2',
            siteId: 's1',
            code: 'empty',
            name: '空',
            templateType: 'PAGE',
            version: 1,
            status: 'DRAFT',
            layout: [{ elementType: 'FORM_SECTION', sortOrder: 1, config: { title: '空', variableName: 'e' }, children: [] }],
          } as unknown as ContentType}
          siteId="s1"
        />
      </Form>,
    );
    expect(screen.getByText('该模型暂无字段定义，仅保存标题。')).toBeTruthy();
  });

  it('列内嵌套页签组（单元格内嵌 TAB）：页签头出现，激活页签字段渲染在其页签页面（2026-09-22）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row', columns: 2, columnSpans: [9, 3] },
        children: [
          { elementType: 'FIELD', sortOrder: 1000, field: field('a1'), children: [] },
          {
            elementType: 'TAB',
            sortOrder: 2000,
            config: { title: 'Tabs 1', variableName: 'tabs_1' },
            children: [
              { elementType: 'FORM_SECTION', sortOrder: 1, config: { title: '基本', tabId: 'tab-a' }, children: [rowSection([['b1']])] },
              { elementType: 'FORM_SECTION', sortOrder: 101, config: { title: '扩展', tabId: 'tab-b' }, children: [rowSection([['c1']])] },
            ],
          },
        ],
      },
    ];
    render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" />
      </Form>,
    );
    // 行左列字段 + 列内页签组（页签头出现，激活页签字段可见）
    expect(screen.getByText('字段a1')).toBeTruthy();
    expect(screen.getByText('基本')).toBeTruthy();
    expect(screen.getByText('扩展')).toBeTruthy();
    expect(screen.getByText('字段b1')).toBeTruthy();
  });

  it('页签组之外的根级字段渲染为末页「基本信息」（第三个页签，字段不再丢失）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'TAB',
        sortOrder: 1,
        config: { title: '内容分组' },
        children: [
          { elementType: 'FORM_SECTION', sortOrder: 1, config: { title: '关联媒体', tabId: 'tab-media' }, children: [rowSection([['media_uri']])] },
          { elementType: 'FORM_SECTION', sortOrder: 2, config: { title: '元数据', tabId: 'tab-meta' }, children: [rowSection([['asset_code']])] },
        ],
      },
      { elementType: 'FIELD', sortOrder: 2, field: field('title_s'), children: [] },
    ];
    render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" />
      </Form>,
    );
    expect(screen.getByText('关联媒体')).toBeTruthy();
    expect(screen.getByText('元数据')).toBeTruthy();
    expect(screen.getByText('基本信息')).toBeTruthy();
    // 第三个页签可点开，标题字段在其中渲染
    const basicTab = screen.getByText('基本信息').closest('.ant-tabs-tab') as HTMLElement;
    fireEvent.click(basicTab);
    expect(screen.getByText('字段title_s')).toBeTruthy();
  });

  it('重复组占满其列宽（12 栅格 → antd md=24，回归：不再被压成半宽）', () => {    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row' },
        children: [
          {
            elementType: 'REPEAT_GROUP',
            sortOrder: 10,
            config: { title: '关联媒体', variableName: 'media_items' },
            children: [{ elementType: 'FIELD', sortOrder: 1, field: field('media_uri', 'MEDIA_REF'), children: [] }],
          },
        ],
      },
    ];
    const { container } = render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" />
      </Form>,
    );
    const group = container.querySelector('.content-repeat-group');
    expect(group).toBeTruthy();
    const col = group?.closest('.ant-col');
    expect(col?.className).toContain('ant-col-md-24');
  });

  it('控制器隐藏字段：顶层字段与重复组子字段都不渲染（FR-CM-FORMCTRL-003）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row' },
        children: [
          { elementType: 'FIELD', sortOrder: 1, field: field('keep_s'), children: [] },
          { elementType: 'FIELD', sortOrder: 2, field: field('gone_s'), children: [] },
          {
            elementType: 'REPEAT_GROUP',
            sortOrder: 10,
            config: { title: '关联媒体', variableName: 'media_items' },
            children: [
              { elementType: 'FIELD', sortOrder: 1, field: field('media_uri', 'MEDIA_REF'), children: [] },
              { elementType: 'FIELD', sortOrder: 2, field: field('media_title_s'), children: [] },
            ],
          },
        ],
      },
    ];
    render(
      <Form>
        <ModelFormRenderer
          type={type(layout)}
          siteId="s1"
          hiddenFields={new Set(['gone_s', 'media_title_s'])}
        />
      </Form>,
    );
    expect(screen.getByText('字段keep_s')).toBeTruthy();
    expect(screen.queryByText('字段gone_s')).toBeNull();
    // 重复组仍在（还有可见子字段），但被隐藏的子字段不渲染
    expect(screen.getByText('关联媒体')).toBeTruthy();
    expect(screen.queryByText('字段media_title_s')).toBeNull();
  });

  it('重复组子字段全部被隐藏时整组不渲染', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row' },
        children: [
          {
            elementType: 'REPEAT_GROUP',
            sortOrder: 10,
            config: { title: '关联媒体', variableName: 'media_items' },
            children: [{ elementType: 'FIELD', sortOrder: 1, field: field('media_uri', 'MEDIA_REF'), children: [] }],
          },
        ],
      },
    ];
    const { container } = render(
      <Form>
        <ModelFormRenderer type={type(layout)} siteId="s1" hiddenFields={new Set(['media_uri'])} />
      </Form>,
    );
    expect(container.querySelector('.content-repeat-group')).toBeNull();
  });
});
