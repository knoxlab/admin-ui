import { describe, expect, it } from 'vitest';
import type { ContentType, FieldDef, LayoutElement } from '../../api/types';
import {
  buildModelFormNodes,
  modelFormItems,
  nodeEmpty,
  repeatSpecsOf,
} from '../modelFormLayout';

/**
 * 模型驱动表单渲染树（需求 2026-09-21）。
 *
 * <p>锁定模型设计器序列化约定的还原语义：
 * ① `TAB` 结构控件还原为页签组，页签下的行/字段归属其页签页面（不得拍平成折叠面板）；
 * ② 行内字段按 `(列号+1)*1000+序号` 的 sortOrder 解码列位，`config.columnSpans` 还原 12 栅格列宽；
 * ③ 重复组以 `variableName` 合成一个槽位（子字段嵌在数组值里）；
 * ④ 无法解码列位时（API 直建模型 sortOrder 10/20/…）退回历史排布；
 * ⑤ 无布局模型按 groupName 分组兜底。</p>
 */

const field = (code: string, fieldType = 'TEXT', sortOrder = 0): FieldDef => ({
  code,
  name: code,
  fieldType,
  required: false,
  sortOrder,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
});

const type = (partial: Partial<ContentType>): ContentType =>
  ({ id: 't1', siteId: 's1', code: 'c', name: 'c', version: 1, status: 'PUBLISHED', ...partial }) as ContentType;

/** 设计器序列化约定的一行：子字段 sortOrder 按 (列号+1)*1000+序号 编码。 */
const rowSection = (columns: string[][], spans: number[] = []): LayoutElement => ({
  elementType: 'FORM_SECTION',
  sortOrder: 1,
  config: {
    title: 'Row',
    variableName: 'row',
    columns: columns.length,
    ...(spans.length ? { columnSpans: spans } : {}),
  },
  children: columns.flatMap((codes, col) =>
    codes.map((code, i) => ({
      elementType: 'FIELD' as const,
      sortOrder: (col + 1) * 1000 + i + 1,
      field: field(code),
      children: [],
    })),
  ),
});

describe('buildModelFormNodes · 页签组（TAB 结构控件）', () => {
  const layout: LayoutElement[] = [
    {
      elementType: 'TAB',
      sortOrder: 1,
      config: { title: 'Tabs 1' },
      children: [
        {
          elementType: 'FORM_SECTION',
          sortOrder: 1,
          config: { title: '基本', tabId: 'tab-a' },
          children: [rowSection([['a1']])],
        },
        {
          elementType: 'FORM_SECTION',
          sortOrder: 2,
          config: { title: '扩展', tabId: 'tab-b' },
          children: [rowSection([['b1']])],
        },
      ],
    },
  ];

  it('TAB 还原为 tabs 节点，字段归属其页签页面（回归：不再拍平为折叠面板）', () => {
    const nodes = buildModelFormNodes(type({ layout }));
    expect(nodes).toHaveLength(1);
    const tabs = nodes[0];
    expect(tabs.kind).toBe('tabs');
    if (tabs.kind !== 'tabs') return;
    expect(tabs.tabs.map((tb) => tb.title)).toEqual(['基本', '扩展']);
    expect(tabs.tabs[0].key).toBe('tab-a');
    const items = modelFormItems(nodes);
    expect(items.map((it) => (it.kind === 'field' ? it.field.code : it.kind === 'repeat' ? it.code : ''))).toEqual(['a1', 'b1']);
  });

  it('页签内字段在 modelFormItems 中仍按页签顺序展开（渲染归属页签页面）', () => {
    const nodes = buildModelFormNodes(type({ layout }));
    const tabs = nodes[0];
    if (tabs.kind !== 'tabs') return;
    expect(modelFormItems([tabs]).length).toBe(2);
    expect(nodeEmpty(tabs)).toBe(false);
  });
});

