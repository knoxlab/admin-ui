import { t } from '../i18n/locale';
import type { ContentType, FieldDef, LayoutElement } from '../api/types';
import { collectFields, STRUCTURAL } from './contentFields';
import { findComposeConfig, type ComposeConfig } from './classCompose';

/**
 * 模型驱动的表单渲染树（需求 2026-09-21）。
 *
 * <p>模型设计器把画布序列化为：根级 `FORM_SECTION`（行）/ `TAB`（页签组）→ 每个页签一个
 * `FORM_SECTION`（`config.tabId`/`title`）→ 其下每行一个 `FORM_SECTION`；行内字段以
 * `(列号+1)*1000+序号` 编码 `sortOrder`、列宽存于 `config.columnSpans`（12 栅格）。</p>
 *
 * <p>本模块把该布局还原成**渲染树**（分区 / 页签组 / 行+列宽 / 字段项），供内容编辑对话框与
 * 页面管理新建/编辑对话框共用 —— 保证「页签下的字段出现在其页签页面」「表单布局完全参照
 * 模型设计器」（需求 2026-09-21）。历史行为（页签被拍平成折叠面板、列宽一律 md=12）由
 * `utils/__tests__/modelFormLayout.test.ts` 锁定不再回归。</p>
 */

/** 表单输入项：普通字段 / 重复组（重复组以 `variableName` 为槽位，子字段嵌在数组值里）。
 * 另有列内嵌套结构项（2026-09-22）：页签组（设计器单元格内嵌 TAB）与分隔线（LINE_DIVIDER）。 */
export type ModelFormItem =
  | { kind: 'field'; field: FieldDef }
  | {
      kind: 'repeat';
      code: string;
      title: string;
      minItems: number;
      maxItems: number;
      children: FieldDef[];
      compose?: ComposeConfig;
    }
  | { kind: 'tabs'; key: string; tabs: ModelFormTab[] }
  | { kind: 'divider'; key: string };

/** 一列：设计器 12 栅格宽 + 该列内的输入项（自上而下堆叠）。 */
export type ModelFormColumn = { key: string; span: number; items: ModelFormItem[] };

/** 一行：对应设计器画布的一行（FORM_SECTION），可有多列。 */
export type ModelFormRow = { key: string; title?: string; columns: ModelFormColumn[] };

/** 一个页签：对应设计器页签组里的一个页签（FORM_SECTION，config.tabId）。 */
export type ModelFormTab = { key: string; title: string; rows: ModelFormRow[] };

/**
 * 渲染树节点：
 * - `section`：根级分区（设计器根级行）。单行时渲染为网格本身；多行时逐行渲染卡片。
 * - `tabs`：页签组（设计器 TAB 结构控件）。
 */
export type ModelFormNode =
  | { kind: 'section'; key: string; title: string; rows: ModelFormRow[] }
  | { kind: 'tabs'; key: string; tabs: ModelFormTab[] };

/** 设计器行内字段列位解码：`(列号+1)*1000+序号` → 列号。 */
function decodeColumnIndex(sortOrder: number): number {
  return Math.floor(sortOrder / 1000) - 1;
}

/** 布局元素 → 输入项（结构型字段跳过；重复组合成一个槽位；页签组/分隔线为列内嵌套结构项）。 */
function toItem(el: LayoutElement, key: string): ModelFormItem | null {
  if (el.elementType === 'REPEAT_GROUP') {
    const code = String(el.config?.variableName || el.field?.code || '');
    if (!code) return null;
    return {
      kind: 'repeat',
      code,
      title: String(el.config?.title || code),
      minItems: Number(el.config?.minItems ?? 0),
      maxItems: Number(el.config?.maxItems ?? -1),
      children: (el.children || [])
        .filter((c) => c.elementType === 'FIELD' && c.field)
        .map((c) => c.field!)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      compose: findComposeConfig(el.config as Record<string, unknown> | undefined),
    };
  }
  if (el.elementType === 'TAB') {
    const tabs = decodeTabGroup(el, key);
    return tabs.length ? { kind: 'tabs', key, tabs } : null;
  }
  if (el.elementType === 'LINE_DIVIDER') return { kind: 'divider', key };
  if (el.elementType === 'FIELD' && el.field && !STRUCTURAL.has(el.field.fieldType)) {
    return { kind: 'field', field: el.field };
  }
  return null;
}

/** TAB 元素 → 页签列表（每个子 FORM_SECTION 为一个页签页，其下 FORM_SECTION 为行）。 */
function decodeTabGroup(el: LayoutElement, key: string): ModelFormTab[] {
  const tabs: ModelFormTab[] = [];
  (el.children || []).forEach((tabEl, i) => {
    const title = String(tabEl.config?.title || `Tab ${i + 1}`);
    const tabKey = String(tabEl.config?.tabId || tabEl.elementId || `${key}-tab${i}`);
    const rows: ModelFormRow[] = [];
    for (const child of tabEl.children || []) {
      if (child.elementType === 'FORM_SECTION') {
        rows.push(decodeRow(child, `${tabKey}#${rows.length}`));
      } else {
        const item = toItem(child, `${tabKey}-raw${rows.length}`);
        if (item) {
          const rowKey = `${tabKey}#raw${rows.length}`;
          rows.push({
            key: rowKey,
            columns: [{ key: `${rowKey}-c0`, span: 12, items: [item] }],
          });
        }
      }
    }
    if (rows.length) tabs.push({ key: tabKey, title, rows });
  });
  return tabs;
}

/**
 * 无设计器列位信息时的兜底排布：普通字段一列一个（span 6 → antd md 12，与历史双列流式一致）；
 * 重复组 / 关联字段独占整行（span 12 → md 24，与历史全宽渲染一致）。
 */
function legacyColumns(items: ModelFormItem[], keyPrefix: string): ModelFormColumn[] {
  const columns = items.map((it, i) => ({
    key: `${keyPrefix}-c${i}`,
    span:
      it.kind === 'repeat' ||
      (it.kind === 'field' && it.field.fieldType === 'RELATIONSHIP') ||
      it.kind === 'tabs' ||
      it.kind === 'divider'
        ? 12
        : 6,
    items: [it],
  }));
  if (!columns.length) columns.push({ key: `${keyPrefix}-empty`, span: 12, items: [] });
  return columns;
}

/**
 * 把一个 FORM_SECTION（行）解码为带列宽的列。
 *
 * <p>设计器序列化的行：`config.columns` = 列数、`config.columnSpans` = 12 栅格列宽、
 * 子字段 sortOrder 按 `(列号+1)*1000+序号` 编码 —— 全部子项解码列位都落在 `[0, 列数)` 内时
 * 按设计器列宽还原；否则（API 直建模型 sortOrder 10/20/…、后补系统字段等）退回历史排布。</p>
 */
function decodeColumns(el: LayoutElement, keyPrefix: string): ModelFormColumn[] {
  const children = (el.children || []).filter(
    (c) =>
      (c.elementType === 'FIELD' && c.field && !STRUCTURAL.has(c.field.fieldType)) ||
      c.elementType === 'REPEAT_GROUP' ||
      // 列内嵌套结构项（2026-09-22）：单元格内嵌页签组 / 分隔线。
      c.elementType === 'TAB' ||
      c.elementType === 'LINE_DIVIDER',
  );
  const cfg = (el.config || {}) as Record<string, unknown>;
  const columnCount = Math.floor(Number(cfg.columns) || 0);
  const spans = Array.isArray(cfg.columnSpans)
    ? (cfg.columnSpans as unknown[]).map((s) => Number(s) || 1)
    : [];
  const pairs = children
    .map((c, i) => ({
      // 元素 sortOrder 承载设计器编码（FIELD 元素的后端落库口径即 n.sortOrder()，
      // 与 field.sortOrder 同值；取元素值在前可兼容两者不一致的存量数据）。
      col: decodeColumnIndex(
        Number(c.sortOrder) || Number(c.field?.sortOrder) || 0,
      ),
      item: toItem(c, `${keyPrefix}-i${i}`),
    }))
    .filter((p): p is { col: number; item: ModelFormItem } => p.item !== null);
  const decodable =
    columnCount >= 1 &&
    pairs.length > 0 &&
    pairs.every((p) => Number.isInteger(p.col) && p.col >= 0 && p.col < columnCount);
  if (!decodable) return legacyColumns(pairs.map((p) => p.item), keyPrefix);
  const columns: ModelFormColumn[] = Array.from({ length: columnCount }, (_, i) => ({
    key: `${keyPrefix}-c${i}`,
    span: spans[i] ?? Math.max(1, Math.round(12 / columnCount)),
    items: [],
  }));
  for (const p of pairs) columns[p.col].items.push(p.item);
  return columns;
}

/** 把一个 FORM_SECTION 解码为行；`titleOverride` 传空串表示标题由外层（分区头/页签）承担。 */
function decodeRow(el: LayoutElement, key: string, titleOverride?: string): ModelFormRow {
  const title =
    titleOverride !== undefined
      ? titleOverride || undefined
      : String(el.config?.title || '') || undefined;
  return { key, title, columns: decodeColumns(el, key) };
}

/** 无布局模型（仅 fields）：按 groupName 分组，沿用历史双列流式排布。 */
function legacyNodes(type: ContentType): ModelFormNode[] {
  const fields = collectFields(type);
  const order: string[] = [];
  const map = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const name = f.groupName || t('基本信息');
    if (!map.has(name)) {
      map.set(name, []);
      order.push(name);
    }
    map.get(name)!.push(f);
  }
  return order.map((name, i) => ({
    kind: 'section' as const,
    key: name || `group-${i}`,
    title: name,
    rows: [
      {
        key: `grp-${i}`,
        columns: legacyColumns(
          map.get(name)!.map((f) => ({ kind: 'field' as const, field: f })),
          `grp-${i}`,
        ),
      },
    ],
  }));
}