describe('buildModelFormNodes · 行列与列宽（设计器 12 栅格）', () => {
  it('按 (列号+1)*1000+序号 解码列位，columnSpans 还原列宽', () => {
    const layout = [
      rowSection(
        [['a1', 'a2'], ['b1'], ['c1']],
        [6, 4, 2],
      ),
    ];
    const nodes = buildModelFormNodes(type({ layout }));
    expect(nodes[0].kind).toBe('section');
    if (nodes[0].kind !== 'section') return;
    const [row] = nodes[0].rows;
    expect(row.columns).toHaveLength(3);
    expect(row.columns.map((c) => c.span)).toEqual([6, 4, 2]);
    const col0 = row.columns[0].items.map((it) => (it.kind === 'field' ? it.field.code : ''));
    expect(col0).toEqual(['a1', 'a2']);
    expect(row.columns[1].items.map((it) => (it.kind === 'field' ? it.field.code : ''))).toEqual(['b1']);
  });

  it('sortOrder 非设计器编码（10/20/…）时退回历史排布（每字段一列）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row' },
        children: [
          { elementType: 'FIELD', sortOrder: 10, field: field('a1'), children: [] },
          { elementType: 'FIELD', sortOrder: 20, field: field('a2'), children: [] },
        ],
      },
    ];
    const nodes = buildModelFormNodes(type({ layout }));
    if (nodes[0].kind !== 'section') return;
    const [row] = nodes[0].rows;
    // 每字段一列（历史 md=12 双列流式的等价渲染），不再错位归列
    expect(row.columns.map((c) => c.span)).toEqual([6, 6]);
  });
});

describe('buildModelFormNodes · 重复组与兜底', () => {
  it('REPEAT_GROUP 以 variableName 合成槽位，子字段不外溢', () => {
    const layout: LayoutElement[] = [
      rowSection([['plain']]),
      {
        elementType: 'REPEAT_GROUP',
        sortOrder: 2,
        config: { title: '班级', variableName: 'class_rg', minItems: 1, maxItems: 5 },
        children: [{ elementType: 'FIELD', sortOrder: 1, field: field('program_class'), children: [] }],
      },
    ];
    const nodes = buildModelFormNodes(type({ layout }));
    const specs = repeatSpecsOf(nodes);
    expect(specs.get('class_rg')?.children.map((c) => c.code)).toEqual(['program_class']);
    expect(specs.get('class_rg')?.minItems).toBe(1);
    const items = modelFormItems(nodes);
    expect(items.filter((it) => it.kind === 'repeat')).toHaveLength(1);
  });

  it('无布局模型按 groupName 分组兜底', () => {
    const nodes = buildModelFormNodes(
      type({ fields: [field('a'), { ...field('b'), groupName: '附加' }] }),
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0].kind === 'section' && nodes[0].title).toBe('基本信息');
    expect(nodes[1].kind === 'section' && nodes[1].title).toBe('附加');
  });

  it('空布局元素（仅结构控件）标记为空节点', () => {
    const nodes = buildModelFormNodes(
      type({
        layout: [
          {
            elementType: 'FORM_SECTION',
            sortOrder: 1,
            config: { title: '空', variableName: 'empty' },
            children: [],
          },
        ],
      }),
    );
    expect(nodes).toHaveLength(1);
    expect(nodeEmpty(nodes[0])).toBe(true);
  });
});