/** 把内容模型的布局还原为表单渲染树（无布局时按 groupName 分组兜底）。 */
export function buildModelFormNodes(type?: ContentType | null): ModelFormNode[] {
  if (!type) return [];
  const layout = type.layout;
  if (!layout?.length) return legacyNodes(type);

  const nodes: ModelFormNode[] = [];
  /** 页签组之外的根级输入项（设计画布上「页签块下方」的散字段，如 title_s）。 */
  const rootItems: ModelFormItem[] = [];
  for (const el of layout) {
    if (el.elementType === 'FORM_SECTION') {
      const title = String(el.config?.title || el.config?.variableName || t('分区'));
      const key = String(el.config?.variableName || el.elementId || title);
      const nested = (el.children || []).filter((c) => c.elementType === 'FORM_SECTION');
      const rows = nested.length
        ? nested.map((r, ri) => decodeRow(r, `${key}#${ri}`))
        : [decodeRow(el, key, '')];
      nodes.push({ kind: 'section', key, title, rows });
    } else if (el.elementType === 'TAB' && el.children?.length) {
      const key = String(el.elementId || `tabs-${nodes.length}`);
      const tabs = decodeTabGroup(el, key);
      if (tabs.length) {
        nodes.push({ kind: 'tabs', key, tabs });
      }
    } else if (el.elementType === 'REPEAT_GROUP') {
      // 防御：重复组直接挂在布局根部（设计器兜底保存的形态）—— 合成为单行分区
      const item = toItem(el, `root-${String(el.config?.variableName || 'repeat')}`);
      if (item && item.kind === 'repeat') {
        nodes.push({
          kind: 'section',
          key: item.code,
          title: item.title,
          rows: [{ key: `root-${item.code}`, columns: [{ key: `root-${item.code}-c0`, span: 12, items: [item] }] }],
        });
      }
    } else {
      const item = toItem(el, `root-item-${nodes.length}-${rootItems.length}`);
      if (item) rootItems.push(item);
    }
  }

  // 根级散字段（页签块之外，如 title_s）不再被静默丢弃（需求 2026-10-23）：
  // 存在页签组时作为**最后一个页签页**「基本信息」渲染（新建内容的第三个页签），
  // 只有根级散字段时退化为单个分区节点 —— 两种形态都保证字段可编辑、可校验、可保存。
  if (rootItems.length) {
    const rootRow: ModelFormRow = { key: 'root-basic', columns: legacyColumns(rootItems, 'root-basic') };
    const tabsNode = nodes.find((n): n is Extract<ModelFormNode, { kind: 'tabs' }> => n.kind === 'tabs');
    if (tabsNode) {
      tabsNode.tabs.push({ key: 'root-basic', title: t('基本信息'), rows: [rootRow] });
    } else {
      nodes.push({ kind: 'section', key: 'root-basic', title: t('基本信息'), rows: [rootRow] });
    }
  }
  return nodes;
}

/** 递归展开输入项（穿透列内嵌套页签组）；分隔线为纯视觉项不计。 */
function flattenItems(items: ModelFormItem[], out: ModelFormItem[] = []): ModelFormItem[] {
  for (const it of items) {
    if (it.kind === 'tabs') {
      for (const tb of it.tabs) {
        for (const r of tb.rows) for (const c of r.columns) flattenItems(c.items, out);
      }
    } else if (it.kind === 'divider') {
      continue;
    } else {
      out.push(it);
    }
  }
  return out;
}

/** 节点是否不含任何输入项（渲染时跳过，避免空分区/空页签组；含列内嵌套项）。 */
export function nodeEmpty(node: ModelFormNode): boolean {
  const rows = node.kind === 'section' ? node.rows : node.tabs.flatMap((tb) => tb.rows);
  return !rows.some((r) => r.columns.some((c) => flattenItems(c.items).length > 0));
}

/** 渲染树的全部输入项（按布局顺序摊平，穿透列内嵌套页签组），供默认值 / 校验 / 保存口径使用。 */
export function modelFormItems(nodes: ModelFormNode[]): ModelFormItem[] {
  const out: ModelFormItem[] = [];
  const walkRows = (rows: ModelFormRow[]) => {
    for (const r of rows) for (const c of r.columns) flattenItems(c.items, out);
  };
  for (const n of nodes) {
    if (n.kind === 'section') walkRows(n.rows);
    else for (const tb of n.tabs) walkRows(tb.rows);
  }
  return out;
}

/** 重复组槽位规格（子字段 + 数量上下限），供保存取值与编辑回填使用。 */
export type RepeatSpec = { children: FieldDef[]; minItems: number; maxItems: number };

/** 重复组槽位 → 规格映射（保存时把数组值内的子字段做取值归一）。 */
export function repeatSpecsOf(nodes: ModelFormNode[]): Map<string, RepeatSpec> {
  const map = new Map<string, RepeatSpec>();
  for (const it of modelFormItems(nodes)) {
    if (it.kind === 'repeat') {
      map.set(it.code, { children: it.children, minItems: it.minItems, maxItems: it.maxItems });
    }
  }
  return map;
}