describe('buildModelFormNodes · 列内嵌套结构项（2026-09-22）', () => {
  /** 行内嵌 TAB（设计器单元格内嵌页签组）：列位编码与字段同命名空间（字段在前）。 */
  const rowWithNestedTab = (): LayoutElement => ({
    elementType: 'FORM_SECTION',
    sortOrder: 1,
    config: {
      title: 'Row',
      variableName: 'row',
      columns: 2,
      columnSpans: [9, 3],
    },
    children: [
      { elementType: 'FIELD', sortOrder: 1000, field: field('a1'), children: [] },
      {
        elementType: 'TAB',
        sortOrder: 2000,
        config: { title: 'Tabs 1', variableName: 'tabs_1' },
        children: [
          {
            elementType: 'FORM_SECTION',
            sortOrder: 1,
            config: { title: '基本', tabId: 'tab-a' },
            children: [rowSection([['b1']])],
          },
          {
            elementType: 'FORM_SECTION',
            sortOrder: 101,
            config: { title: '扩展', tabId: 'tab-b' },
            children: [rowSection([['c1']])],
          },
        ],
      },
    ],
  });

  it('行内嵌 TAB 归入其列位，成为列内 tabs 输入项（需求：页签加在对应列格中）', () => {
    const nodes = buildModelFormNodes(type({ layout: [rowWithNestedTab()] }));
    if (nodes[0].kind !== 'section') return;
    const [row] = nodes[0].rows;
    expect(row.columns).toHaveLength(2);
    expect(row.columns.map((c) => c.span)).toEqual([9, 3]);
    expect(row.columns[0].items.map((it) => (it.kind === 'field' ? it.field.code : ''))).toEqual(['a1']);
    const [it] = row.columns[1].items;
    expect(it.kind).toBe('tabs');
    if (it.kind !== 'tabs') return;
    expect(it.tabs.map((tb) => tb.title)).toEqual(['基本', '扩展']);
  });

  it('modelFormItems 穿透列内页签组展开字段（保存/默认值口径）', () => {
    const nodes = buildModelFormNodes(type({ layout: [rowWithNestedTab()] }));
    const codes = modelFormItems(nodes).map((it) =>
      it.kind === 'field' ? it.field.code : it.kind === 'repeat' ? it.code : '',
    );
    expect(codes).toEqual(['a1', 'b1', 'c1']);
  });

  it('LINE_DIVIDER 归入列位成为分隔线项（纯视觉，不计入输入项）', () => {
    const layout: LayoutElement[] = [
      {
        elementType: 'FORM_SECTION',
        sortOrder: 1,
        config: { title: 'Row', variableName: 'row', columns: 2, columnSpans: [6, 6] },
        children: [
          { elementType: 'LINE_DIVIDER', sortOrder: 1000, config: { variableName: 'divider_1' }, children: [] },
          { elementType: 'FIELD', sortOrder: 2000, field: field('a1'), children: [] },
        ],
      },
    ];
    const nodes = buildModelFormNodes(type({ layout }));
    if (nodes[0].kind !== 'section') return;
    const [row] = nodes[0].rows;
    expect(row.columns[0].items[0].kind).toBe('divider');
    expect(modelFormItems(nodes).map((it) => (it.kind === 'field' ? it.field.code : ''))).toEqual(['a1']);
  });
});

describe('buildModelFormNodes · 页签组之外的根级字段（2026-10-23）', () => {
  /** 设计画布：页签块（两个页签）+ 页签块下方的根级散字段（如系统 title_s）。 */
  const rootFieldLayout = (): LayoutElement[] => [
    {
      elementType: 'TAB',
      sortOrder: 1,
      config: { title: '内容分组' },
      children: [
        {
          elementType: 'FORM_SECTION',
          sortOrder: 1,
          config: { title: '关联媒体', tabId: 'tab-media' },
          children: [rowSection([['media_uri']])],
        },
        {
          elementType: 'FORM_SECTION',
          sortOrder: 2,
          config: { title: '元数据', tabId: 'tab-meta' },
          children: [rowSection([['asset_code']])],
        },
      ],
    },
    { elementType: 'FIELD', sortOrder: 2, field: field('title_s'), children: [] },
  ];

  it('根级字段并入页签组末页「基本信息」（新建内容的第三个页签），不再被静默丢弃', () => {
    const nodes = buildModelFormNodes(type({ layout: rootFieldLayout() }));
    expect(nodes).toHaveLength(1);
    const tabs = nodes[0];
    expect(tabs.kind).toBe('tabs');
    if (tabs.kind !== 'tabs') return;
    expect(tabs.tabs.map((tb) => tb.title)).toEqual(['关联媒体', '元数据', '基本信息']);
    const codes = modelFormItems([tabs]).map((it) =>
      it.kind === 'field' ? it.field.code : it.kind === 'repeat' ? it.code : '',
    );
    expect(codes).toEqual(['media_uri', 'asset_code', 'title_s']);
  });

  it('只有根级字段（无页签组/分区）时退化为「基本信息」分区节点（字段可编辑可保存）', () => {
    const nodes = buildModelFormNodes(
      type({ layout: [{ elementType: 'FIELD', sortOrder: 1, field: field('title_s'), children: [] }] }),
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('section');
    if (nodes[0].kind !== 'section') return;
    expect(nodes[0].title).toBe('基本信息');
    expect(modelFormItems(nodes).map((it) => (it.kind === 'field' ? it.field.code : ''))).toEqual(['title_s']);
    expect(nodeEmpty(nodes[0])).toBe(false);
  });
});
