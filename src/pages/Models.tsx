import { useCallback, useEffect, useMemo, useState, cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  AlignLeftOutlined,
  AppstoreOutlined,
  BarsOutlined,
  BgColorsOutlined,
  BlockOutlined,
  BoldOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  FieldNumberOutlined,
  FontSizeOutlined,
  FormOutlined,
  HolderOutlined,
  LayoutOutlined,
  MenuOutlined,
  LinkOutlined,
  LockOutlined,
  MinusCircleOutlined,
  PartitionOutlined,
  PictureOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  RedoOutlined,
  RightOutlined,
  SaveOutlined,
  SendOutlined,
  TableOutlined,
  TagOutlined,
  ColumnWidthOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  closestCenter,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { categoriesApi, modelsApi } from '../api';
import { ComponentRefControl, ContentRefControl, KeyValueControl, TaxonomyRefControl } from '../components/RefFieldControls';
import { isContentSearchModel } from '../components/ContentRefPicker';
import type { Category, ContentType, FieldDef, LayoutElement, LifecycleHook, SystemFieldDef } from '../api/types';
import CategorySelect from '../components/CategorySelect';
import ImageField from '../components/ImageField';
import ClassificationAutoCompose from '../components/ClassificationAutoCompose';
import RichTextEditor from '../components/RichTextEditor';
import {
  ClassificationVisibilityHint,
  useClassificationRoleVisibility,
} from '../components/ClassificationRoleVisibility';
import { ClassComposeTrigger } from '../components/ClassNumberComposer';
import { enumOptionsToText, parseEnumOptions } from '../utils/enumOptions';
import { findComposeConfig } from '../utils/classCompose';
import { RequireSite, useSite } from '../context/SiteContext';
import './Models.css';
import { t } from '../i18n/locale';
import { CONTENT_MENU_CHANGED_EVENT } from '../appEvents';

type PaletteItem = {
  type: string;
  name: string;
  description: string;
  group: string;
  icon: ReactNode;
};

const OBJECT_TYPE_COLOR: Record<string, string> = {
  PAGE: 'blue',
  COMPONENT: 'purple',
  SHARED: 'cyan',
  MEDIA: 'orange',
  SECTION: 'default',
};

const MEDIA_KIND_OPTIONS = [
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'image', label: '图片' },
  { value: 'document', label: '文档' },
  { value: 'font', label: '字体' },
  { value: 'other', label: '其他' },
];

const SUFFIX: Record<string, string> = {
  STRING: '_s',
  LONG_TEXT: '_t',
  RICH_TEXT: '_html',
  IMAGE: '_s',
  INTEGER: '_i',
  DECIMAL: '_d',
  BOOLEAN: '_b',
  DATE_TIME: '_dt',
  ENUM: '_s',
  MULTI_ENUM: '_ss',
  CONTENT_REF: '_s',
  MEDIA_REF: '_s',
  TAXONOMY_REF: '_s',
  COMPONENT_REF: '_s',
  KEY_VALUE: '_ss',
  JSON: '_s',
  COLOR: '_s',
  TAG: '_ss',
  RELATIONSHIP: '_ss',
  CATEGORY: '_s',
  HIDDEN: '_s',
  SITE_FOLDER: '_s',
  CONSTANT: '_s',
  CUSTOM_CODE: '_s',
  BLOCK_EDITOR: '_s',
};

const PALETTE: PaletteItem[] = [
  { type: 'STRING', name: '短文本', description: '单行文本与正则校验', group: '基础字段', icon: <FontSizeOutlined /> },
  { type: 'LONG_TEXT', name: '长文本', description: '多行纯文本', group: '基础字段', icon: <AlignLeftOutlined /> },
  { type: 'RICH_TEXT', name: '富文本', description: 'HTML 富文本内容', group: '基础字段', icon: <BoldOutlined /> },
  { type: 'IMAGE', name: '图片', description: '上传本地图片到 PowerMedia', group: '基础字段', icon: <PictureOutlined /> },
  { type: 'INTEGER', name: '整数', description: '带范围约束的整数', group: '基础字段', icon: <FieldNumberOutlined /> },
  { type: 'DECIMAL', name: '小数', description: '精度与范围控制', group: '基础字段', icon: <FieldNumberOutlined /> },
  { type: 'BOOLEAN', name: '布尔', description: '真/假开关', group: '基础字段', icon: <CheckSquareOutlined /> },
  { type: 'DATE_TIME', name: '日期时间', description: '日期与时间选择', group: '基础字段', icon: <CalendarOutlined /> },
  { type: 'ENUM', name: '枚举', description: '预定义单选项', group: '基础字段', icon: <UnorderedListOutlined /> },
  { type: 'MULTI_ENUM', name: '多选枚举', description: '预定义多选项', group: '基础字段', icon: <CheckCircleOutlined /> },
  { type: 'CONTENT_REF', name: '内容引用', description: '引用站点内容', group: '引用字段', icon: <LinkOutlined /> },
  { type: 'MEDIA_REF', name: '媒体引用', description: '引用媒体资源', group: '引用字段', icon: <PictureOutlined /> },
  { type: 'TAXONOMY_REF', name: '分类引用', description: '引用分类节点', group: '引用字段', icon: <TagOutlined /> },
  { type: 'COMPONENT_REF', name: '组件引用', description: '嵌入或共享组件', group: '引用字段', icon: <AppstoreOutlined /> },
  { type: 'KEY_VALUE', name: '键值对', description: '自由属性列表', group: '引用字段', icon: <TableOutlined /> },
  { type: 'JSON', name: 'JSON 对象', description: '结构化 JSON 数据', group: '引用字段', icon: <CodeOutlined /> },
  { type: 'COLOR', name: '颜色', description: 'HEX/RGB/HSL 颜色', group: '引用字段', icon: <BgColorsOutlined /> },
  { type: 'TAG', name: '自由标签', description: '标签池建议与标签云', group: '补充字段', icon: <TagOutlined /> },
  { type: 'CATEGORY', name: '分类树', description: '预定义分类树选择', group: '补充字段', icon: <TagOutlined /> },
  { type: 'HIDDEN', name: '隐藏字段', description: '程序化存储', group: '补充字段', icon: <EyeOutlined /> },
  { type: 'SITE_FOLDER', name: '站点栏目定位', description: '站点/栏目节点选择', group: '补充字段', icon: <LayoutOutlined /> },
  { type: 'RELATIONSHIP', name: '关系字段', description: '双向内容关联', group: '补充字段', icon: <LinkOutlined /> },
  { type: 'CONSTANT', name: '常量字段', description: '类型级共享值', group: '补充字段', icon: <CodeOutlined /> },
  { type: 'CUSTOM_CODE', name: '自定义代码', description: '沙箱渲染与校验', group: '补充字段', icon: <CodeOutlined /> },
  { type: 'BLOCK_EDITOR', name: '块编辑器', description: '结构化块内容', group: '补充字段', icon: <AppstoreOutlined /> },
  { type: 'FORM_SECTION', name: '表单分区', description: '字段逻辑分组', group: '结构控件', icon: <LayoutOutlined /> },
  { type: 'REPEAT_GROUP', name: '重复组', description: '可重复字段集合', group: '结构控件', icon: <BarsOutlined /> },
  { type: 'TAB', name: '标签页', description: '标签页分隔', group: '结构控件', icon: <BlockOutlined /> },
  { type: 'COLUMN', name: '列', description: '布局列控制', group: '结构控件', icon: <ColumnWidthOutlined /> },
  { type: 'DIVIDER', name: '分隔线', description: '布局分隔线', group: '结构控件', icon: <MinusCircleOutlined /> },
];

const FIELD_TYPES = PALETTE.filter((x) => x.group !== '结构控件').map((x) => x.type);
/** Inspector type dropdown: data fields + REPEAT_GROUP (other layout structures stay palette-only). */
const INSPECTOR_FIELD_TYPES = [
  ...FIELD_TYPES.filter((t) => t !== 'REPEAT_GROUP'),
  'REPEAT_GROUP',
];
const CODE_PATTERN = /^[a-z][a-zA-Z0-9_]{0,99}$/;
/** 模型编码。系统预置与站点包使用点、连字符，如 system.analytics-tracker、comp-hero。 */
const MODEL_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,99}$/;
const STRUCTURAL = new Set(['FORM_SECTION', 'REPEAT_GROUP', 'TAB', 'COLUMN', 'DIVIDER']);
/** Designer-only marker: nested field belongs to a REPEAT_GROUP (not placed on canvas). */
const REPEAT_PARENT_KEY = '__repeatParent';
type CanvasCell = { id: string; fieldCodes: string[]; span: number; blocks?: CanvasBlock[] };
type CanvasRow = {
  id: string;
  columns: CanvasCell[];
  /** FORM_SECTION display title from layout (e.g. 题名 / 主题). */
  title?: string;
  /** FORM_SECTION variableName (e.g. sec_title → Title). */
  variableName?: string;
};
type CanvasTab = { id: string; title: string; rows: CanvasRow[] };
type CanvasBlock =
  | { id: string; kind: 'ROW'; row: CanvasRow }
  | { id: string; kind: 'TABS'; tabs: CanvasTab[]; collapsedTabIds: string[] }
  | { id: string; kind: 'DIVIDER' };
/** 水合中间项：行内子元素（字段码或嵌套块）+ sortOrder 解码列位/序位。 */
type CellItem =
  | { kind: 'code'; code: string; col: number; ord: number }
  | { kind: 'block'; block: CanvasBlock; col: number; ord: number };

/** GY/T 202.1 primary element labels by section variableName. */
const SECTION_ELEMENT_LABELS: Record<string, { zh: string; en: string }> = {
  sec_title: { zh: '题名', en: 'Title' },
  sec_subject: { zh: '主题', en: 'Subject' },
  sec_desc: { zh: '描述', en: 'Description' },
  sec_creator: { zh: '创建者', en: 'Creator' },
  sec_contributor: { zh: '其他责任者', en: 'Contributor' },
  sec_publisher: { zh: '出版者', en: 'Publisher' },
  sec_rights: { zh: '版权', en: 'Copyright' },
  sec_language: { zh: '语种', en: 'Language' },
  sec_date: { zh: '日期', en: 'Date' },
  sec_type: { zh: '类型', en: 'Type' },
  sec_format: { zh: '格式', en: 'Format' },
  sec_identifier: { zh: '标识符', en: 'Identifier' },
  sec_coverage: { zh: '时空覆盖范围', en: 'Coverage' },
  sec_source: { zh: '来源', en: 'Source' },
  sec_relation: { zh: '关联', en: 'Relation' },
  sec_rel: { zh: '关联', en: 'Relation' },
  sec_content_rel: { zh: '关联', en: 'Relation' },
};

/** GY/T 202.1 qualifier / secondary partition labels for REPEAT_GROUP variableName. */
const REPEAT_ELEMENT_LABELS: Record<string, { zh: string; en: string }> = {
  class_rg: { zh: '分类', en: 'Class' },
  awards_rg: { zh: '获奖', en: 'Awards' },
  columns_rg: { zh: '栏目', en: 'Column' },
  creators_rg: { zh: '创建者描述', en: 'Description of Creator' },
  contributors_rg: { zh: '其他责任者描述', en: 'Description of Contributor' },
  publishers_rg: { zh: '出版者描述', en: 'Description of Publisher' },
  producers_rg: { zh: '出品者描述', en: 'Description of Producer' },
  copyright_owners_rg: { zh: '版权所有者名称', en: 'Name of Copyright Owner' },
  auth_uses_rg: { zh: '授权使用描述', en: 'Description of Authorized Use' },
  audio_channels_rg: { zh: '声道', en: 'Audio Channel' },
  subtitles_rg: { zh: '字幕', en: 'Subtitle' },
  coverage_years_rg: { zh: '时间范围', en: 'Years Covered' },
  spatial_rg: { zh: '空间范围', en: 'Spatial' },
  references_rg: { zh: '参考', en: 'References' },
  parallel_titles_rg: { zh: '并列正题名', en: 'Parallel Proper Title' },
  alternative_titles_rg: { zh: '交替题名', en: 'Alternative Title' },
  parallel_series_rg: { zh: '并列系列题名', en: 'Parallel Series Title' },
  parallel_names_rg: { zh: '并列名称', en: 'Parallel Name' },
};

function stripSectionOrdinal(title: string): string {
  return title.replace(/^\d+\s+/, '').trim();
}

function formatSectionLabel(row: CanvasRow): string {
  const mapped = row.variableName ? SECTION_ELEMENT_LABELS[row.variableName] : undefined;
  const raw = stripSectionOrdinal(row.title || '');
  if (mapped) {
    // 片段/场景/镜头层「题目」仍对应 Schema Title
    if (raw.includes('题目')) return t('题目（Title）');
    return t(`${mapped.zh}（${mapped.en}）`);
  }
  if (raw) return raw;
  return '';
}

/**
 * GY/T 202.1 标准限定词的标签是否仍为默认值：
 * 默认（zh、zh（en）或种子数据里的缩写，如「版权所有者」vs「版权所有者名称」）→ 画布继续显示标准双语标签；
 * 一旦用户改过组标题/显示名称 → 视为自定义，画布尊重自定义值（否则改名后画布不动）。
 */
function isDefaultRepeatLabel(mapped: { zh: string; en: string }, label: string): boolean {
  if (!label) return true;
  if (label === t(`${mapped.zh}（${mapped.en}）`) || label === mapped.zh) return true;
  return mapped.zh.startsWith(label);
}

export function formatRepeatGroupLabel(field: FieldDef): string {
  const varName = String(field.fieldConfig?.variableName || field.code);
  const mapped = REPEAT_ELEMENT_LABELS[varName] || REPEAT_ELEMENT_LABELS[field.code];
  const title = String(field.fieldConfig?.title || field.name || field.code);
  if (mapped && isDefaultRepeatLabel(mapped, title)) return t(`${mapped.zh}（${mapped.en}）`);
  return title;
}

function isNestedRepeatChild(field: FieldDef): boolean {
  return Boolean(field.fieldConfig?.[REPEAT_PARENT_KEY]);
}

function repeatChildrenOf(fields: FieldDef[], repeatCode: string): FieldDef[] {
  return fields.filter((f) => f.fieldConfig?.[REPEAT_PARENT_KEY] === repeatCode);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeRow(
  fieldCodes: string[] = [],
  meta?: { title?: string; variableName?: string },
): CanvasRow {
  return {
    id: uid('row'),
    columns: [{ id: uid('col'), fieldCodes, span: 12 }],
    title: meta?.title,
    variableName: meta?.variableName,
  };
}

function makeRowWithCols(colCount: number): CanvasRow {
  const safe = Math.min(4, Math.max(1, colCount));
  const cols = Array.from({ length: safe }).map(() => ({ id: uid('col'), fieldCodes: [] as string[], span: 1 }));
  return {
    id: uid('row'),
    columns: rebalanceColumnSpans(cols),
  };
}

/**
 * 非对称两列布局：左 1 格右 3 格（1:3）、左 3 格右 1 格（3:1）。
 * 「格」以 4 等分计（1+3=4），映射到 12 栅格：1 格 = 3 列宽，3 格 = 9 列宽。
 */
function makeRowWithRatio(leftUnits: 1 | 3): CanvasRow {
  const left = leftUnits * 3;
  return {
    id: uid('row'),
    columns: [
      { id: uid('col'), fieldCodes: [], span: left },
      { id: uid('col'), fieldCodes: [], span: 12 - left },
    ],
  };
}

/* ───────────────── 画布树递归工具（单元格可内嵌 TABS/DIVIDER 块，2026-09-22） ───────────────── */

/** 深度优先访问画布树中的每一行（根级行块、页签内行、单元格嵌套块内的行）。 */
function visitRows(blocks: CanvasBlock[], fn: (row: CanvasRow) => void) {
  for (const b of blocks) {
    const rows: CanvasRow[] =
      b.kind === 'ROW' ? [b.row] : b.kind === 'TABS' ? b.tabs.flatMap((t) => t.rows) : [];
    for (const row of rows) {
      fn(row);
      for (const col of row.columns) if (col.blocks?.length) visitRows(col.blocks, fn);
    }
  }
}

/** 映射画布树中的每个单元格（递归进入单元格内嵌块）。 */
function mapCellsInBlocks(
  blocks: CanvasBlock[],
  fn: (cell: CanvasCell) => CanvasCell,
): CanvasBlock[] {
  return mapRowsInBlocks(blocks, (row) => ({ ...row, columns: row.columns.map(fn) }));
}

/** 映射画布树中的每一行（递归进入单元格内嵌块）。 */
function mapRowsInBlocks(
  blocks: CanvasBlock[],
  fn: (row: CanvasRow) => CanvasRow,
): CanvasBlock[] {
  const mapRow = (row: CanvasRow): CanvasRow => {
    const next = fn(row);
    return {
      ...next,
      columns: next.columns.map((c) =>
        c.blocks?.length ? { ...c, blocks: mapBlocks(c.blocks) } : c,
      ),
    };
  };
  const mapBlocks = (list: CanvasBlock[]): CanvasBlock[] =>
    list.map((b) => {
      if (b.kind === 'ROW') return { ...b, row: mapRow(b.row) };
      if (b.kind === 'TABS') {
        return { ...b, tabs: b.tabs.map((t) => ({ ...t, rows: t.rows.map(mapRow) })) };
      }
      return b;
    });
  return mapBlocks(blocks);
}

/** 映射画布树中的每一个页签（递归进入单元格内嵌块）。 */
function mapTabsInBlocks(
  blocks: CanvasBlock[],
  fn: (tab: CanvasTab) => CanvasTab,
): CanvasBlock[] {
  const mapBlocks = (list: CanvasBlock[]): CanvasBlock[] =>
    list.map((b) => {
      if (b.kind === 'TABS') {
        return {
          ...b,
          tabs: b.tabs.map((t) => {
            const next = fn(t);
            return { ...next, rows: next.rows.map(mapRowDeep) };
          }),
        };
      }
      if (b.kind === 'ROW') return { ...b, row: mapRowDeep(b.row) };
      return b;
    });
  const mapRowDeep = (row: CanvasRow): CanvasRow => ({
    ...row,
    columns: row.columns.map((c) =>
      c.blocks?.length ? { ...c, blocks: mapBlocks(c.blocks) } : c,
    ),
  });
  return mapBlocks(blocks);
}

/** 按块 id 映射单个块（根级或单元格内嵌，递归查找）。 */
function mapBlockById(
  blocks: CanvasBlock[],
  blockId: string,
  fn: (b: CanvasBlock) => CanvasBlock,
): CanvasBlock[] {
  const rec = (list: CanvasBlock[]): CanvasBlock[] =>
    list.map((b) => {
      let next = b.id === blockId ? fn(b) : b;
      if (next.kind === 'ROW') {
        next = {
          ...next,
          row: {
            ...next.row,
            columns: next.row.columns.map((c) =>
              c.blocks?.length ? { ...c, blocks: rec(c.blocks) } : c,
            ),
          },
        };
      } else if (next.kind === 'TABS') {
        next = {
          ...next,
          tabs: next.tabs.map((t) => ({
            ...t,
            rows: t.rows.map((r) => ({
              ...r,
              columns: r.columns.map((c) =>
                c.blocks?.length ? { ...c, blocks: rec(c.blocks) } : c,
              ),
            })),
          })),
        };
      }
      return next;
    });
  return rec(blocks);
}

/** 删除块（根级或单元格内嵌，递归查找）。 */
function removeBlockById(blocks: CanvasBlock[], blockId: string): CanvasBlock[] {
  return mapCellsInBlocks(
    blocks.filter((b) => b.id !== blockId),
    (c) =>
      c.blocks?.some((b) => b.id === blockId)
        ? { ...c, blocks: c.blocks.filter((b) => b.id !== blockId) }
        : c,
  );
}

/** 删除页签组中的页签；删掉最后一页签时整块移除。 */
function removeTabFromBlock(blocks: CanvasBlock[], blockId: string, tabId: string): CanvasBlock[] {
  let lastTab = false;
  const next = mapBlockById(blocks, blockId, (b) => {
    if (b.kind !== 'TABS') return b;
    const tabs = b.tabs.filter((x) => x.id !== tabId);
    if (!tabs.length) {
      lastTab = true;
      return b;
    }
    return { ...b, tabs, collapsedTabIds: b.collapsedTabIds.filter((x) => x !== tabId) };
  });
  return lastTab ? removeBlockById(blocks, blockId) : next;
}

/** 把块追加进目标单元格（列格内嵌结构控件）。 */
function pushBlockToCell(blocks: CanvasBlock[], cellId: string, block: CanvasBlock): CanvasBlock[] {
  return mapCellsInBlocks(blocks, (c) =>
    c.id === cellId ? { ...c, blocks: [...(c.blocks || []), block] } : c,
  );
}

/** 查找单元格所在行 id（递归，含单元格内嵌块内的行）。 */
function findRowIdByCellId(blocks: CanvasBlock[], cellId: string): string | null {
  let found: string | null = null;
  visitRows(blocks, (row) => {
    if (!found && row.columns.some((c) => c.id === cellId)) found = row.id;
  });
  return found;
}

/** 块子树是否包含某行（含单元格内嵌块）。 */
function blockContainsRow(block: CanvasBlock, rowId: string): boolean {
  let has = false;
  visitRows([block], (row) => {
    if (row.id === rowId) has = true;
  });
  return has;
}

/** 根级块索引：块子树包含该行（含单元格内嵌块内的行）。 */
function findBlockIndexByRowId(blocks: CanvasBlock[], rowId: string): number {
  return blocks.findIndex((b) => blockContainsRow(b, rowId));
}

function resolveBlockDropIndex(blocks: CanvasBlock[], overId: string): number {
  if (overId.startsWith('block:')) {
    return blocks.findIndex((b) => `block:${b.id}` === overId);
  }
  if (overId.startsWith('row:')) {
    return findBlockIndexByRowId(blocks, overId.slice(4));
  }
  if (overId.startsWith('cell:')) {
    const rowId = findRowIdByCellId(blocks, overId.slice(5));
    return rowId ? findBlockIndexByRowId(blocks, rowId) : -1;
  }
  if (overId.startsWith('chip:')) {
    const rowId = findRowIdByCellId(blocks, overId.split(':')[1] || '');
    return rowId ? findBlockIndexByRowId(blocks, rowId) : -1;
  }
  return -1;
}

/**
 * 结构控件（表单分区/页签/分隔线）拖放到画布时的块级插入点：
 * 落点解析为画布块索引 —— 在该块**之前**插入（落点为 -1 时追加到末尾）。
 * 与 resolveBlockDropIndex 的区别：`canvas`（画布空白处）返回 blocks.length（追加）。
 */
function resolveStructuralInsertIndex(blocks: CanvasBlock[], overId: string): number {
  if (overId === 'canvas') return blocks.length;
  const at = resolveBlockDropIndex(blocks, overId);
  return at >= 0 ? at : blocks.length;
}

/**
 * 从页签组中摘除一行（递归查找，保留列结构与内容原样搬移）。
 * 摘除后页签若空行则补一个空行，避免页签内容区消失。
 */
function takeRowOutOfTabs(blocks: CanvasBlock[], tabId: string, rowId: string): { blocks: CanvasBlock[]; row: CanvasRow | null } {
  let taken: CanvasRow | null = null;
  const next = mapTabsInBlocks(blocks, (t) => {
    if (taken || t.id !== tabId || !t.rows.some((r) => r.id === rowId)) return t;
    const row = t.rows.find((r) => r.id === rowId) || null;
    taken = row;
    const remaining = t.rows.filter((r) => r.id !== rowId);
    return { ...t, rows: remaining.length ? remaining : [makeRow()] };
  });
  return { blocks: next, row: taken };
}

/**
 * 把一行（保留列结构）放回画布：
 * - 目标行在某页签内（含同页签）→ 插入该页签目标行之后（同页签即行重排）；
 * - 目标行在根级 → 作为独立 ROW 块插到目标块之后；
 * - 无目标 → 追加到末尾。
 */
function placeRowNear(blocks: CanvasBlock[], row: CanvasRow, targetRowId: string | null): CanvasBlock[] {
  if (!targetRowId) return [...blocks, { id: uid('blk'), kind: 'ROW', row }];
  let placed = false;
  let next = mapTabsInBlocks(blocks, (t) => {
    if (placed || !t.rows.some((r) => r.id === targetRowId)) return t;
    placed = true;
    const at = t.rows.findIndex((r) => r.id === targetRowId);
    const rows = [...t.rows];
    rows.splice(at + 1, 0, row);
    return { ...t, rows };
  });
  if (placed) return next;
  const anchorIndex = findBlockIndexByRowId(blocks, targetRowId);
  const newBlock: CanvasBlock = { id: uid('blk'), kind: 'ROW', row };
  if (anchorIndex < 0) return [...next, newBlock];
  next = [...next];
  next.splice(anchorIndex + 1, 0, newBlock);
  return next;
}

function resolveTabRowDropIndex(rows: CanvasRow[], tabId: string, overId: string): number {
  if (overId.startsWith('tabrow:')) {
    return rows.findIndex((r) => `tabrow:${tabId}:${r.id}` === overId);
  }
  if (overId.startsWith('row:')) {
    return rows.findIndex((r) => r.id === overId.slice(4));
  }
  if (overId.startsWith('cell:')) {
    const cellId = overId.slice(5);
    return rows.findIndex((r) => r.columns.some((c) => c.id === cellId));
  }
  if (overId.startsWith('chip:')) {
    const cellId = overId.split(':')[1] || '';
    return rows.findIndex((r) => r.columns.some((c) => c.id === cellId));
  }
  return -1;
}

const rowSortCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (activeId.startsWith('block:')) {
    // 块级排序（根级行块移动）：仅与块锚点碰撞。
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith('block:'),
      ),
    });
  }
  if (activeId.startsWith('tabrow:')) {
    // 页签内行拖拽：优先命中列/芯片（可跨块拖入外部行/列）；列未命中时退回行排序目标。
    const cellTargets = args.droppableContainers.filter((c) => {
      const id = String(c.id);
      return id.startsWith('cell:') || id.startsWith('chip:');
    });
    const within = pointerWithin({ ...args, droppableContainers: cellTargets });
    if (within.length) return within;
    const corners = closestCorners({ ...args, droppableContainers: cellTargets });
    if (corners.length) return corners;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith('tabrow:'),
      ),
    }    );
  }
  if (activeId.startsWith('palette:')) {
    // 面板拖放（字段/结构控件）：优先精确命中列格/芯片（结构控件可嵌入列格，2026-09-22），
    // 未指针命中再按最近中心退回（画布空白 → 块级插入）。
    const targets = args.droppableContainers.filter((c) => {
      const id = String(c.id);
      return id.startsWith('cell:') || id.startsWith('chip:');
    });
    const within = pointerWithin({ ...args, droppableContainers: targets });
    if (within.length) return within;
  }
  return closestCenter(args);
};

function rebalanceColumnSpans(cols: CanvasCell[]): CanvasCell[] {
  const n = cols.length;
  if (n <= 0) return cols;
  const base = Math.floor(12 / n);
  const rem = 12 % n;
  return cols.map((c, i) => ({
    ...c,
    span: base + (i < rem ? 1 : 0),
  }));
}

function appendColumn(cols: CanvasCell[]): CanvasCell[] {
  return rebalanceColumnSpans([...cols, { id: uid('col'), fieldCodes: [], span: 1 }]);
}

function isRowEmpty(row: CanvasRow): boolean {
  return row.columns.every((c) => c.fieldCodes.length === 0 && !c.blocks?.length);
}

function removeColumnFromBlocks(blocks: CanvasBlock[], rowId: string, cellId: string): CanvasBlock[] {
  return mapRowsInBlocks(blocks, (r) => {
    if (r.id !== rowId) return r;
    const columns = r.columns.filter((c) => c.id !== cellId);
    if (columns.length === 0 || columns.length === r.columns.length) return r;
    return { ...r, columns: rebalanceColumnSpans(columns) };
  });
}

function addColumnToRow(blocks: CanvasBlock[], rowId: string): CanvasBlock[] {
  return mapRowsInBlocks(blocks, (r) =>
    r.id === rowId ? { ...r, columns: appendColumn(r.columns) } : r,
  );
}

function fresh(type = 'STRING', index = 0): FieldDef {
  const item = PALETTE.find((x) => x.type === type);
  const structuralCode =
    type === 'REPEAT_GROUP' ? `repeat_${index + 1}` : `section_${index + 1}`;
  return {
    code: STRUCTURAL.has(type) ? structuralCode : `field${index + 1}${SUFFIX[type] || '_s'}`,
    name: item?.name || t('新字段'),
    fieldType: type,
    required: false,
    sortOrder: (index + 1) * 10,
    readOnly: false,
    i18n: false,
    adminIndex: false,
    publicIndex: false,
    sensitive: false,
    sortable: false,
    filterable: false,
    highlight: false,
    uniqueField: false,
    fieldConfig:
      type === 'COMPONENT_REF'
        ? { bindingMode: 'EMBEDDED' }
        : type === 'RELATIONSHIP'
          ? { relationId: '' }
          : type === 'CONSTANT'
            ? { constantValue: '' }
            : type === 'REPEAT_GROUP'
              ? { minItems: 0, maxItems: -1, title: t('重复组'), variableName: `repeat_${index + 1}` }
              : type === 'FORM_SECTION' || type === 'TAB'
                ? { title: item?.name, variableName: `section_${index + 1}`, collapsed: false }
                : {},
  };
}

/** 系统字段目录项 → 设计器字段定义（🔒 不可删除、类型/变量名不可改，FR-CM-SYSFIELD-001）。 */
function systemFieldDef(s: SystemFieldDef): FieldDef {
  return {
    ...fresh(s.fieldType, 0),
    code: s.code,
    name: s.name,
    isSystem: true,
    systemFieldType: s.systemFieldType,
  };
}

function normalize(items: FieldDef[]) {
  return items.map((f, i) => ({ ...f, sortOrder: (i + 1) * 10 }));
}

function suggestCode(name: string, fieldType: string) {
  const words = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return `field${SUFFIX[fieldType] || '_s'}`;
  let base = words[0].toLowerCase();
  for (let i = 1; i < words.length; i++) {
    base += words[i].charAt(0).toUpperCase() + words[i].slice(1);
  }
  base = base.replace(/[^a-zA-Z0-9]/g, '');
  if (!base || !/^[a-z]/.test(base)) base = `field${base}`;
  return `${base}${SUFFIX[fieldType] || '_s'}`;
}

function cloneField(field: FieldDef): FieldDef {
  return { ...field, fieldConfig: { ...(field.fieldConfig || {}) } };
}

/** Designer keeps options as textarea text; API expects [{label,value}]. */
function toUiField(field: FieldDef): FieldDef {
  if (!['ENUM', 'MULTI_ENUM'].includes(field.fieldType)) return field;
  return {
    ...field,
    fieldConfig: { ...(field.fieldConfig || {}), options: enumOptionsToText(field.fieldConfig?.options) },
  };
}

function toApiField(field: FieldDef): FieldDef {
  if (!['ENUM', 'MULTI_ENUM'].includes(field.fieldType)) return field;
  return {
    ...field,
    fieldConfig: { ...(field.fieldConfig || {}), options: parseEnumOptions(field.fieldConfig?.options) },
  };
}

function stripDesignerMeta(field: FieldDef): FieldDef {
  const cfg = { ...(field.fieldConfig || {}) };
  delete cfg[REPEAT_PARENT_KEY];
  return { ...field, fieldConfig: cfg };
}

/**
 * 属性检查器草稿合并。结构控件（重复组等）的画布标签读 `fieldConfig.title`，
 * 而「显示名称」只写 `name` —— 双向同步后任一编辑都能即时反映到画布卡片
 * （content-model-ui-specification §7.2.1「实时同步到画布卡片标题」）。
 */
export function mergeInspectorDraft(base: FieldDef, all: Partial<FieldDef>): FieldDef {
  const draft: FieldDef = {
    ...base,
    ...all,
    fieldConfig: { ...base.fieldConfig, ...all.fieldConfig },
  };
  if (STRUCTURAL.has(draft.fieldType)) {
    if (typeof all.name === 'string') {
      draft.fieldConfig = { ...draft.fieldConfig, title: all.name };
    } else if (typeof all.fieldConfig?.title === 'string') {
      draft.name = all.fieldConfig.title;
    }
  }
  return draft;
}

export function makeRepeatGroupField(el: LayoutElement): FieldDef {
  const cfg = el.config || {};
  const variableName = String(cfg.variableName || `repeat_${el.sortOrder || 1}`);
  const mapped = REPEAT_ELEMENT_LABELS[variableName];
  const rawTitle = String(cfg.title || '');
  // 标准限定词自定义过标题 → 回填自定义值（name/title 一致，保存重开后画布仍显示自定义名）
  const customTitle = Boolean(mapped) && !isDefaultRepeatLabel(mapped, rawTitle);
  const displayName = customTitle
    ? rawTitle
    : mapped
      ? t(`${mapped.zh}（${mapped.en}）`)
      : rawTitle || t('重复组');
  return {
    code: variableName,
    name: displayName,
    fieldType: 'REPEAT_GROUP',
    required: false,
    sortOrder: el.sortOrder || 0,
    readOnly: false,
    i18n: false,
    adminIndex: false,
    publicIndex: false,
    sensitive: false,
    sortable: false,
    filterable: false,
    highlight: false,
    uniqueField: false,
    fieldConfig: {
      title: customTitle ? rawTitle : mapped?.zh || rawTitle || t('重复组'),
      variableName,
      minItems: cfg.minItems ?? 0,
      maxItems: cfg.maxItems ?? -1,
      collapsed: cfg.collapsed,
      ...(cfg.compose ? { compose: cfg.compose } : {}),
    },
  };
}

/** Rebuild designer fields + canvas from API layout (preserves REPEAT_GROUP). */
function hydrateFromContentType(value?: ContentType): { fields: FieldDef[]; blocks: CanvasBlock[] } {
  const layout = value?.layout;
  if (layout?.length) {
    const fields: FieldDef[] = [];
    const blocks: CanvasBlock[] = [];

    const pushField = (raw: FieldDef, parentRepeat?: string) => {
      const ui = toUiField({
        ...raw,
        fieldConfig: {
          ...(raw.fieldConfig || {}),
          ...(parentRepeat ? { [REPEAT_PARENT_KEY]: parentRepeat } : {}),
        },
      });
      fields.push(ui);
      return ui.code;
    };

    /** 重复组子字段注册（不占画布列位，仅挂 REPEAT_PARENT_KEY 标记）。 */
    const registerNested = (els: LayoutElement[] | undefined, parentRepeat: string) => {
      for (const el of els || []) {
        if (el.elementType === 'FIELD' && el.field) {
          pushField(el.field, parentRepeat);
        } else if (el.elementType === 'REPEAT_GROUP') {
          const rg = makeRepeatGroupField(el);
          rg.fieldConfig = { ...(rg.fieldConfig || {}), [REPEAT_PARENT_KEY]: parentRepeat };
          fields.push(rg);
          registerNested(el.children, rg.code);
        } else if (el.elementType === 'FORM_SECTION') {
          registerNested(el.children, parentRepeat);
        }
      }
    };

    /** 行内子项列位解码：`(列号+1)*1000+序号` → 列号（负值/越界即不可解码）。 */
    const decodeCol = (so: number) => Math.floor(so / 1000) - 1;

    /** 行 FORM_SECTION 子元素 → 单元格内容项（字段码 / 嵌套 TAB、LINE_DIVIDER 块）。 */
    const parseCellItems = (els: LayoutElement[] | undefined): CellItem[] => {
      const items: CellItem[] = [];
      for (const el of els || []) {
        const so = Number(el.sortOrder) || Number(el.field?.sortOrder) || 0;
        const col = decodeCol(so);
        if (el.elementType === 'FIELD' && el.field) {
          items.push({ kind: 'code', code: pushField(el.field), col, ord: so });
        } else if (el.elementType === 'REPEAT_GROUP') {
          const rg = makeRepeatGroupField(el);
          fields.push(rg);
          registerNested(el.children, rg.code);
          items.push({ kind: 'code', code: rg.code, col, ord: so });
        } else if (el.elementType === 'TAB') {
          items.push({ kind: 'block', block: parseTabsBlock(el), col, ord: so });
        } else if (el.elementType === 'LINE_DIVIDER') {
          items.push({ kind: 'block', block: { id: uid('blk'), kind: 'DIVIDER' }, col, ord: so });
        } else if (el.elementType === 'FORM_SECTION') {
          // 存量布局的行内 FORM_SECTION 子分组：透明摊平（列位取子元素自身 sortOrder）。
          items.push(...parseCellItems(el.children));
        }
      }
      return items;
    };

    /**
     * 行元素 → 画布行：按 sortOrder 列位 + `config.columnSpans` 重建多列（2026-09-22 修复：
     * 此前水合一律压成单列，保存重开后多列布局丢失）。列位不可解码时（API 直建模型、
     * 后补系统字段等）退回历史单列摊平 —— 与 `modelFormLayout.decodeColumns` 同口径。
     */
    const buildRow = (
      items: CellItem[],
      cfg: Record<string, unknown>,
      meta?: { title?: string; variableName?: string },
    ): CanvasRow => {
      const spans = Array.isArray(cfg.columnSpans)
        ? (cfg.columnSpans as unknown[]).map((s) => Number(s) || 1)
        : [];
      const columnCount = Math.floor(Number(cfg.columns) || 0) || spans.length;
      const decodable =
        columnCount >= 1 &&
        items.every((it) => Number.isInteger(it.col) && it.col >= 0 && it.col < columnCount);
      const columns: CanvasCell[] = decodable
        ? Array.from({ length: columnCount }, (_, i) => ({
            id: uid('col'),
            fieldCodes: [] as string[],
            span: spans[i] ?? Math.max(1, Math.round(12 / columnCount)),
          }))
        : [{ id: uid('col'), fieldCodes: [] as string[], span: 12 }];
      const sorted = [...items].sort((a, b) => (decodable ? a.col - b.col : 0) || a.ord - b.ord);
      for (const it of sorted) {
        const target = columns[decodable ? it.col : 0];
        if (it.kind === 'code') target.fieldCodes.push(it.code);
        else target.blocks = [...(target.blocks || []), it.block];
      }
      return { id: uid('row'), columns, title: meta?.title, variableName: meta?.variableName };
    };

    const parseRow = (el: LayoutElement): CanvasRow =>
      buildRow(parseCellItems(el.children), (el.config || {}) as Record<string, unknown>, {
        title: String(el.config?.title || ''),
        variableName: String(el.config?.variableName || ''),
      });

    const parseTabsBlock = (el: LayoutElement): CanvasBlock => {
      const tabs: CanvasTab[] = (el.children || []).map((tabEl, i) => {
        const tabId = String(tabEl.config?.tabId || uid('tab'));
        const title = String(tabEl.config?.title || `Tab ${i + 1}`);
        const rows: CanvasRow[] = [];
        for (const child of tabEl.children || []) {
          if (child.elementType === 'FORM_SECTION') {
            rows.push(parseRow(child));
          } else {
            const items = parseCellItems([child]);
            if (items.length) rows.push(buildRow(items, {}));
          }
        }
        if (!rows.length) rows.push(makeRow());
        return { id: tabId, title, rows };
      });
      return {
        id: uid('blk'),
        kind: 'TABS',
        tabs: tabs.length ? tabs : [{ id: uid('tab'), title: 'Tab 1', rows: [makeRow()] }],
        collapsedTabIds: [],
      };
    };

    for (const el of layout) {
      if (el.elementType === 'FORM_SECTION') {
        blocks.push({ id: uid('blk'), kind: 'ROW', row: parseRow(el) });
      } else if (el.elementType === 'TAB') {
        blocks.push(parseTabsBlock(el));
      } else if (el.elementType === 'LINE_DIVIDER') {
        blocks.push({ id: uid('blk'), kind: 'DIVIDER' });
      } else if (el.elementType === 'FIELD' || el.elementType === 'REPEAT_GROUP') {
        blocks.push({ id: uid('blk'), kind: 'ROW', row: buildRow(parseCellItems([el]), {}) });
      }
    }

    if (!fields.length) {
      const fallback = fresh('STRING', 0);
      return {
        fields: [fallback],
        blocks: [{ id: uid('blk'), kind: 'ROW', row: makeRow([fallback.code]) }],
      };
    }
    if (!blocks.length) {
      const top = fields.filter((f) => !isNestedRepeatChild(f)).map((f) => f.code);
      blocks.push({ id: uid('blk'), kind: 'ROW', row: makeRow(top) });
    }
    return { fields: normalize(fields), blocks };
  }

  const fs = normalize((value?.fields || []).filter((f) => !STRUCTURAL.has(f.fieldType)).map(toUiField));
  const items = fs.length ? fs : [fresh('STRING', 0)];
  return {
    fields: items,
    blocks: [{ id: uid('blk'), kind: 'ROW', row: makeRow(items.map((f) => f.code)) }],
  };
}

function validateFieldDef(field: FieldDef, opts?: { isDuplicate?: boolean }): string[] {
  const e: string[] = [];
  if (!field.name.trim()) e.push(t('名称不能为空'));
  if (!CODE_PATTERN.test(field.code)) e.push(t('变量名格式无效'));
  if (opts?.isDuplicate) e.push(t('变量名重复'));
  if (!STRUCTURAL.has(field.fieldType) && !field.code.endsWith(SUFFIX[field.fieldType] || '')) {
    e.push(`建议使用 ${SUFFIX[field.fieldType]} 后缀`);
  }
  if (field.sensitive && field.publicIndex) e.push(t('敏感字段不可进入访客索引'));
  if (['ENUM', 'MULTI_ENUM'].includes(field.fieldType) && parseEnumOptions(field.fieldConfig?.options).length === 0) {
    e.push(t('枚举选项不能为空'));
  }
  return e;
}

function isCodeTaken(code: string, fields: FieldDef[], excludeCode?: string) {
  return fields.some((f) => f.code === code && f.code !== excludeCode);
}

function renameCodeInBlocks(src: CanvasBlock[], from: string, to: string): CanvasBlock[] {
  if (from === to) return src;
  return mapCellsInBlocks(src, (c) => ({
    ...c,
    fieldCodes: c.fieldCodes.map((code) => (code === from ? to : code)),
  }));
}

type InspectorSession =
  | {
      mode: 'create';
      draft: FieldDef;
      cellId: string;
      beforeCode?: string;
      /** When set, new field is nested under this REPEAT_GROUP (not placed on canvas). */
      parentRepeatCode?: string;
      /** Re-open this REPEAT_GROUP after saving a nested child. */
      returnToRepeatCode?: string;
    }
  | { mode: 'edit'; draft: FieldDef; originalCode: string; returnToRepeatCode?: string };

function PaletteCard({ item }: { item: PaletteItem }) {
  const d = useDraggable({ id: `palette:${item.type}`, data: { source: 'palette', type: item.type } });
  return (
    <div
      ref={d.setNodeRef}
      {...d.listeners}
      {...d.attributes}
      className={`model-palette-card${d.isDragging ? ' dragging' : ''}`}
    >
      <Space align="start" style={{ width: '100%' }}>
        <HolderOutlined style={{ color: '#8c8c8c', marginTop: 3, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Space size={6} style={{ flexWrap: 'nowrap' }}>
            <span style={{ color: '#1677ff', flexShrink: 0 }}>{item.icon}</span>
            <Typography.Text strong style={{ fontSize: 13 }} ellipsis>{t(item.name)}</Typography.Text>
            <Tag style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>{item.type}</Tag>
          </Space>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{t(item.description)}</Typography.Text>
          </div>
        </div>
      </Space>
    </div>
  );
}

function DropCanvas({ children }: { children: ReactNode }) {
  const d = useDroppable({ id: 'canvas' });
  return (
    <div ref={d.setNodeRef} className={`model-drop-canvas${d.isOver ? ' over' : ''}`}>
      {children}
    </div>
  );
}

function DraggableFieldChip({
  field,
  cellId,
  selected,
  onSelect,
  onDelete,
  dragDisabled,
}: {
  field: FieldDef;
  cellId: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  dragDisabled?: boolean;
}) {
  const d = useDraggable({
    id: `placed:${field.code}`,
    data: { source: 'canvas', code: field.code },
    disabled: dragDisabled,
  });
  const drop = useDroppable({ id: `chip:${cellId}:${field.code}`, disabled: dragDisabled });
  const item = PALETTE.find((x) => x.type === field.fieldType);
  return (
    <div ref={drop.setNodeRef} className={drop.isOver ? 'model-chip-slot over' : 'model-chip-slot'}>
      <div
        ref={d.setNodeRef}
        className={`model-cell-item${selected ? ' selected' : ''}${d.isDragging ? ' dragging' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <span className="model-cell-item-handle" {...d.listeners} {...d.attributes}>
          <HolderOutlined />
        </span>
        <span className="model-cell-item-icon">{item?.icon ?? <FormOutlined />}</span>
        <span className="model-cell-item-main">
          <Typography.Text strong>
            {field.fieldType === 'REPEAT_GROUP' ? formatRepeatGroupLabel(field) : t(field.name)}
            {field.isSystem && (
              <Tooltip title={t('系统字段，不可删除')}>
                <LockOutlined style={{ marginLeft: 6, color: '#faad14' }} />
              </Tooltip>
            )}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {field.fieldType === 'REPEAT_GROUP' ? field.code : field.code}
          </Typography.Text>
        </span>
        <Button
          type="text"
          size="small"
          danger
          disabled={field.isSystem}
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}

function CanvasRowDrop({
  rowId,
  style,
  children,
  droppableDisabled,
}: {
  rowId: string;
  style?: CSSProperties;
  children: ReactNode;
  droppableDisabled?: boolean;
}) {
  const d = useDroppable({ id: `row:${rowId}`, disabled: droppableDisabled });
  return (
    <div ref={d.setNodeRef} className={`model-canvas-row${d.isOver ? ' over' : ''}`} style={style}>
      {children}
    </div>
  );
}

function RowLayoutPicker({ onPick }: { onPick: (cols: number, ratio?: 1 | 3) => void }) {
  const equalLabels = [t('1 列'), t('2 列'), t('3 列'), t('4 列')];
  return (
    <div className="model-row-layout-picker">
      {[1, 2, 3, 4].map((n) => (
        <button key={n} type="button" className="model-row-layout-option" onClick={() => onPick(n)}>
          <div className="model-row-layout-option-title">{equalLabels[n - 1]}</div>
          <div className="model-row-layout-option-bars" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {Array.from({ length: n }).map((_, i) => (
              <span key={i} className="model-row-layout-bar" />
            ))}
          </div>
        </button>
      ))}
      <button type="button" className="model-row-layout-option" onClick={() => onPick(2, 1)}>
        <div className="model-row-layout-option-title">{t('2 列（左 1 格 · 右 3 格）')}</div>
        <div className="model-row-layout-option-bars" style={{ gridTemplateColumns: '1fr 3fr' }}>
          <span className="model-row-layout-bar" />
          <span className="model-row-layout-bar" />
        </div>
      </button>
      <button type="button" className="model-row-layout-option" onClick={() => onPick(2, 3)}>
        <div className="model-row-layout-option-title">{t('2 列（左 3 格 · 右 1 格）')}</div>
        <div className="model-row-layout-option-bars" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <span className="model-row-layout-bar" />
          <span className="model-row-layout-bar" />
        </div>
      </button>
    </div>
  );
}

function SortableRowShell({
  id,
  sortable,
  showDelete,
  onDelete,
  sectionLabel,
  children,
}: {
  id: string;
  sortable: boolean;
  showDelete?: boolean;
  onDelete?: () => void;
  sectionLabel?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !sortable,
    data: { source: 'row-sort' },
  });
  return (
    <div
      ref={setNodeRef}
      className={`model-row-shell${isDragging ? ' dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="model-row-header">
        {sortable ? (
          <div
            ref={setActivatorNodeRef}
            className="model-row-drag-handle"
            {...listeners}
            {...attributes}
          >
            <HolderOutlined />
          </div>
        ) : (
          <div className="model-row-drag-handle model-row-drag-handle-static">
            <HolderOutlined />
          </div>
        )}
        {sectionLabel ? <div className="model-row-section-title">{sectionLabel}</div> : null}
      </div>
      {showDelete && onDelete && (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          className="model-row-delete-btn"
          onClick={onDelete}
        />
      )}
      {children}
    </div>
  );
}

function SortableBlockAnchor({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useSortable({ id, disabled: true });
  return (
    <div ref={setNodeRef} className="model-block-anchor">
      {children}
    </div>
  );
}

function CanvasCellView({
  cell,
  fieldsByCode,
  selectedCode,
  onSelectCode,
  onDeleteField,
  canDeleteColumn,
  onDeleteColumn,
  droppableDisabled,
  renderNested,
}: {
  cell: CanvasCell;
  fieldsByCode: Map<string, FieldDef>;
  selectedCode: string | null;
  onSelectCode: (code: string) => void;
  onDeleteField: (code: string) => void;
  canDeleteColumn?: boolean;
  onDeleteColumn?: () => void;
  droppableDisabled?: boolean;
  /** 渲染单元格内嵌结构块（页签组/分隔线，2026-09-22）。 */
  renderNested?: (blocks: CanvasBlock[]) => ReactNode;
}) {
  const d = useDroppable({ id: `cell:${cell.id}`, disabled: droppableDisabled });
  const hasNested = Boolean(cell.blocks?.length);
  return (
    <div ref={d.setNodeRef} className={`model-canvas-cell${d.isOver ? ' over' : ''}`}>
      {cell.fieldCodes.length === 0 && !hasNested && canDeleteColumn && (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          className="model-cell-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteColumn?.();
          }}
        />
      )}
      {cell.fieldCodes.length ? (
        cell.fieldCodes.map((code) => {
          const field = fieldsByCode.get(code);
          if (!field) return null;
          return (
            <DraggableFieldChip
              key={code}
              field={field}
              cellId={cell.id}
              selected={selectedCode === code}
              onSelect={() => onSelectCode(code)}
              onDelete={() => onDeleteField(code)}
              dragDisabled={droppableDisabled}
            />
          );
        })
      ) : !hasNested ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Drag and drop the fields here
        </Typography.Text>
      ) : null}
      {hasNested && <div className="model-canvas-cell-blocks">{renderNested?.(cell.blocks || [])}</div>}
    </div>
  );
}

/** 「模板」页签持有的字段名；保存校验失败时据此把用户定位到该页签。 */
const TEMPLATE_FIELDS = new Set(['displayTemplate', 'previewImage', 'controllerPath', 'formController', 'schemaOrgType']);

/** 表单项标签：可附加 ? 帮助提示（tip）与「待生效」警示（pending），帮助用户理解选项含义。 */
function fieldLabel(label: string, opts?: { tip?: string; pending?: string }): ReactNode {
  if (!opts?.tip && !opts?.pending) return label;
  return (
    <Space size={4}>
      {label}
      {opts?.tip && (
        <Tooltip title={opts.tip}>
          <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', cursor: 'help' }} />
        </Tooltip>
      )}
      {opts?.pending && (
        <Tooltip title={opts.pending}>
          <Tag color="warning" style={{ marginInlineEnd: 0 }}>
            {t('待生效')}
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
}

function ModelsInner() {
  const { siteId } = useSite();
  const [list, setList] = useState<ContentType[]>([]);
  const [filterName, setFilterName] = useState('');
  const [filterType, setFilterType] = useState<string>();
  const [filterStatus, setFilterStatus] = useState<string>();
  const [current, setCurrent] = useState<ContentType>();
  const [fields, setFieldsState] = useState<FieldDef[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('design');
  const [panelKeys, setPanelKeys] = useState<string[]>(['model']);
  const [compact, setCompact] = useState(false);
  const [search, setSearch] = useState('');
  const [activeLabel, setActiveLabel] = useState('');
  const [dirty, setDirty] = useState(false);
  const [parents, setParents] = useState<ContentType[]>([]);
  const [history, setHistory] = useState<FieldDef[][]>([]);
  const [future, setFuture] = useState<FieldDef[][]>([]);
  const [lifecycle, setLifecycle] = useState<Partial<Record<LifecycleHook['event'], string>>>({});
  const [lifecycleListen, setLifecycleListen] = useState<Partial<Record<LifecycleHook['event'], string>>>({});
  const [lifecycleEvent, setLifecycleEvent] = useState<LifecycleHook['event']>('CREATE');
  const [versions, setVersions] = useState<ContentType[]>([]);
  const [rowPicker, setRowPicker] = useState<{ open: boolean; blockId?: string; tabId?: string }>({ open: false });
  const [inspector, setInspector] = useState<InspectorSession | null>(null);
  const [form] = Form.useForm();
  const selected = useMemo(
    () => (selectedCode ? fields.findIndex((f) => f.code === selectedCode) : -1),
    [fields, selectedCode],
  );

  const load = useCallback(async () => {
    if (siteId) setList(await modelsApi.list(siteId));
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const commit = useCallback((next: FieldDef[], rename?: { from: string; to: string }) => {
    setFieldsState((old) => {
      setHistory((h) => [...h, old].slice(-50));
      setFuture([]);
      const normalized = normalize(next);
      const codeSet = new Set(normalized.map((f) => f.code));
      // Rename canvas codes before filtering, otherwise a variable rename drops the chip
      // (fields already use the new code while blocks still hold the old code).
      setBlocks((prev) => {
        const base =
          rename && rename.from !== rename.to
            ? renameCodeInBlocks(prev, rename.from, rename.to)
            : prev;
        return mapCellsInBlocks(base, (c) => ({
          ...c,
          fieldCodes: c.fieldCodes.filter((code) => codeSet.has(code)),
        }));
      });
      return normalized;
    });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFieldsState((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
      });
      setDirty(true);
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setFieldsState((cur) => {
        setHistory((h) => [...h, cur]);
        return next;
      });
      setDirty(true);
      return f.slice(1);
    });
  }, []);

  const close = () => {
    if (!dirty) {
      setInspector(null);
      setOpen(false);
      return;
    }
    Modal.confirm({
      title: t('放弃未保存的修改？'),
      content: t('当前模型包含未保存的更改。'),
      okText: t('放弃修改'),
      okButtonProps: { danger: true },
      cancelText: t('继续编辑'),
      onOk: () => {
        setInspector(null);
        setOpen(false);
      },
    });
  };

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selected >= 0) {
        e.preventDefault();
        const f = fields[selected];
        const n = [...fields];
        n.splice(selected + 1, 0, { ...f, id: undefined, code: `${f.code}_copy` });
        commit(n);
        setSelectedCode(n[selected + 1].code);
      } else if (e.key === 'Delete' && selected >= 0) {
        e.preventDefault();
        const code = fields[selected]?.code;
        if (code) {
          const toRemove = new Set<string>([code]);
          for (const f of fields) {
            if (f.fieldConfig?.[REPEAT_PARENT_KEY] === code) toRemove.add(f.code);
          }
          commit(fields.filter((f) => !toRemove.has(f.code)));
          setSelectedCode(null);
        }
      } else if (e.key === 'Escape') {
        if (inspector) {
          setInspector(null);
          return;
        }
        setSelectedCode(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, selected, fields, commit, undo, redo, inspector]);

  /** 系统字段目录（后端单一权威，前端不再硬编码）：失败静默退回空清单，不影响设计器可用性。 */
  const fetchSystemFieldCatalog = async (objectType: string, mediaKind?: string): Promise<SystemFieldDef[]> => {
    if (!siteId) return [];
    try {
      return await modelsApi.systemFields(siteId, objectType, mediaKind);
    } catch {
      return [];
    }
  };

  /**
   * 对象类型/媒体种类变化时同步系统字段芯片（仅新建态；编辑态对象类型已锁定）：
   * 新增的系统字段放进第一个单元格（随后可拖放调整到任意行/列），
   * 不再适用的系统字段连同芯片一并随 commit 清理。
   */
  const syncSystemFields = async (objectType: string, mediaKind?: string) => {
    const catalog = await fetchSystemFieldCatalog(objectType, objectType === 'MEDIA' ? mediaKind : undefined);
    if (!catalog.length) return;
    const wanted = new Set(catalog.map((c) => c.code));
    const kept = fields.filter((f) => !f.isSystem || wanted.has(f.code));
    const existing = new Set(kept.map((f) => f.code));
    const missing = catalog.filter((c) => !existing.has(c.code)).map(systemFieldDef);
    if (!missing.length && kept.length === fields.length) return;
    if (missing.length) {
      let placed = false;
      const withAdded = mapCellsInBlocks(blocks, (c) => {
        if (placed) return c;
        placed = true;
        return { ...c, fieldCodes: [...c.fieldCodes, ...missing.map((f) => f.code)] };
      });
      setBlocks(
        placed
          ? withAdded
          : [...blocks, { id: uid('blk'), kind: 'ROW', row: makeRow(missing.map((f) => f.code)) }],
      );
    }
    commit([...kept, ...missing]);
  };

  const begin = async (value?: ContentType) => {
    const hydrated = hydrateFromContentType(value);
    if (!value) {
      // 2026-09-22：新建模型即播种系统字段（可见、可拖放调整到任意行/列），替换示例字段空态
      const catalog = await fetchSystemFieldCatalog('PAGE');
      if (catalog.length) {
        const seeded = catalog.map(systemFieldDef);
        hydrated.fields = seeded;
        hydrated.blocks = [{ id: uid('blk'), kind: 'ROW', row: makeRow(seeded.map((f) => f.code)) }];
      }
    }
    const allCodes = hydrated.fields.filter((f) => !isNestedRepeatChild(f)).map((f) => f.code);
    setCurrent(value);
    setFieldsState(hydrated.fields);
    setSelectedCode(allCodes[0] || null);
    setBlocks(hydrated.blocks);
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setActiveTab('design');
    setPanelKeys(['model']);
    setCompact(false);
    form.resetFields();
    form.setFieldsValue(
      value || {
        templateType: 'PAGE',
        objectType: 'PAGE',
        mergeStrategy: 'NONE',
        flattenComponents: true,
        quickCreate: false,
        config: { pathIncludes: [], pathExcludes: [], deleteDependencies: [], copyDependencies: [], cdataEscapedFieldPatterns: [] },
        subtype: null,
      },
    );
    setLifecycle({});
    setLifecycleListen({});
    setVersions([]);
    if (value && siteId) {
      try {
        setParents(await modelsApi.parentCandidates(siteId, value.id));
      } catch {
        setParents([]);
      }
      try {
        const hooks = await modelsApi.lifecycle(siteId, value.id);
        const map: Partial<Record<LifecycleHook['event'], string>> = {};
        const listenMap: Partial<Record<LifecycleHook['event'], string>> = {};
        hooks.forEach((h) => {
          map[h.event] = h.scriptContent;
          listenMap[h.event] = h.listenEvents || '';
        });
        setLifecycle(map);
        setLifecycleListen(listenMap);
      } catch {
        /* optional */
      }
      try {
        // versions endpoint via get + list by code is not exposed; use list filtered later
        setVersions([value]);
      } catch {
        setVersions([value]);
      }
    } else {
      setParents([]);
    }
    setOpen(true);
  };

  const edit = async (row: ContentType) => {
    const v = await modelsApi.get(siteId!, row.id);
    await begin(v);
  };

  const validation = useMemo(() => {
    const counts = new Map<string, number>();
    fields.forEach((f) => counts.set(f.code, (counts.get(f.code) || 0) + 1));
    return fields.map((f) => validateFieldDef(f, { isDuplicate: (counts.get(f.code) || 0) > 1 }));
  }, [fields]);
  const errorCount = validation.reduce((n, e) => n + e.length, 0);
  const inspectorErrors = useMemo(
    () =>
      inspector
        ? validateFieldDef(inspector.draft, {
            isDuplicate: isCodeTaken(
              inspector.draft.code,
              fields,
              inspector.mode === 'edit' ? inspector.originalCode : undefined,
            ),
          })
        : [],
    [inspector, fields],
  );

  const layout = useMemo<LayoutElement[]>(() => {
    let order = 10;
    // variableName 全局唯一（后端 walk() 逐元素校验重复）——嵌套块共享计数器。
    let tabsSeq = 0;
    let dividerSeq = 0;
    const toFieldEl = (code: string, sortOrder: number): LayoutElement | null => {
      const f = fields.find((x) => x.code === code);
      if (!f) return null;
      if (f.fieldType === 'REPEAT_GROUP') {
        const children = repeatChildrenOf(fields, f.code)
          .map((cf, idx) => ({
            elementType: 'FIELD' as const,
            sortOrder: (idx + 1) * 10,
            field: toApiField(stripDesignerMeta(cf)),
            children: [] as LayoutElement[],
          }));
        const cfg = f.fieldConfig || {};
        return {
          elementType: 'REPEAT_GROUP',
          sortOrder,
          config: {
            title: cfg.title || f.name,
            variableName: cfg.variableName || f.code,
            minItems: cfg.minItems ?? 0,
            maxItems: cfg.maxItems ?? -1,
            collapsed: cfg.collapsed,
            ...(cfg.compose ? { compose: cfg.compose } : {}),
          },
          children,
        };
      }
      return {
        elementType: 'FIELD',
        sortOrder,
        field: toApiField(stripDesignerMeta(f)),
        children: [],
      };
    };
    /** 画布块 → 布局元素（根级 sortOrder 为序；行内嵌套为 `(列号+1)*1000+序位` 列位编码）。 */
    const toBlockEl = (b: CanvasBlock, sortOrder: number, rowLabel = 'Row'): LayoutElement | null => {
      if (b.kind === 'DIVIDER') {
        return {
          elementType: 'LINE_DIVIDER',
          sortOrder,
          // 后端 walk() 对非 FIELD 元素同样校验 code/variableName（FIELD_CODE_INVALID）。
          config: { variableName: `divider_${++dividerSeq}` },
          children: [],
        };
      }
      if (b.kind === 'TABS') {
        const seq = ++tabsSeq;
        return {
          elementType: 'TAB',
          sortOrder,
          config: {
            title: `Tabs ${seq}`,
            // 后端 walk() 对非 FIELD 元素同样校验 code/variableName（FIELD_CODE_INVALID）。
            variableName: `tabs_${seq}`,
          },
          children: b.tabs.map((tab, tabIndex) => ({
            elementType: 'FORM_SECTION',
            sortOrder: tabIndex * 100 + 1,
            config: {
              title: tab.title,
              tabId: tab.id,
              // 页签页同样需要合法 variableName（walk() 逐元素校验）。
              variableName: `tab_${seq}_${tabIndex + 1}`,
            },
            children: tab.rows.map((row, rowIndex) => toRowSection(row, `${tab.title} / Row ${rowIndex + 1}`)),
          })),
        };
      }
      return { ...toRowSection(b.row, rowLabel), sortOrder };
    };
    const toRowSection = (row: CanvasRow, fallbackTitle: string, sortOrder?: number): LayoutElement => ({
      elementType: 'FORM_SECTION',
      sortOrder: sortOrder ?? order++,
      config: {
        title: row.title || fallbackTitle,
        variableName: row.variableName || row.id,
        collapsed: false,
        columns: row.columns.length,
        columnSpans: row.columns.map((c) => c.span),
      },
      children: row.columns.flatMap((col, colIndex) => {
        const base = (colIndex + 1) * 1000;
        return [
          ...col.fieldCodes
            .map((code, idx) => toFieldEl(code, base + idx))
            .filter((x): x is LayoutElement => Boolean(x)),
          // 单元格内嵌结构块（页签组/分隔线）：列位编码与字段同命名空间（字段在前）。
          ...(col.blocks || [])
            .map((b, bi) => toBlockEl(b, base + col.fieldCodes.length + bi))
            .filter((x): x is LayoutElement => Boolean(x)),
        ];
      }),
    });

    return blocks.flatMap((block, blockIndex) => {
      const el = toBlockEl(block, order++, `Row ${blockIndex + 1}`);
      return el ? [el] : [];
    });
  }, [fields, blocks]);

  const save = async () => {
    try {
      await form.validateFields();
    } catch (err) {
      // 校验失败时把用户带到出错位置：模型属性字段 → 展开面板；模板页签字段 → 切换页签。
      const names = ((err as { errorFields?: { name?: string | (string | number)[] }[] }).errorFields ?? []).flatMap(
        (f) => (Array.isArray(f.name) ? f.name.map(String) : f.name ? [String(f.name)] : []),
      );
      if (names.some((n) => TEMPLATE_FIELDS.has(n))) setActiveTab('template');
      if (names.some((n) => !TEMPLATE_FIELDS.has(n))) {
        setPanelKeys((keys) => (keys.includes('model') ? keys : [...keys, 'model']));
      }
      return;
    }
    // getFieldsValue(true) keeps values from fields that may be unmounted (collapsed panels / inactive tabs).
    const v = form.getFieldsValue(true);
    if (!String(v.code || '').trim() || !String(v.name || '').trim()) {
      setPanelKeys((keys) => (keys.includes('model') ? keys : [...keys, 'model']));
      message.error(t('请填写模型编码与名称（展开「模型属性」面板）'));
      return;
    }
    if (['PAGE', 'SHARED'].includes(String(v.objectType || '')) && !String(v.displayTemplate || '').trim()) {
      // 「模板」页签未挂载时 required 规则不会触发，这里兜底并把用户带到该页签。
      setActiveTab('template');
      message.error(t('PAGE/SHARED 类型必须配置显示模板（请在「模板」页签填写）'));
      return;
    }
    if (errorCount) return message.error(t('请先修复 {n} 个校验问题', { n: errorCount }));
    const body = {
      ...v,
      templateType: v.objectType === 'COMPONENT' ? 'COMPONENT' : v.objectType === 'SHARED' ? 'PAGE' : v.objectType === 'MEDIA' ? 'MEDIA' : 'PAGE',
      layout,
    };
    let saved: ContentType;
    if (current) saved = await modelsApi.update(siteId!, current.id, body);
    else saved = await modelsApi.create(siteId!, body);
    if (v.config) {
      try {
        await modelsApi.updateConfig(siteId!, saved.id, v.config);
      } catch {
        /* config may be optional on create path */
      }
    }
    for (const event of ['CREATE', 'UPDATE', 'COPY', 'DELETE', 'WEBHOOK'] as const) {
      const script = lifecycle[event];
      if (script?.trim()) {
        try {
          await modelsApi.saveLifecycle(siteId!, saved.id, event, {
            scriptContent: script,
            scriptLang: 'GROOVY',
            listenEvents: lifecycleListen[event] || '',
          });
        } catch (err) {
          message.warning(`${event} 生命周期脚本保存失败`);
        }
      }
    }
    message.success(t('模型草稿已保存'));
    setDirty(false);
    setCurrent(saved);
    void load();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 拖拽期间画布可能滚动（长表单），droppable 矩形缓存会过期 → 拖拽中持续重测，
  // 否则字段/行会落到缓存的旧位置对应的错误单元格（2026-09-22 缺陷）。
  const measuringConfig = useMemo(() => ({ droppable: { strategy: MeasuringStrategy.Always } }), []);

  const dragStart = (e: DragStartEvent) => {
    const activeId = String(e.active.id);
    if (activeId.startsWith('block:') || activeId.startsWith('tabrow:')) {
      setActiveLabel(t('移动行'));
      return;
    }
    const d = e.active.data.current;
    setActiveLabel(
      d?.source === 'palette'
        ? PALETTE.find((x) => x.type === d.type)?.name || d.type
        : fields.find((f) => f.code === d?.code)?.name || '',
    );
  };

  const removeFromCells = useCallback((targetCode: string, src: CanvasBlock[]) => {
    return mapCellsInBlocks(src, (c) => ({
      ...c,
      fieldCodes: c.fieldCodes.filter((code) => code !== targetCode),
    }));
  }, []);

  const placeCodeToCell = useCallback(
    (src: CanvasBlock[], code: string, targetCellId: string, beforeCode?: string) =>
      mapCellsInBlocks(src, (c) => {
        if (c.id !== targetCellId) return c;
        const base = [...c.fieldCodes];
        if (beforeCode) {
          const at = base.indexOf(beforeCode);
          if (at >= 0) {
            base.splice(at, 0, code);
            return { ...c, fieldCodes: base };
          }
        }
        return { ...c, fieldCodes: [...base, code] };
      }),
    [],
  );

  const dragEnd = (e: DragEndEvent) => {
    setActiveLabel('');
    const d = e.active.data.current;
    const activeId = String(e.active.id);
    if (!e.over) return;
    const over = String(e.over.id);

    if (activeId.startsWith('block:')) {
      const from = blocks.findIndex((b) => `block:${b.id}` === activeId);
      const to = resolveBlockDropIndex(blocks, over);
      if (from >= 0 && to >= 0 && from !== to) {
        setBlocks(arrayMove(blocks, from, to));
        setDirty(true);
      }
      return;
    }

    if (activeId.startsWith('tabrow:')) {
      const activeKey = activeId.slice('tabrow:'.length);
      const activeSep = activeKey.indexOf(':');
      if (activeSep <= 0) return;
      const tabId = activeKey.slice(0, activeSep);
      const rowId = activeKey.slice(activeSep + 1);

      // 落点为外部列/芯片/行：整行搬移（保留列结构）——同页签即行重排，
      // 目标在其他页签则移入该页签，否则提为根级行块。
      if (over.startsWith('cell:') || over.startsWith('chip:') || over.startsWith('row:')) {
        // 目标行就是源行自身（页签内行也可能通过 cell 命中自己）→ 忽略。
        const overRowId =
          over.startsWith('row:')
            ? over.slice(4)
            : over.startsWith('cell:')
              ? findRowIdByCellId(blocks, over.slice(5))
              : findRowIdByCellId(blocks, over.split(':')[1] || '');
        if (overRowId && overRowId === rowId) return;
        setBlocks((prev) => {
          const { blocks: without, row } = takeRowOutOfTabs(prev, tabId, rowId);
          if (!row) return prev;
          return placeRowNear(without, row, overRowId || null);
        });
        setDirty(true);
        return;
      }

      // 页签内排序（tabrow: 落点）。
      let moved = false;
      setBlocks((prev) =>
        mapTabsInBlocks(prev, (t) => {
          if (t.id !== tabId) return t;
          const from = t.rows.findIndex((r) => r.id === rowId);
          const to = resolveTabRowDropIndex(t.rows, t.id, over);
          if (from < 0 || to < 0 || from === to) return t;
          moved = true;
          return { ...t, rows: arrayMove(t.rows, from, to) };
        }),
      );
      if (moved) setDirty(true);
      return;
    }

    if (d?.source === 'palette' && d.type === 'COLUMN') {
      let rowId: string | null = null;
      if (over.startsWith('row:')) rowId = over.slice(4);
      else if (over.startsWith('cell:')) rowId = findRowIdByCellId(blocks, over.slice(5));
      else if (over.startsWith('chip:')) rowId = findRowIdByCellId(blocks, over.split(':')[1] || '');
      if (rowId) {
        setBlocks((prev) => addColumnToRow(prev, rowId));
        setDirty(true);
      }
      return;
    }

    // 结构控件（表单分区/标签页/分隔线）。
    if (d?.source === 'palette' && (d.type === 'FORM_SECTION' || d.type === 'TAB' || d.type === 'DIVIDER')) {
      const targetCellId = over.startsWith('cell:')
        ? over.slice(5)
        : over.startsWith('chip:')
          ? (over.split(':')[1] || '')
          : '';
      setBlocks((prev) => {
        const makeBlock = (): CanvasBlock => {
          if (d.type === 'TAB') {
            return {
              id: uid('blk'),
              kind: 'TABS',
              tabs: [{ id: uid('tab'), title: `Tab ${prev.filter((b) => b.kind === 'TABS').length + 1}`, rows: [makeRow()] }],
              collapsedTabIds: [],
            };
          }
          if (d.type === 'DIVIDER') return { id: uid('blk'), kind: 'DIVIDER' };
          return { id: uid('blk'), kind: 'ROW', row: makeRow() };
        };
        // 标签页/分隔线落到列格 → 嵌入该单元格（2026-09-22 需求）；
        // 表单分区是行容器，仍作画布块插入（按落点解析位置）。
        if (targetCellId && (d.type === 'TAB' || d.type === 'DIVIDER')) {
          return pushBlockToCell(prev, targetCellId, makeBlock());
        }
        const blockIdx = resolveStructuralInsertIndex(prev, over);
        const next = [...prev];
        next.splice(blockIdx < 0 ? next.length : blockIdx, 0, makeBlock());
        return next;
      });
      setDirty(true);
      return;
    }

    let cellId = '';
    let beforeCode: string | undefined;
    if (over.startsWith('cell:')) {
      cellId = over.slice(5);
    } else if (over.startsWith('chip:')) {
      const parts = over.split(':');
      cellId = parts[1] || '';
      beforeCode = parts[2];
    }
    if (!cellId) return;

    if (d?.source === 'palette') {
      if (STRUCTURAL.has(d.type) && d.type !== 'REPEAT_GROUP') return;
      setInspector({
        mode: 'create',
        draft: fresh(d.type, fields.length),
        cellId,
        beforeCode,
      });
      setActiveTab('design');
    } else if (d?.source === 'canvas' && d?.code) {
      setBlocks((prev) => {
        const removed = removeFromCells(String(d.code), prev);
        return placeCodeToCell(removed, String(d.code), cellId, beforeCode);
      });
      setSelectedCode(String(d.code));
      setDirty(true);
    }
  };

  const patchInspectorDraft = (all: Partial<FieldDef>) => {
    setInspector((prev) => (prev ? { ...prev, draft: mergeInspectorDraft(prev.draft, all) } : prev));
  };

  const openFieldInspector = (code: string, returnToRepeatCode?: string) => {
    const field = fields.find((f) => f.code === code);
    if (!field) return;
    setSelectedCode(code);
    setInspector({
      mode: 'edit',
      draft: cloneField(field),
      originalCode: code,
      returnToRepeatCode,
    });
  };

  const openRepeatChildCreate = (parentRepeatCode: string, fieldType: string) => {
    const draft = fresh(fieldType, fields.length);
    draft.fieldConfig = {
      ...(draft.fieldConfig || {}),
      [REPEAT_PARENT_KEY]: parentRepeatCode,
    };
    setInspector({
      mode: 'create',
      draft,
      cellId: '',
      parentRepeatCode,
      returnToRepeatCode: parentRepeatCode,
    });
  };

  const closeInspector = () => setInspector(null);

  const saveInspector = () => {
    if (!inspector) return;
    const errors = validateFieldDef(inspector.draft, {
      isDuplicate: isCodeTaken(
        inspector.draft.code,
        fields,
        inspector.mode === 'edit' ? inspector.originalCode : undefined,
      ),
    });
    if (errors.length) {
      message.error(errors[0]);
      return;
    }
    if (inspector.mode === 'create') {
      const nf = cloneField(inspector.draft);
      if (inspector.parentRepeatCode) {
        nf.fieldConfig = {
          ...(nf.fieldConfig || {}),
          [REPEAT_PARENT_KEY]: inspector.parentRepeatCode,
        };
        const next = [...fields, nf];
        commit(next);
        setSelectedCode(inspector.parentRepeatCode);
        const parent = next.find((f) => f.code === inspector.parentRepeatCode);
        if (parent) {
          setInspector({
            mode: 'edit',
            draft: cloneField(parent),
            originalCode: inspector.parentRepeatCode,
          });
        } else {
          setInspector(null);
        }
        return;
      }
      commit([...fields, nf]);
      setBlocks((prev) => placeCodeToCell(prev, nf.code, inspector.cellId, inspector.beforeCode));
      setSelectedCode(nf.code);
      setInspector(null);
      return;
    }
    const { draft, originalCode, returnToRepeatCode } = inspector;
    const rename =
      draft.code !== originalCode ? { from: originalCode, to: draft.code } : undefined;
    const next = fields.map((f) => {
      if (f.code === originalCode) return cloneField(draft);
      if (f.fieldConfig?.[REPEAT_PARENT_KEY] === originalCode) {
        return {
          ...f,
          fieldConfig: { ...(f.fieldConfig || {}), [REPEAT_PARENT_KEY]: draft.code },
        };
      }
      return f;
    });
    commit(next, rename);
    if (returnToRepeatCode) {
      const parent = next.find((f) => f.code === returnToRepeatCode);
      if (parent) {
        setSelectedCode(returnToRepeatCode);
        setInspector({
          mode: 'edit',
          draft: cloneField(parent),
          originalCode: returnToRepeatCode,
        });
        return;
      }
    }
    setSelectedCode(draft.code);
    setInspector(null);
  };

  const removeField = (code: string) => {
    const toRemove = new Set<string>([code]);
    for (const f of fields) {
      if (f.fieldConfig?.[REPEAT_PARENT_KEY] === code) toRemove.add(f.code);
    }
    commit(fields.filter((f) => !toRemove.has(f.code)));
    if (selectedCode && toRemove.has(selectedCode)) setSelectedCode(null);
    if (inspector?.mode === 'edit' && toRemove.has(inspector.originalCode)) setInspector(null);
  };

  const removeRepeatChild = (parentCode: string, childCode: string) => {
    commit(fields.filter((f) => f.code !== childCode));
    if (selectedCode === childCode) setSelectedCode(parentCode);
    if (inspector?.mode === 'edit' && inspector.originalCode === childCode) {
      const parent = fields.find((f) => f.code === parentCode);
      if (parent) {
        setInspector({ mode: 'edit', draft: cloneField(parent), originalCode: parentCode });
      }
    }
  };

  const reorderRepeatChild = (parentCode: string, childCode: string, dir: -1 | 1) => {
    const kids = repeatChildrenOf(fields, parentCode);
    const idx = kids.findIndex((k) => k.code === childCode);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= kids.length) return;
    const a = kids[idx].code;
    const b = kids[j].code;
    const ia = fields.findIndex((f) => f.code === a);
    const ib = fields.findIndex((f) => f.code === b);
    if (ia < 0 || ib < 0) return;
    const next = [...fields];
    [next[ia], next[ib]] = [next[ib], next[ia]];
    commit(normalize(next));
  };

  const watchedObjectType = Form.useWatch('objectType', form);
  const watchedQuick = Form.useWatch('quickCreate', form);

  const filtered = list.filter((row) => {
    if (filterName && !`${row.name}${row.code}`.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterType && (row.objectType || row.templateType) !== filterType) return false;
    if (filterStatus && row.status !== filterStatus) return false;
    return true;
  });

  const paletteGroups = ['结构控件', '基础字段', '引用字段', '补充字段'].map((group) => ({
    key: group,
    label: (
      <Space>
        {group === '基础字段' ? <FormOutlined /> : group === '引用字段' ? <LinkOutlined /> : group === '补充字段' ? <DatabaseOutlined /> : <BlockOutlined />}
        {t(group)}
      </Space>
    ),
    children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        {PALETTE.filter(
          (x) =>
            x.group === group &&
            `${x.name}${x.type}${x.description}`.toLowerCase().includes(search.toLowerCase()),
        ).map((x) => (
          <PaletteCard key={x.type} item={x} />
        ))}
      </Space>
    ),
  }));

  /**
   * 画布字段索引：属性检查器编辑中的草稿即时叠加（显示名称/组标题边改边同步到画布卡片，
   * 点「取消」即回退；「保存」时由 commit 写回正式 fields）。
   */
  const fieldsByCode = useMemo(() => {
    const map = new Map(fields.map((f) => [f.code, f]));
    if (inspector?.mode === 'edit') {
      const live = map.get(inspector.originalCode);
      if (live) {
        map.set(inspector.originalCode, {
          ...live,
          ...inspector.draft,
          fieldConfig: { ...live.fieldConfig, ...inspector.draft.fieldConfig },
        });
      }
    }
    return map;
  }, [fields, inspector]);
  const rowBlockCount = useMemo(() => blocks.filter((b) => b.kind === 'ROW').length, [blocks]);
  const rowTemplate = (cols: CanvasCell[]) => {
    const parts = cols.map((c) => `minmax(140px, ${Math.max(1, c.span)}fr)`);
    return { gridTemplateColumns: parts.join(' ') };
  };
  const addTabBlock = useCallback(() => {
    setBlocks((prev) => [
      ...prev,
      {
        id: uid('blk'),
        kind: 'TABS' as const,
        tabs: [{ id: uid('tab'), title: 'Tab 1', rows: [makeRow()] }],
        collapsedTabIds: [],
      },
    ]);
    setDirty(true);
  }, []);

  const addRowByPicker = (cols: number, ratio?: 1 | 3) => {
    const row = ratio !== undefined ? makeRowWithRatio(ratio) : makeRowWithCols(cols);
    if (!rowPicker.blockId) {
      setBlocks((prev) => [...prev, { id: uid('blk'), kind: 'ROW', row }]);
    } else {
      setBlocks((prev) =>
        mapBlockById(prev, rowPicker.blockId!, (b) =>
          b.kind !== 'TABS'
            ? b
            : {
                ...b,
                tabs: b.tabs.map((t) =>
                  t.id !== rowPicker.tabId ? t : { ...t, rows: [...t.rows, row] },
                ),
              },
        ),
      );
    }
    setRowPicker({ open: false });
    setDirty(true);
  };
  /**
   * 画布块渲染（递归：单元格可内嵌页签组/分隔线块，2026-09-22）。
   * nested=单元格内嵌块 —— 不参与块级排序（无 block: 锚点）。
   */
  const renderBlocks = (list: CanvasBlock[], nested: boolean): ReactNode =>
    list.map((block) => {
      const deleteBlock = () => {
        setBlocks((prev) => removeBlockById(prev, block.id));
        setDirty(true);
      };
      const updateBlock = (fn: (b: CanvasBlock) => CanvasBlock) => {
        setBlocks((prev) => mapBlockById(prev, block.id, fn));
        setDirty(true);
      };
      /** 行壳 + 网格 + 单元格（列格内嵌块经 renderNested 递归渲染）。 */
      const rowShellFor = (
        row: CanvasRow,
        key: string,
        shellId: string,
        sortable: boolean,
        onDelete: () => void,
      ) => (
        <SortableRowShell
          key={key}
          id={shellId}
          sortable={sortable}
          sectionLabel={formatSectionLabel(row)}
          showDelete={isRowEmpty(row)}
          onDelete={onDelete}
        >
          <CanvasRowDrop rowId={row.id} style={rowTemplate(row.columns)}>
            {row.columns.map((cell) => (
              <CanvasCellView
                key={cell.id}
                cell={cell}
                fieldsByCode={fieldsByCode}
                selectedCode={selectedCode}
                onSelectCode={openFieldInspector}
                onDeleteField={removeField}
                canDeleteColumn={row.columns.length > 1}
                onDeleteColumn={() => {
                  setBlocks((prev) => removeColumnFromBlocks(prev, row.id, cell.id));
                  setDirty(true);
                }}
                renderNested={(bs) => renderBlocks(bs, true)}
              />
            ))}
          </CanvasRowDrop>
        </SortableRowShell>
      );

      if (block.kind === 'ROW') {
        const shell = rowShellFor(
          block.row,
          block.id,
          nested ? `nestrow:${block.row.id}` : `block:${block.id}`,
          nested ? false : rowBlockCount > 1,
          deleteBlock,
        );
        return nested ? (
          <div key={block.id} className="model-nested-block">
            {shell}
          </div>
        ) : (
          shell
        );
      }

      const body =
        block.kind === 'DIVIDER' ? (
          <div className="model-canvas-divider">
            <span className="model-canvas-divider-label">
              <MinusCircleOutlined /> {t('分隔线')}
            </span>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              className="model-canvas-divider-delete"
              onClick={deleteBlock}
            />
          </div>
        ) : (
          <div className="model-tab-divider-group" data-block-id={block.id}>
            {block.tabs.map((tab) => {
              const collapsed = block.collapsedTabIds.includes(tab.id);
              return (
                <div key={tab.id} className="model-tab-divider-section">
                  <div
                    className={`model-tab-divider${collapsed ? ' model-tab-divider-collapsed' : ''}`}
                  >
                    <Input
                      className="model-tab-divider-title"
                      size="small"
                      variant="borderless"
                      value={tab.title}
                      placeholder={t('页签标题')}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateBlock((b) =>
                          b.kind !== 'TABS'
                            ? b
                            : {
                                ...b,
                                tabs: b.tabs.map((t) =>
                                  t.id === tab.id ? { ...t, title: e.target.value || 'Tab' } : t,
                                ),
                              },
                        )
                      }
                    />
                    <Space.Compact className="model-tab-divider-actions">
                      <Tooltip title={collapsed ? t('展开页签内容') : t('收起页签内容')}>
                        <Button
                          size="small"
                          type="text"
                          icon={collapsed ? <RightOutlined /> : <UpOutlined />}
                          onClick={() =>
                            updateBlock((b) =>
                              b.kind !== 'TABS'
                                ? b
                                : {
                                    ...b,
                                    collapsedTabIds: collapsed
                                      ? b.collapsedTabIds.filter((x) => x !== tab.id)
                                      : [...b.collapsedTabIds, tab.id],
                                  },
                            )
                          }
                        />
                      </Tooltip>
                      <Tooltip title={t('+ 页签')}>
                        <Button
                          size="small"
                          type="text"
                          icon={<PlusOutlined />}
                          onClick={() =>
                            updateBlock((b) =>
                              b.kind !== 'TABS'
                                ? b
                                : {
                                    ...b,
                                    tabs: [
                                      ...b.tabs,
                                      {
                                        id: uid('tab'),
                                        title: `Tab ${b.tabs.length + 1}`,
                                        rows: [makeRow()],
                                      },
                                    ],
                                  },
                            )
                          }
                        />
                      </Tooltip>
                      <Tooltip title={t('删除当前页签')}>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          // 单页签组：删除唯一页签时整块移除，不做禁用。
                          onClick={() => {
                            setBlocks((prev) => removeTabFromBlock(prev, block.id, tab.id));
                            setDirty(true);
                          }}
                        />
                      </Tooltip>
                    </Space.Compact>
                  </div>
                  {!collapsed && (
                    <div className="model-tab-divider-body">
                      <SortableContext
                        items={tab.rows.map((r) => `tabrow:${tab.id}:${r.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {tab.rows.map((row) =>
                          rowShellFor(row, row.id, `tabrow:${tab.id}:${row.id}`, true, () => {
                            updateBlock((b) =>
                              b.kind !== 'TABS'
                                ? b
                                : {
                                    ...b,
                                    tabs: b.tabs.map((t) =>
                                      t.id !== tab.id
                                        ? t
                                        : { ...t, rows: t.rows.filter((r) => r.id !== row.id) },
                                    ),
                                  },
                            );
                          }),
                        )}
                      </SortableContext>
                      <Button
                        size="small"
                        onClick={() => setRowPicker({ open: true, blockId: block.id, tabId: tab.id })}
                      >
                        {t('+ 新增行')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      return nested ? (
        <div key={block.id} className="model-nested-block">
          {body}
        </div>
      ) : (
        <SortableBlockAnchor key={block.id} id={`block:${block.id}`}>
          {body}
        </SortableBlockAnchor>
      );
    });

  const designPane = (
    <DndContext
      sensors={sensors}
      collisionDetection={rowSortCollisionDetection}
      measuring={measuringConfig}
      onDragStart={dragStart}
      onDragEnd={dragEnd}
      onDragCancel={() => {
        setActiveLabel('');
      }}
    >
      <div className="model-designer-dnd">
      <div className="model-designer-grid">
        <Card size="small" title={t('字段面板')} className="model-palette-panel">
          <Input.Search
            size="small"
            allowClear
            placeholder={t('搜索名称、类型或描述')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <Collapse size="small" defaultActiveKey={['结构控件', '基础字段']} items={paletteGroups} />
        </Card>
        <Card size="small" title={t('设计画布 · {n} 个字段', { n: fields.length })} className="model-canvas-panel">
          <DropCanvas>
            <SortableContext items={blocks.map((b) => `block:${b.id}`)} strategy={verticalListSortingStrategy}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {renderBlocks(blocks, false)}
                <div className="model-bottom-actions">
                  <Dropdown.Button
                    type="primary"
                    className="model-add-split-btn"
                    icon={<DownOutlined />}
                    onClick={() => setRowPicker({ open: true })}
                    menu={{
                      items: [
                        { key: 'row', label: t('添加行'), icon: <PlusOutlined /> },
                        { key: 'tab', label: t('添加页签'), icon: <BlockOutlined /> },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'row') setRowPicker({ open: true });
                        else if (key === 'tab') addTabBlock();
                      },
                    }}
                    buttonsRender={([mainButton, dropdownButton]) => [
                      isValidElement(mainButton)
                        ? cloneElement(mainButton as ReactElement<{ icon?: ReactNode }>, {
                            icon: <PlusOutlined />,
                          })
                        : mainButton,
                      dropdownButton,
                    ]}
                  >
                    
                    {t('添加行')}
                  </Dropdown.Button>
                </div>
              </Space>
            </SortableContext>
          </DropCanvas>
        </Card>
      </div>
      </div>
      {activeLabel ? (
        <Card size="small" style={{ position: 'fixed', pointerEvents: 'none', opacity: 0.85, zIndex: 2000, left: 24, bottom: 24 }}>
          <HolderOutlined /> {activeLabel}
        </Card>
      ) : null}
      <Modal
        open={rowPicker.open}
        onCancel={() => setRowPicker({ open: false })}
        footer={null}
        title={t('选择新增行的列布局')}
        width={680}
        centered
      >
        <RowLayoutPicker onPick={addRowByPicker} />
      </Modal>
      <Modal
        className="model-inspector-modal"
        open={Boolean(inspector)}
        title={
          inspector?.mode === 'create'
            ? inspector.parentRepeatCode
              ? t('新增组内字段 · {name}', { name: t(PALETTE.find((x) => x.type === inspector.draft.fieldType)?.name || inspector.draft.fieldType) })
              : t('配置新字段 · {name}', { name: t(PALETTE.find((x) => x.type === inspector.draft.fieldType)?.name || inspector.draft.fieldType) })
            : inspector?.returnToRepeatCode
              ? t('编辑组内字段 · {name}', { name: inspector?.draft.name || '' })
              : t('编辑字段 · {name}', { name: inspector?.draft.name || '' })
        }
        onCancel={() => {
          if (inspector?.returnToRepeatCode) {
            const parent = fields.find((f) => f.code === inspector.returnToRepeatCode);
            if (parent) {
              setSelectedCode(parent.code);
              setInspector({ mode: 'edit', draft: cloneField(parent), originalCode: parent.code });
              return;
            }
          }
          closeInspector();
        }}
        onOk={saveInspector}
        okText={t('保存')}
        cancelText={inspector?.returnToRepeatCode ? t('返回重复组') : t('取消')}
        okButtonProps={{ disabled: inspectorErrors.length > 0 }}
        width={720}
        centered
        destroyOnClose
        zIndex={1100}
      >
        {inspector && (
          <Inspector
            field={inspector.draft}
            allFields={fields}
            repeatLookupCode={
              inspector.mode === 'edit' && inspector.draft.fieldType === 'REPEAT_GROUP'
                ? inspector.originalCode
                : undefined
            }
            canEditRepeatChildren={
              inspector.mode === 'edit' && inspector.draft.fieldType === 'REPEAT_GROUP'
            }
            errors={inspectorErrors}
            onChange={patchInspectorDraft}
            onSuggestName={() =>
              patchInspectorDraft({ code: suggestCode(inspector.draft.name, inspector.draft.fieldType) })
            }
            onEditRepeatChild={(childCode) => {
              if (inspector.mode !== 'edit') return;
              const parentCode = inspector.originalCode;
              if (inspector.draft.fieldType === 'REPEAT_GROUP') {
                const draft = cloneField(inspector.draft);
                const rename =
                  draft.code !== parentCode ? { from: parentCode, to: draft.code } : undefined;
                const next = fields.map((f) => {
                  if (f.code === parentCode) return draft;
                  if (f.fieldConfig?.[REPEAT_PARENT_KEY] === parentCode) {
                    return {
                      ...f,
                      fieldConfig: { ...(f.fieldConfig || {}), [REPEAT_PARENT_KEY]: draft.code },
                    };
                  }
                  return f;
                });
                commit(next, rename);
                const child = next.find((f) => f.code === childCode);
                if (!child) return;
                setSelectedCode(childCode);
                setInspector({
                  mode: 'edit',
                  draft: cloneField(child),
                  originalCode: childCode,
                  returnToRepeatCode: draft.code,
                });
                return;
              }
              openFieldInspector(childCode, parentCode);
            }}
            onAddRepeatChild={(fieldType) => {
              if (inspector.mode !== 'edit') return;
              const parentCode = inspector.originalCode;
              if (inspector.draft.fieldType === 'REPEAT_GROUP') {
                const draft = cloneField(inspector.draft);
                const rename =
                  draft.code !== parentCode ? { from: parentCode, to: draft.code } : undefined;
                const next = fields.map((f) => {
                  if (f.code === parentCode) return draft;
                  if (f.fieldConfig?.[REPEAT_PARENT_KEY] === parentCode) {
                    return {
                      ...f,
                      fieldConfig: { ...(f.fieldConfig || {}), [REPEAT_PARENT_KEY]: draft.code },
                    };
                  }
                  return f;
                });
                commit(next, rename);
                const childDraft = fresh(fieldType, next.length);
                childDraft.fieldConfig = {
                  ...(childDraft.fieldConfig || {}),
                  [REPEAT_PARENT_KEY]: draft.code,
                };
                setInspector({
                  mode: 'create',
                  draft: childDraft,
                  cellId: '',
                  parentRepeatCode: draft.code,
                  returnToRepeatCode: draft.code,
                });
                return;
              }
              openRepeatChildCreate(parentCode, fieldType);
            }}
            onRemoveRepeatChild={(childCode) => {
              const parentCode =
                inspector.mode === 'edit' ? inspector.originalCode : inspector.draft.code;
              removeRepeatChild(parentCode, childCode);
            }}
            onReorderRepeatChild={(childCode, dir) => {
              const parentCode =
                inspector.mode === 'edit' ? inspector.originalCode : inspector.draft.code;
              reorderRepeatChild(parentCode, childCode, dir);
            }}
          />
        )}
      </Modal>
    </DndContext>
  );

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          
          {t('内容类型')}
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void begin()}>
          
          {t('新建模型')}
        </Button>
      </Space>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('按名称或编码筛选')}
            style={{ width: 220 }}
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <Select
            allowClear
            placeholder={t('对象类型')}
            style={{ width: 140 }}
            value={filterType}
            onChange={setFilterType}
            options={['PAGE', 'COMPONENT', 'SHARED', 'SECTION', 'MEDIA'].map((value) => ({ value }))}
          />
          <Select
            allowClear
            placeholder={t('状态')}
            style={{ width: 140 }}
            value={filterStatus}
            onChange={setFilterStatus}
            options={['DRAFT', 'PUBLISHED'].map((value) => ({ value }))}
          />
        </Space>
      </Card>

      <Table
        rowKey="id"
        dataSource={filtered}
        scroll={{ x: 1200 }}
        locale={{
          emptyText: (
            <Empty image={<DatabaseOutlined style={{ fontSize: 36 }} />} description={t('暂无内容类型')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void begin()}>
                
                {t('新建模型')}
              </Button>
            </Empty>
          ),
        }}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: t('预览'),
            width: 64,
            render: (_, r) =>
              r.previewImage ? (
                <img src={r.previewImage} alt="" width={48} height={48} style={{ objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 4,
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DatabaseOutlined />
                </div>
              ),
          },
          {
            title: t('编码'),
            dataIndex: 'code',
            width: 120,
            render: (v) => <Typography.Text code copyable>{v}</Typography.Text>,
          },
          {
            title: t('名称'),
            dataIndex: 'name',
            width: 160,
            render: (v) => <Typography.Text strong>{v}</Typography.Text>,
          },
          {
            title: t('对象类型'),
            width: 110,
            render: (_, r) => {
              const t = r.objectType || r.templateType;
              return <Tag color={OBJECT_TYPE_COLOR[t] || 'default'}>{t}</Tag>;
            },
          },
          {
            title: t('版本'),
            width: 110,
            render: (_, r) => (
              <Space>
                <span>{r.version}</span>
                <Tag color={r.status === 'PUBLISHED' ? 'green' : r.status === 'DEPRECATED' ? 'default' : 'orange'}>
                  {r.status === 'DEPRECATED' ? t('已废弃') : r.status}
                </Tag>
              </Space>
            ),
          },
          {
            title: t('快速创建'),
            width: 90,
            render: (_, r) =>
              r.quickCreate ? (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              ) : (
                <MinusCircleOutlined style={{ color: '#bfbfbf' }} />
              ),
          },
          {
            title: <div style={{ textAlign: 'center' }}>{t('操作')}</div>,
            width: 280,
            fixed: 'right',
            render: (_, r) => {
              const deprecated = r.status === 'DEPRECATED';
              return (
              <Space size={0}>
                {!deprecated && (
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void edit(r)}>
                  {t('设计')}
                </Button>
                )}
                <Button
                  type="link"
                  size="small"
                  icon={<SendOutlined />}
                  disabled={r.status === 'PUBLISHED' || deprecated}
                  onClick={async () => {
                    // 之前已有发布版本（本次是“新版本首发”）：提示存量内容迁移
                    if (r.publishedVersion) {
                      Modal.confirm({
                        title: t('发布新版本并迁移存量内容？'),
                        width: 520,
                        okText: t('发布并迁移'),
                        cancelText: t('取消'),
                        content: (
                          <>
                            <p>{t('发布后同编码的旧版本将自动废弃，存量内容将迁移到新版本：')}</p>
                            <ul style={{ paddingLeft: 20, margin: 0 }}>
                              <li>{t('内容项将绑定到新版本，编辑与交付使用新字段结构')}</li>
                              <li>{t('新增字段若声明了默认值，将自动回填到存量内容')}</li>
                              <li>{t('已发布内容立即以迁移后的快照重新可见')}</li>
                            </ul>
                            <p style={{ marginBottom: 0, color: '#888' }}>
                              
                              {t('如需自定义字段重命名/回填规则，可通过 API 传入 migrationRules。')}
                            </p>
                          </>
                        ),
                        onOk: async () => {
                          await modelsApi.publish(siteId!, r.id);
                          message.success(t('已发布，存量内容已迁移'));
                          void load();
                        },
                      });
                    } else {
                      await modelsApi.publish(siteId!, r.id);
                      message.success(t('已发布'));
                      void load();
                    }
                  }}
                >
                  {t('发布')}
                </Button>
                {r.status === 'PUBLISHED' && (
                  <Button
                    type="link"
                    size="small"
                    icon={<PartitionOutlined />}
                    onClick={async () => {
                      await modelsApi.newVersion(siteId!, r.id);
                      message.success(t('已创建新版本草稿'));
                      void load();
                    }}
                  >
                    {t('新版本')}
                  </Button>
                )}
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'copy',
                        label: t('复制为新类型'),
                        icon: <PlusOutlined />,
                        onClick: () => {
                          Modal.confirm({
                            title: t('复制内容类型？'),
                            content: t('将以当前类型为模板创建新的草稿类型（不含生命周期脚本与配置）。'),
                            okText: t('复制'),
                            onOk: async () => {
                              const copy = await modelsApi.copy(siteId!, r.id, { name: `${r.name}（副本）` });
                              message.success(t('已复制'));
                              void load();
                              void edit(copy);
                            },
                          });
                        },
                      },
                      !deprecated && {
                        key: 'content-menu',
                        label: r.contentMenuEnabled ? t('从内容菜单移除') : t('添加到内容菜单'),
                        icon: <MenuOutlined />,
                        onClick: async () => {
                          await modelsApi.updateContentMenu(siteId!, r.id, {
                            enabled: !r.contentMenuEnabled,
                            label: r.name,
                            order: r.contentMenuOrder || 0,
                          });
                          message.success(r.contentMenuEnabled ? t('已从内容菜单移除') : t('已添加到内容菜单'));
                          window.dispatchEvent(new CustomEvent(CONTENT_MENU_CHANGED_EVENT));
                          void load();
                        },
                      },                      {
                        key: 'delete',
                        label: t('归档/删除'),
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: t('删除内容类型？'),
                            content: t('若存在引用将无法删除。'),
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              await modelsApi.remove(siteId!, r.id);
                              message.success(t('已删除'));
                              void load();
                            },
                          });
                        },
                      },
                    ].filter(Boolean) as never,
                  }}
                >
                  <Button type="link" size="small" icon={<EllipsisOutlined />} />
                </Dropdown>
              </Space>
              );
            },
          },
        ]}
      />

      <Modal
        className="model-designer-modal"
        wrapClassName="model-designer-modal-wrap"
        title={
          <Space wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>
              
              {t('模型设计器')}
            </Typography.Title>
            {dirty && <Tag color="orange">{t('未保存 *')}</Tag>}
            <Tag color={errorCount ? 'error' : 'success'}>{errorCount}  {t('个错误')}</Tag>
            {current && <Tag>{current.code}</Tag>}
          </Space>
        }
        open={open}
        onCancel={close}
        footer={null}
        width="100vw"
        style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
        styles={{ body: { paddingTop: 8 } }}
        destroyOnClose
        keyboard={false}
        maskClosable={false}
        centered={false}
      >
        <div className="model-designer-shell">
        <div className="model-designer-chrome">
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
          <Space wrap>
            <Tooltip title={t('撤销 Ctrl+Z')}>
              <Button icon={<UndoOutlined />} disabled={!history.length} onClick={undo} />
            </Tooltip>
            <Tooltip title={t('重做 Ctrl+Y')}>
              <Button icon={<RedoOutlined />} disabled={!future.length} onClick={redo} />
            </Tooltip>
            <Segmented
              value={activeTab === 'preview' ? 'preview' : 'design'}
              onChange={(v) => setActiveTab(String(v))}
              options={[
                { label: t('设计'), value: 'design', icon: <EditOutlined /> },
                { label: t('预览'), value: 'preview', icon: <EyeOutlined /> },
              ]}
            />
            <Checkbox checked={compact} onChange={(e) => setCompact(e.target.checked)}>
              
              {t('紧凑画布')}
            </Checkbox>
          </Space>
          <Space>
            <Button onClick={close}>{t('关闭')}</Button>
            <Button type="primary" icon={<SaveOutlined />} disabled={errorCount > 0} onClick={() => void save()}>
              
              {t('保存草稿')}{errorCount ? ` (${errorCount})` : ''}
            </Button>
          </Space>
        </Space>

        <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
          <Collapse
            size="small"
            style={{ marginBottom: 12 }}
            activeKey={panelKeys}
            onChange={(keys) => setPanelKeys(keys as string[])}
            items={[
              {
                key: 'model',
                label: t('模型属性'),
                forceRender: true,
                children: (
                  <>
                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="code"
                          label={fieldLabel(t('编码'), { tip: t('小写字母开头，可含小写字母、数字、下划线、连字符与点；保存后不可修改') })}
                          rules={[
                            { required: true, message: t('请填写编码') },
                            {
                              pattern: MODEL_CODE_PATTERN,
                              message: t('编码需以小写字母开头，只能包含小写字母、数字、下划线、连字符或点'),
                            },
                          ]}
                        >
                          <Input disabled={!!current} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="name"
                          label={fieldLabel(t('名称'), { tip: t('在列表、选择器与内容表单中显示的模型名称') })}
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="objectType"
                          label={fieldLabel(
                            t('对象类型'),
                            { tip: t('PAGE 可路由页面 / COMPONENT 被页面引用的组件 / SHARED 可复用共享内容 / MEDIA 媒体资产；保存后不可修改') },
                          )}
                          rules={[{ required: true }]}
                        >
                          <Select
                            disabled={!!current}
                            options={['PAGE', 'COMPONENT', 'SHARED', 'MEDIA'].map((value) => ({ value }))}
                            onChange={(v: string) => void syncSystemFields(v)}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="quickCreate"
                          label={fieldLabel(t('快速创建'), { tip: t('开启后本类型出现在工作台「快速创建」面板，供编辑一键新建内容') })}
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="mergeStrategy"
                          label={fieldLabel(
                            t('合并策略'),
                            { tip: t('内容继承方式：NONE 不继承；MERGE_FIELDS 继承父类型字段定义；MERGE_DATA 继承父类型数据并允许覆盖') },
                          )}
                        >
                          <Select options={['NONE', 'MERGE_FIELDS', 'MERGE_DATA'].map((value) => ({ value }))} />
                        </Form.Item>
                      </Col>
                      {watchedObjectType === 'MEDIA' && (
                        <Col xs={24} md={6}>
                          <Form.Item
                            name="mediaKind"
                            label={fieldLabel(t('媒体种类'), { tip: t('MEDIA 类型的归类（图片、视频、音频、文档等），决定上传文件落入哪个媒体类型') })}
                            rules={[{ required: true }]}
                          >
                            <Select
                              options={MEDIA_KIND_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                              onChange={(v: string) => void syncSystemFields('MEDIA', v)}
                            />
                          </Form.Item>
                        </Col>
                      )}
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="parentTypeId"
                          label={fieldLabel(t('父类型候选'), { tip: t('用于继承的父类型；候选已排除会造成继承环与跨站的类型，配合合并策略生效') })}
                        >
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={parents.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="subtype"
                          label={fieldLabel(t('子类型'), { tip: t('对象类型特化：Widget = COMPONENT 的参数化组件；Form = SHARED 的表单构建器') })}
                        >
                          <Select
                            allowClear
                            placeholder={t('无')}
                            options={[
                              { value: 'WIDGET', label: t('Widget（参数化组件）') },
                              { value: 'FORM', label: t('Form（表单）') },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          name="destinationPattern"
                          label={fieldLabel(
                            t('目标路径模式'),
                            { tip: t('路径宏模板，如 /site/website/{yyyy}/{mm}/{objectId}；开启快速创建后必填，路径冲突时自动追加后缀') },
                          )}
                          rules={[{ required: watchedQuick }]}
                        >
                          <Input disabled={!watchedQuick} placeholder="/site/website/{yyyy}/{mm}/{objectId}" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      name="description"
                      label={fieldLabel(t('描述'), { tip: t('供管理员查看的模型用途说明，不面向访客展示') })}
                    >
                      <Input.TextArea rows={2} />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
        </div>

        <Tabs
          className="model-designer-main-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'design', label: t('设计'), children: designPane },
            { key: 'preview', label: t('预览'), children: <Preview fields={fields} blocks={blocks} /> },
            {
              key: 'template',
              label: t('模板'),
              children: (
                <Card size="small" title={t('显示模板与预览图')}>
                  {/* 与模型属性共用同一 form 实例：共享实例只有单个 onValuesChange 槽位，这里必须同样传入，
                      否则本 Form 后渲染会覆盖主 Form 的回调，导致模型属性里的修改不再标记脏状态。 */}
                  <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item
                          name="displayTemplate"
                          label={t('显示模板')}
                          rules={[{ required: ['PAGE', 'SHARED'].includes(String(watchedObjectType || '')) }]}
                        >
                          <Input placeholder="/templates/article.ftl" onChange={() => setDirty(true)} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="previewImage" label={t('预览图片')}>
                          <Input placeholder="/static-assets/previews/article.png" onChange={() => setDirty(true)} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="controllerPath" label={t('生命周期控制器路径')}>
                          <Input placeholder="/scripts/article-controller.groovy" onChange={() => setDirty(true)} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="formController"
                          label={fieldLabel(t('客户端表单控制器'), {
                            tip: t(
                              '模板工程内的脚本路径（可写「工程名:scripts/x.js」指定工程）。编辑表单按 onInit / onMediaSelect / onFieldChange / onSave 触发脚本，脚本用 ctx.setValue 回写字段，仅补空白时由脚本自行判断；改联动只改脚本，不改代码。',
                            ),
                          })}
                        >
                          <Input placeholder="/scripts/article-form-controller.js" onChange={() => setDirty(true)} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="schemaOrgType"
                          label={t('Schema.org 类型')}
                          extra={t('生成 JSON-LD 使用的 @type，如 Article / NewsArticle / FAQPage / Product')}
                        >
                          <Select
                            allowClear
                            showSearch
                            placeholder="Article"
                            options={[
                              'Article', 'NewsArticle', 'BlogPosting', 'FAQPage', 'Product',
                              'Organization', 'Event', 'Recipe', 'VideoObject', 'Course',
                            ].map((v) => ({ value: v, label: v }))}
                            onChange={() => setDirty(true)}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Alert
                      type="info"
                      showIcon
                      message={t('模板变量绑定')}
                      description={`当前模型字段：${fields
                        .filter((f) => !STRUCTURAL.has(f.fieldType))
                        .map((f) => f.code)
                        .join(', ') || t('（暂无字段）')}`}
                    />
                  </Form>
                </Card>
              ),
            },
            {
              key: 'lifecycle',
              label: t('生命周期'),
              children: (
                <Card
                  size="small"
                  title={t('内容生命周期钩子')}
                  extra={
                    <Select
                      style={{ width: 160 }}
                      value={lifecycleEvent}
                      onChange={setLifecycleEvent}
                      options={['CREATE', 'UPDATE', 'COPY', 'DELETE', 'WEBHOOK'].map((value) => ({ value }))}
                    />
                  }
                >
                  <Alert
                    style={{ marginBottom: 12 }}
                    type="warning"
                    showIcon
                    message={t('脚本在服务端沙箱校验后保存；Dry-Run 仅做静态校验，不落库执行。')}
                  />
                  {lifecycleEvent === 'WEBHOOK' && (
                    <Alert
                      style={{ marginBottom: 12 }}
                      type="info"
                      showIcon
                      message="WEBHOOK 钩子：处理 PowerMedia 媒体服务器全部类型回调，可筛选监听事件。脚本入参 fields（当前字段 Map）、media（回调媒体数据）、asset（资产信息）、event（实际回调事件，如 metadata.obtained / poster.obtained）；返回 Map 覆盖本模型已定义字段。"
                      description="// 示例：仅元数据事件写入宽度/高度，封面事件标记已生成封面
if (event in ['metadata.obtained', 'media.added']) {
  return { width_i: media.width, height_i: media.height };
}
if (event in ['poster.obtained', 'thumbnail.obtained']) {
  return { coverReady_b: true };
}
return null;"
                    />
                  )}
                  {lifecycleEvent === 'WEBHOOK' && (
                    <Form.Item
                      label={t('监听事件白名单（逗号分隔 PowerMedia webhook 事件，留空 = 监听全部）')}
                      style={{ marginBottom: 12 }}
                    >
                      <Input
                        placeholder="media.added, metadata.obtained, poster.obtained, thumbnail.obtained, preview.obtained"
                        value={lifecycleListen[lifecycleEvent] || ''}
                        onChange={(e) => {
                          setLifecycleListen((prev) => ({ ...prev, [lifecycleEvent]: e.target.value }));
                          setDirty(true);
                        }}
                      />
                      <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
                        可用事件：media.added / media.visible / task.completed / task.failed / metadata.obtained / poster.obtained / thumbnail.obtained / preview.obtained / keyframe.obtained / subtitle.obtained / atrack.obtained / pretranscode.completed / run.completed 等
                      </div>
                    </Form.Item>
                  )}
                  <Input.TextArea
                    rows={14}
                    value={lifecycle[lifecycleEvent] || ''}
                    placeholder={`// ${lifecycleEvent} 事件钩子脚本（Groovy）`}
                    onChange={(e) => {
                      setLifecycle((prev) => ({ ...prev, [lifecycleEvent]: e.target.value }));
                      setDirty(true);
                    }}
                  />
                  <Space style={{ marginTop: 12 }}>
                    <Button
                      type="primary"
                      disabled={!current}
                      onClick={async () => {
                        if (!current) return;
                        try {
                          await modelsApi.saveLifecycle(siteId!, current.id, lifecycleEvent, {
                            scriptContent: lifecycle[lifecycleEvent] || '',
                            scriptLang: 'GROOVY',
                            listenEvents: lifecycleListen[lifecycleEvent] || '',
                          });
                          message.success(`${lifecycleEvent} 生命周期脚本已保存`);
                        } catch (err) {
                          message.warning(`${lifecycleEvent} 生命周期脚本保存失败`);
                        }
                      }}
                    >
                      
                      {t('保存脚本')}
                    </Button>
                    <Button
                      disabled={!current}
                      onClick={async () => {
                        if (!current) return;
                        const result = await modelsApi.testLifecycle(siteId!, current.id, lifecycleEvent, {
                          scriptContent: lifecycle[lifecycleEvent] || '',
                        });
                        message.success(result.success === false ? t('Dry-Run 未通过') : t('Dry-Run 静态校验通过'));
                      }}
                    >
                      
                      {t('Dry-Run 测试')}
                    </Button>
                  </Space>
                </Card>
              ),
            },
            {
              key: 'config',
              label: t('配置'),
              children: (
                <Card size="small" title={t('内容类型配置')}>
                  <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
                    <Form.Item
                      name={['config', 'pathIncludes']}
                      label={t('创建路径白名单（每行一条正则）')}
                      getValueProps={(v) => ({ value: Array.isArray(v) ? v.join('\n') : v || '' })}
                      getValueFromEvent={(e) =>
                        String(e.target.value)
                          .split('\n')
                          .map((x: string) => x.trim())
                          .filter(Boolean)
                      }
                    >
                      <Input.TextArea rows={3} placeholder="^/site/website/articles/.*" />
                    </Form.Item>
                    <Form.Item
                      name={['config', 'pathExcludes']}
                      label={t('创建路径黑名单')}
                      getValueProps={(v) => ({ value: Array.isArray(v) ? v.join('\n') : v || '' })}
                      getValueFromEvent={(e) =>
                        String(e.target.value)
                          .split('\n')
                          .map((x: string) => x.trim())
                          .filter(Boolean)
                      }
                    >
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item
                      name={['config', 'cdataEscapedFieldPatterns']}
                      label={t('CDATA 转义字段模式')}
                      getValueProps={(v) => ({ value: Array.isArray(v) ? v.join('\n') : v || '' })}
                      getValueFromEvent={(e) =>
                        String(e.target.value)
                          .split('\n')
                          .map((x: string) => x.trim())
                          .filter(Boolean)
                      }
                    >
                      <Input.TextArea rows={2} placeholder="(_html|_t)$" />
                    </Form.Item>
                  </Form>
                </Card>
              ),
            },
            {
              key: 'versions',
              label: t('版本'),
              children: (
                <Card size="small" title={t('版本管理')}>
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={versions.length ? versions : current ? [current] : []}
                    columns={[
                      { title: t('版本'), dataIndex: 'version' },
                      {
                        title: t('状态'),
                        dataIndex: 'status',
                        render: (s) => (
                          <Tag color={s === 'PUBLISHED' ? 'green' : s === 'DEPRECATED' ? 'default' : 'orange'}>
                            {s === 'DEPRECATED' ? t('已废弃') : s}
                          </Tag>
                        ),
                      },
                      { title: t('编码'), dataIndex: 'code' },
                      { title: t('名称'), dataIndex: 'name' },
                    ]}
                  />
                  <Space style={{ marginTop: 12 }}>
                    <Button
                      type="primary"
                      disabled={!current || current.status === 'PUBLISHED'}
                      onClick={async () => {
                        if (!current) return;
                        await modelsApi.publish(siteId!, current.id);
                        message.success(t('发布成功'));
                        const refreshed = await modelsApi.get(siteId!, current.id);
                        setCurrent(refreshed);
                        setVersions([refreshed]);
                        void load();
                      }}
                    >
                      
                      {t('发布当前草稿')}
                    </Button>
                    <Button
                      disabled={!current || current.status !== 'PUBLISHED'}
                      onClick={async () => {
                        if (!current) return;
                        const draft = await modelsApi.newVersion(siteId!, current.id);
                        message.success(t('已创建新版本草稿'));
                        await begin(draft);
                        void load();
                      }}
                    >
                      
                      {t('基于已发布版本创建新草稿')}
                    </Button>
                  </Space>
                </Card>
              ),
            },
          ]}
        />
        </div>
      </Modal>
    </div>
  );
}

function Inspector({
  field,
  allFields = [],
  repeatLookupCode,
  canEditRepeatChildren = false,
  errors,
  onChange,
  onSuggestName,
  onEditRepeatChild,
  onAddRepeatChild,
  onRemoveRepeatChild,
  onReorderRepeatChild,
}: {
  field: FieldDef;
  allFields?: FieldDef[];
  repeatLookupCode?: string;
  canEditRepeatChildren?: boolean;
  errors: string[];
  onChange: (v: Partial<FieldDef>) => void;
  onSuggestName: () => void;
  onEditRepeatChild?: (childCode: string) => void;
  onAddRepeatChild?: (fieldType: string) => void;
  onRemoveRepeatChild?: (childCode: string) => void;
  onReorderRepeatChild?: (childCode: string, dir: -1 | 1) => void;
}) {
  const cfg = field.fieldConfig || {};
  const setCfg = (v: Record<string, unknown>) => onChange({ fieldConfig: { ...cfg, ...v } });
  return (
    <div className="model-inspector-body">
      {errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('{n} 个校验问题', { n: errors.length })}
          description={errors.join('；')}
        />
      )}
      <Form layout="vertical" size="small" className="model-inspector-form">
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label={t('显示名称')} required>
              <Input
                value={field.name}
                onChange={(e) => onChange({ name: e.target.value })}
                onBlur={() => {
                  if (!field.code || field.code.startsWith('field')) onSuggestName();
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label={t('变量名')}
              required
              validateStatus={!CODE_PATTERN.test(field.code) ? 'error' : undefined}
              help={field.isSystem ? t('系统字段：变量名与类型不可改') : `推荐后缀 ${SUFFIX[field.fieldType] || ''}；可点右侧生成`}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input value={field.code} disabled={field.isSystem} onChange={(e) => onChange({ code: e.target.value })} />
                <Button onClick={onSuggestName} disabled={field.isSystem}>{t('生成')}</Button>
              </Space.Compact>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label={t('字段类型')}>
              <Select
                value={field.fieldType}
                disabled={field.isSystem}
                options={INSPECTOR_FIELD_TYPES.map((value) => ({
                  value,
                  label: `${PALETTE.find((x) => x.type === value)?.name} (${value})`,
                }))}
                onChange={(fieldType) =>
                  onChange({
                    fieldType,
                    code: suggestCode(field.name, fieldType),
                    fieldConfig:
                      fieldType === 'COMPONENT_REF'
                        ? { bindingMode: 'EMBEDDED' }
                        : fieldType === 'REPEAT_GROUP'
                          ? { ...(field.fieldConfig || {}) }
                          : {},
                  })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t('帮助文本')}>
              <Input value={field.helpText} onChange={(e) => onChange({ helpText: e.target.value })} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t('默认值')}>
              <Input value={field.defaultValue} onChange={(e) => onChange({ defaultValue: e.target.value })} />
            </Form.Item>
          </Col>
        </Row>
        <div className="model-inspector-section">
          <div className="model-inspector-section-title">{t('通用与索引')}</div>
          <Space wrap size={[12, 8]} className="model-inspector-flags">
            <Checkbox checked={field.required} onChange={(e) => onChange({ required: e.target.checked })}>
              
              {t('必填')}
            </Checkbox>
            <Checkbox checked={field.readOnly} onChange={(e) => onChange({ readOnly: e.target.checked })}>
              
              {t('只读')}
            </Checkbox>
            <Checkbox checked={field.i18n} onChange={(e) => onChange({ i18n: e.target.checked })}>
              
              {t('国际化')}
            </Checkbox>
            <Checkbox checked={field.adminIndex} onChange={(e) => onChange({ adminIndex: e.target.checked })}>
              
              {t('管理索引')}
            </Checkbox>
            <Checkbox
              checked={field.publicIndex}
              disabled={field.sensitive}
              onChange={(e) => onChange({ publicIndex: e.target.checked })}
            >
              
              {t('访客索引')}
            </Checkbox>
            <Checkbox
              checked={field.sensitive}
              onChange={(e) =>
                onChange({ sensitive: e.target.checked, publicIndex: e.target.checked ? false : field.publicIndex })
              }
            >
              
              {t('敏感')}
            </Checkbox>
            <Checkbox checked={field.sortable} onChange={(e) => onChange({ sortable: e.target.checked })}>
              
              {t('可排序')}
            </Checkbox>
            <Checkbox checked={field.filterable} onChange={(e) => onChange({ filterable: e.target.checked })}>
              
              {t('可过滤')}
            </Checkbox>
            <Checkbox checked={field.highlight} onChange={(e) => onChange({ highlight: e.target.checked })}>
              
              {t('高亮')}
            </Checkbox>
            <Checkbox checked={Boolean(field.uniqueField)} onChange={(e) => onChange({ uniqueField: e.target.checked })}>
              
              {t('唯一')}
            </Checkbox>
          </Space>
        </div>
        <div className="model-inspector-section">
          <div className="model-inspector-section-title">{t('类型专属配置')}</div>
          {['TAG', 'CATEGORY', 'RELATIONSHIP'].includes(field.fieldType) && <TaxonomyGuide type={field.fieldType} />}
          <TypeConfig
            field={field}
            cfg={cfg}
            setCfg={setCfg}
            allFields={allFields}
            repeatLookupCode={repeatLookupCode}
            canEditRepeatChildren={canEditRepeatChildren}
            onEditRepeatChild={onEditRepeatChild}
            onAddRepeatChild={onAddRepeatChild}
            onRemoveRepeatChild={onRemoveRepeatChild}
            onReorderRepeatChild={onReorderRepeatChild}
          />
        </div>
      </Form>
    </div>
  );
}

function TaxonomyGuide({ type }: { type: string }) {
  const guide: Record<string, { title: string; points: string[] }> = {
    TAG: {
      title: t('自由标签（TAG）'),
      points: [
        t('由内容创建者自由输入，无需预定义'),
        t('无层级、无权限控制，支持标签池建议与标签云'),
        t('适合话题不固定的内容（新闻、博客）'),
      ],
    },
    CATEGORY: {
      title: t('分类树（CATEGORY）'),
      points: [
        t('站点管理员预定义，层级建议 ≤ 3 层'),
        t('支持节点权限控制，保证术语一致'),
        t('适合需可靠拉取的结构化分类（产品、地区）'),
      ],
    },
    RELATIONSHIP: {
      title: t('内容关系（RELATIONSHIP）'),
      points: [
        t('双向实体关联，支持 1:1 / 1:N / N:1 / N:N 基数'),
        t('可从任一侧查询关联内容，支持自引用'),
        t('适合文章↔作者、产品↔配件等实体间关联'),
      ],
    },
  };
  const g = guide[type];
  if (!g) return null;
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 12 }}
      message={g.title}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {g.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      }
    />
  );
}

function CategoryFieldConfig({
  cfg,
  setCfg,
}: {
  cfg: Record<string, unknown>;
  setCfg: (v: Record<string, unknown>) => void;
}) {
  const { siteId } = useSite();
  const [roots, setRoots] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!siteId) return;
    void categoriesApi.tree(siteId).then((tree) => {
      const tops = (tree || []).map((c: Category) => ({
        value: c.id,
        label: `${c.name}${c.pathAlias ? ` (${c.pathAlias})` : ''}`,
      }));
      setRoots(tops);
    });
  }, [siteId]);

  return (
    <>
      <Form.Item label={t('分类树根节点')} extra={t('选择站点顶级分类作为词表根（如主表、附录 B）')}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('选择分类树根')}
          value={(cfg.taxonomyRoot as string) || undefined}
          options={roots}
          onChange={(v) => setCfg({ taxonomyRoot: v || undefined })}
        />
      </Form.Item>
      <Form.Item label={t('组号角色 composeRole')}>
        <Select
          allowClear
          placeholder={t('无 / 编目角色')}
          value={(cfg.composeRole as string) || undefined}
          options={[
            { value: 'base', label: t('base 主表') },
            { value: 'imitation', label: t('imitation 仿分') },
            { value: 'special', label: t('special 专类复分') },
            { value: 'world', label: t('world 世界地区') },
            { value: 'china', label: t('china 中国地区') },
            { value: 'nation', label: t('nation 民族') },
            { value: 'general', label: t('general 总论复分') },
          ]}
          onChange={(v) => setCfg({ composeRole: v || undefined })}
        />
      </Form.Item>
      <Checkbox
        checked={cfg.singleSelect === undefined ? true : Boolean(cfg.singleSelect)}
        onChange={(e) => setCfg({ singleSelect: e.target.checked })}
      >
        
        {t('单选')}
      </Checkbox>
    </>
  );
}

function ContentRefTypeConfig({
  cfg,
  setCfg,
}: {
  cfg: Record<string, unknown>;
  setCfg: (v: Record<string, unknown>) => void;
}) {
  const { siteId } = useSite();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!siteId) return;
    void modelsApi.list(siteId).then((types) => {
      setOptions(types
        .filter((type) => isContentSearchModel(type))
        .map((type) => ({ value: type.code, label: `${type.name}（${type.code}）` })));
    }).catch(() => setOptions([]));
  }, [siteId]);
  return (
    <>
      <Form.Item label={t('允许的内容类型')} extra={t('留空则可引用内容搜索中的内容模型。媒体库类型和系统预置类型不会出现。')}>
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          value={(cfg.allowedContentTypes as string[]) || []}
          options={options}
          onChange={(v) => setCfg({ allowedContentTypes: v })}
        />
      </Form.Item>
      <Checkbox checked={Boolean(cfg.allowMultiple)} onChange={(e) => setCfg({ allowMultiple: e.target.checked })}>
        {t('允许多选')}
      </Checkbox>
    </>
  );
}

function TaxonomyRefTypeConfig({
  cfg,
  setCfg,
}: {
  cfg: Record<string, unknown>;
  setCfg: (v: Record<string, unknown>) => void;
}) {
  const { siteId } = useSite();
  const [roots, setRoots] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!siteId) return;
    void categoriesApi.tree(siteId).then((tree) => {
      setRoots((tree || []).map((category) => ({
        value: category.id,
        label: `${category.name}${category.pathAlias ? ` (${category.pathAlias})` : ''}`,
      })));
    }).catch(() => setRoots([]));
  }, [siteId]);
  return (
    <>
      <Form.Item label={t('分类树根节点')} extra={t('留空则使用全部分类')}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('选择分类树根')}
          value={(cfg.taxonomyRoot as string) || undefined}
          options={roots}
          onChange={(v) => setCfg({ taxonomyRoot: v || undefined })}
        />
      </Form.Item>
      <Form.Item label={t('最大深度')}>
        <InputNumber style={{ width: '100%' }} value={cfg.maxDepth as number} onChange={(v) => setCfg({ maxDepth: v })} />
      </Form.Item>
      <Checkbox checked={Boolean(cfg.allowMultiple)} onChange={(e) => setCfg({ allowMultiple: e.target.checked })}>
        {t('允许多选')}
      </Checkbox>
    </>
  );
}

function TypeConfig({
  field,
  cfg,
  setCfg,
  allFields = [],
  repeatLookupCode,
  canEditRepeatChildren = false,
  onEditRepeatChild,
  onAddRepeatChild,
  onRemoveRepeatChild,
  onReorderRepeatChild,
}: {
  field: FieldDef;
  cfg: Record<string, unknown>;
  setCfg: (v: Record<string, unknown>) => void;
  allFields?: FieldDef[];
  repeatLookupCode?: string;
  canEditRepeatChildren?: boolean;
  onEditRepeatChild?: (childCode: string) => void;
  onAddRepeatChild?: (fieldType: string) => void;
  onRemoveRepeatChild?: (childCode: string) => void;
  onReorderRepeatChild?: (childCode: string, dir: -1 | 1) => void;
}) {
  if (['STRING', 'LONG_TEXT'].includes(field.fieldType)) {
    return (
      <Row gutter={8}>
        <Col span={12}>
          <Form.Item label={t('最大长度')}>
            <InputNumber style={{ width: '100%' }} value={cfg.maxLength as number} onChange={(v) => setCfg({ maxLength: v })} />
          </Form.Item>
        </Col>
        {field.fieldType === 'STRING' ? (
          <Col span={12}>
            <Form.Item label={t('正则')}>
              <Input value={cfg.pattern as string} onChange={(e) => setCfg({ pattern: e.target.value })} />
            </Form.Item>
          </Col>
        ) : (
          <Col span={12}>
            <Form.Item label={t('行数')}>
              <InputNumber style={{ width: '100%' }} value={cfg.rows as number} onChange={(v) => setCfg({ rows: v })} />
            </Form.Item>
          </Col>
        )}
      </Row>
    );
  }
  if (['INTEGER', 'DECIMAL'].includes(field.fieldType)) {
    return (
      <Row gutter={8}>
        <Col span={8}>
          <Form.Item label={t('最小值')}>
            <InputNumber style={{ width: '100%' }} value={cfg.min as number} onChange={(v) => setCfg({ min: v })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={t('最大值')}>
            <InputNumber style={{ width: '100%' }} value={cfg.max as number} onChange={(v) => setCfg({ max: v })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={field.fieldType === 'DECIMAL' ? t('精度') : t('步长')}>
            <InputNumber
              style={{ width: '100%' }}
              value={(cfg.precision ?? cfg.step) as number}
              onChange={(v) => setCfg(field.fieldType === 'DECIMAL' ? { precision: v } : { step: v })}
            />
          </Form.Item>
        </Col>
      </Row>
    );
  }
  if (['ENUM', 'MULTI_ENUM'].includes(field.fieldType)) {
    return (
      <Form.Item label={t('选项（每行一项，可用 label:value）')} required>
        <Input.TextArea
          rows={3}
          placeholder={'选项A\n选项B:b'}
          value={enumOptionsToText(cfg.options)}
          onChange={(e) => setCfg({ options: e.target.value })}
        />
      </Form.Item>
    );
  }
  if (field.fieldType === 'CONTENT_REF') {
    return <ContentRefTypeConfig cfg={cfg} setCfg={setCfg} />;
  }
  if (field.fieldType === 'TAXONOMY_REF') {
    return <TaxonomyRefTypeConfig cfg={cfg} setCfg={setCfg} />;
  }
  if (field.fieldType === 'KEY_VALUE') {
    return (
      <Form.Item label={t('值类型')}>
        <Select
          value={(cfg.valueType as string) || 'STRING'}
          options={[
            { value: 'STRING', label: t('文本') },
            { value: 'INTEGER', label: t('整数') },
            { value: 'DECIMAL', label: t('小数') },
            { value: 'BOOLEAN', label: t('布尔') },
          ]}
          onChange={(v) => setCfg({ valueType: v })}
        />
      </Form.Item>
    );
  }
  if (field.fieldType === 'COMPONENT_REF') {
    return (
      <>
        <Form.Item label={t('绑定模式')}>
          <Radio.Group value={cfg.bindingMode || 'EMBEDDED'} onChange={(e) => setCfg({ bindingMode: e.target.value })}>
            <Radio.Button value="EMBEDDED">{t('嵌入式')}</Radio.Button>
            <Radio.Button value="SHARED">{t('共享')}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message={
            cfg.bindingMode === 'SHARED'
              ? t('共享组件独立存储，可被多个父对象复用。')
              : t('嵌入式组件随父对象复制和删除，适合单一归属内容。')
          }
          style={{ marginBottom: 12 }}
        />
        <Form.Item label={t('允许的组件类型')}>
          <Select mode="tags" value={cfg.allowedComponentTypes as string[]} onChange={(v) => setCfg({ allowedComponentTypes: v })} />
        </Form.Item>
        <Row gutter={8}>
          <Col span={12}>
            <Form.Item label={t('最少数量')}>
              <InputNumber style={{ width: '100%' }} value={cfg.minItems as number} onChange={(v) => setCfg({ minItems: v })} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t('最多数量')}>
              <InputNumber style={{ width: '100%' }} value={cfg.maxItems as number} onChange={(v) => setCfg({ maxItems: v })} />
            </Form.Item>
          </Col>
        </Row>
        {cfg.bindingMode === 'SHARED' && (
          <Checkbox
            checked={Boolean(cfg.enableSearchExisting)}
            onChange={(e) => setCfg({ enableSearchExisting: e.target.checked })}
          >
            
            {t('允许搜索已有实例')}
          </Checkbox>
        )}
      </>
    );
  }
  if (field.fieldType === 'MEDIA_REF') {
    return (
      <>
        <Form.Item label={t('允许媒体种类')}>
          <Select
            mode="multiple"
            allowClear
            placeholder={t('留空则不限制')}
            value={cfg.allowedKinds as string[]}
            onChange={(v) => setCfg({ allowedKinds: v })}
            options={[
              { value: 'video', label: t('视频') },
              { value: 'audio', label: t('音频') },
              { value: 'image', label: t('图片') },
              { value: 'document', label: t('文档') },
              { value: 'other', label: t('其他') },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('允许 MIME 类型')}>
          <Select mode="tags" value={cfg.allowedMimeTypes as string[]} onChange={(v) => setCfg({ allowedMimeTypes: v })} />
        </Form.Item>
        <Checkbox checked={Boolean(cfg.allowMultiple)} onChange={(e) => setCfg({ allowMultiple: e.target.checked })}>
          
          {t('允许多选')}
        </Checkbox>
      </>
    );
  }
  if (field.fieldType === 'DATE_TIME') {
    return (
      <Form.Item label={t('模式')}>
        <Select
          value={cfg.mode || 'DATE_TIME'}
          options={['DATE', 'TIME', 'DATE_TIME'].map((value) => ({ value }))}
          onChange={(v) => setCfg({ mode: v })}
        />
      </Form.Item>
    );
  }
  if (field.fieldType === 'COLOR') {
    return (
      <Form.Item label={t('颜色格式')}>
        <Select
          value={cfg.format || 'HEX'}
          options={['HEX', 'RGB', 'HSL'].map((value) => ({ value }))}
          onChange={(v) => setCfg({ format: v })}
        />
      </Form.Item>
    );
  }
  if (field.fieldType === 'RELATIONSHIP') {
    return (
      <>
        <Form.Item label={t('关系定义 ID')} required>
          <Input value={cfg.relationId as string} onChange={(e) => setCfg({ relationId: e.target.value })} placeholder={t('content_relation 的 UUID')} />
        </Form.Item>
        <Form.Item label={t('关联内容显示列 (showFields)')}>
          <Input value={cfg.showFields as string} onChange={(e) => setCfg({ showFields: e.target.value })} placeholder="title_s,author_s" />
        </Form.Item>
        <Checkbox checked={Boolean(cfg.searchable)} onChange={(e) => setCfg({ searchable: e.target.checked })}>
          
          {t('可按关联内容搜索')}
        </Checkbox>
      </>
    );
  }
  if (field.fieldType === 'CONSTANT') {
    return (
      <Form.Item label={t('常量值')} required>
        <Input value={cfg.constantValue as string} onChange={(e) => setCfg({ constantValue: e.target.value })} />
      </Form.Item>
    );
  }
  if (field.fieldType === 'TAG') {
    return (
      <>
        <Form.Item label={t('最大标签数（-1 无限）')}>
          <InputNumber style={{ width: '100%' }} value={cfg.maxTags as number} onChange={(v) => setCfg({ maxTags: v })} />
        </Form.Item>
        <Checkbox checked={Boolean(cfg.suggestions)} onChange={(e) => setCfg({ suggestions: e.target.checked })}>
          
          {t('启用标签池建议')}
        </Checkbox>
      </>
    );
  }
  if (field.fieldType === 'CATEGORY') {
    return <CategoryFieldConfig cfg={cfg} setCfg={setCfg} />;
  }
  if (field.fieldType === 'SITE_FOLDER') {
    return (
      <>
        <Checkbox checked={Boolean(cfg.allowSite)} onChange={(e) => setCfg({ allowSite: e.target.checked })}>
          
          {t('允许选站点级')}
        </Checkbox>
        <Checkbox checked={cfg.allowFolder === undefined || Boolean(cfg.allowFolder)} onChange={(e) => setCfg({ allowFolder: e.target.checked })}>
          
          {t('允许选栏目级')}
        </Checkbox>
        <Checkbox checked={Boolean(cfg.inheritPermissions)} onChange={(e) => setCfg({ inheritPermissions: e.target.checked })}>
          
          {t('继承目标位置权限')}
        </Checkbox>
      </>
    );
  }
  if (field.fieldType === 'HIDDEN') {
    return (
      <Checkbox checked={Boolean(cfg.programmableDefault)} onChange={(e) => setCfg({ programmableDefault: e.target.checked })}>
        
        {t('允许程序运行时设值')}
      </Checkbox>
    );
  }
  if (field.fieldType === 'BLOCK_EDITOR') {
    return (
      <Form.Item label={t('字符上限')}>
        <InputNumber style={{ width: '100%' }} value={cfg.charLimit as number} onChange={(v) => setCfg({ charLimit: v })} />
      </Form.Item>
    );
  }
  if (field.fieldType === 'CUSTOM_CODE') {
    return (
      <>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('自定义代码字段')}
          description={t('用本字段承载个性化逻辑（渲染/校验脚本）与输入约束；重复组仅作结构容器，不配置业务脚本。')}
        />
        <Form.Item label={t('脚本语言')} extra={t('渲染与校验共用。')}>
          <Select
            value={(cfg.codeLang as string) || 'JS'}
            options={[
              { value: 'JS', label: 'JavaScript' },
              { value: 'GROOVY', label: 'Groovy' },
            ]}
            onChange={(v) => setCfg({ codeLang: v })}
          />
        </Form.Item>
        <Row gutter={8}>
          <Col span={12}>
            <Form.Item label={t('占位提示')}>
              <Input
                value={(cfg.placeholder as string) || ''}
                onChange={(e) => setCfg({ placeholder: e.target.value || undefined })}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t('输入形态')}>
              <Select
                value={(cfg.inputMode as string) || 'text'}
                options={[
                  { value: 'text', label: t('单行文本') },
                  { value: 'textarea', label: t('多行文本') },
                  { value: 'hidden', label: t('隐藏（仅脚本）') },
                ]}
                onChange={(v) => setCfg({ inputMode: v })}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={8}>
          <Col span={8}>
            <Form.Item label={t('最小长度')}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={cfg.minLength as number}
                onChange={(v) => setCfg({ minLength: v ?? undefined })}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('最大长度')}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={cfg.maxLength as number}
                onChange={(v) => setCfg({ maxLength: v ?? undefined })}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('正则约束')}>
              <Input
                value={(cfg.pattern as string) || ''}
                placeholder="^J\\d+.*"
                onChange={(e) => setCfg({ pattern: e.target.value || undefined })}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={t('约束失败提示')}>
          <Input
            value={(cfg.patternMessage as string) || ''}
            placeholder={t('不符合分类号格式')}
            onChange={(e) => setCfg({ patternMessage: e.target.value || undefined })}
          />
        </Form.Item>
        <Form.Item label={t('渲染代码')} extra={t('可用变量 value / input；返回渲染结果字符串。')}>
          <Input.TextArea
            rows={6}
            value={cfg.renderCode as string}
            placeholder={t("// 例：return String(input || '')")}
            onChange={(e) => setCfg({ renderCode: e.target.value })}
          />
        </Form.Item>
        <Form.Item label={t('校验代码')} extra={t('返回 true / 非空字符串表示通过；可在此实现个性化校验。')}>
          <Input.TextArea
            rows={4}
            value={cfg.validationCode as string}
            placeholder={t("// 例：return value != null && value !== ''")}
            onChange={(e) => setCfg({ validationCode: e.target.value })}
          />
        </Form.Item>
      </>
    );
  }
  if (STRUCTURAL.has(field.fieldType)) {
    return (
      <>
        <Form.Item label={t('标题')}>
          <Input value={(cfg.title as string) || field.name} onChange={(e) => setCfg({ title: e.target.value })} />
        </Form.Item>
        <Form.Item label={t('变量名')}>
          <Input value={(cfg.variableName as string) || field.code} onChange={(e) => setCfg({ variableName: e.target.value })} />
        </Form.Item>
        {field.fieldType === 'REPEAT_GROUP' && (
          <>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label={t('最少次数')}>
                  <InputNumber style={{ width: '100%' }} value={cfg.minItems as number} onChange={(v) => setCfg({ minItems: v })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={t('最多次数（-1 无限）')}>
                  <InputNumber style={{ width: '100%' }} value={cfg.maxItems as number} onChange={(v) => setCfg({ maxItems: v })} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              label={t('组内字段')}
              extra={
                canEditRepeatChildren
                  ? t('可新增、编辑、排序或删除子字段；保存模型后生效')
                  : t('请先保存重复组到画布，再编辑组内字段')
              }
            >
              {(() => {
                const parentCode = repeatLookupCode || field.code;
                const children = repeatChildrenOf(allFields, parentCode);
                return (
                  <div className="model-repeat-children">
                    {children.length === 0 && (
                      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        
                        {t('暂无子字段')}
                      </Typography.Text>
                    )}
                    {children.map((c, idx) => (
                      <div key={c.code} className="model-repeat-child-row">
                        <div className="model-repeat-child-main">
                          <Typography.Text strong>{c.name}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {c.code} · {PALETTE.find((p) => p.type === c.fieldType)?.name || c.fieldType}
                          </Typography.Text>
                        </div>
                        {canEditRepeatChildren && (
                          <Space size={0}>
                            <Tooltip title={t('上移')}>
                              <Button
                                type="text"
                                size="small"
                                icon={<UpOutlined />}
                                disabled={idx === 0}
                                onClick={() => onReorderRepeatChild?.(c.code, -1)}
                              />
                            </Tooltip>
                            <Tooltip title={t('下移')}>
                              <Button
                                type="text"
                                size="small"
                                icon={<DownOutlined />}
                                disabled={idx === children.length - 1}
                                onClick={() => onReorderRepeatChild?.(c.code, 1)}
                              />
                            </Tooltip>
                            <Tooltip title={t('编辑')}>
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => onEditRepeatChild?.(c.code)}
                              />
                            </Tooltip>
                            <Tooltip title={t('删除')}>
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                  Modal.confirm({
                                    title: `删除组内字段「${c.name}」？`,
                                    okText: t('删除'),
                                    okType: 'danger',
                                    cancelText: t('取消'),
                                    onOk: () => onRemoveRepeatChild?.(c.code),
                                  });
                                }}
                              />
                            </Tooltip>
                          </Space>
                        )}
                      </div>
                    ))}
                    {canEditRepeatChildren && (
                      <Select
                        showSearch
                        allowClear
                        placeholder={t('添加组内字段…')}
                        optionFilterProp="label"
                        style={{ width: '100%', marginTop: 8 }}
                        value={undefined}
                        options={FIELD_TYPES.map((type) => ({
                          value: type,
                          label: `${PALETTE.find((p) => p.type === type)?.name || type} (${type})`,
                        }))}
                        onSelect={(type) => onAddRepeatChild?.(String(type))}
                        getPopupContainer={() => document.body}
                        listHeight={360}
                        popupMatchSelectWidth={false}
                        dropdownStyle={{ zIndex: 1200, minWidth: 280 }}
                      />
                    )}
                  </div>
                );
              })()}
            </Form.Item>
          </>
        )}
        {field.fieldType === 'FORM_SECTION' && (
          <Checkbox checked={Boolean(cfg.collapsed)} onChange={(e) => setCfg({ collapsed: e.target.checked })}>
            
            {t('默认折叠')}
          </Checkbox>
        )}
      </>
    );
  }
  return <Typography.Text type="secondary">{t('此字段类型暂无额外配置。')}</Typography.Text>;
}

function PreviewControl({
  field,
  disabled,
  value,
  onChange,
  onCategorySelect,
}: {
  field: FieldDef;
  disabled?: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
  onCategorySelect?: (id: string | undefined, pathAlias: string | undefined) => void;
}) {
  const { siteId } = useSite();
  const readOnly = disabled || field.readOnly;
  if (field.fieldType === 'BOOLEAN') {
    return <Switch disabled={readOnly} checked={Boolean(value)} onChange={onChange} />;
  }
  if (field.fieldType === 'CONTENT_REF') {
    return (
      <ContentRefControl
        field={{ ...field, readOnly }}
        siteId={siteId || ''}
        disabled={readOnly}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'TAXONOMY_REF') {
    return (
      <TaxonomyRefControl
        field={{ ...field, readOnly }}
        siteId={siteId || ''}
        disabled={readOnly}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'KEY_VALUE') {
    return <KeyValueControl field={{ ...field, readOnly }} disabled={readOnly} value={value} onChange={onChange} />;
  }
  if (field.fieldType === 'COMPONENT_REF') {
    return (
      <ComponentRefControl
        field={{ ...field, readOnly }}
        siteId={siteId || ''}
        disabled={readOnly}
        value={value}
        onChange={onChange}
        renderField={(child, childValue, childChange) => (
          <PreviewControl
            field={{ ...child, readOnly: readOnly || child.readOnly }}
            disabled={readOnly || child.readOnly}
            value={childValue}
            onChange={childChange}
          />
        )}
      />
    );
  }
  if (field.fieldType === 'CATEGORY') {
    return (
      <CategorySelect
        siteId={siteId || ''}
        disabled={readOnly}
        value={value as string | undefined}
        taxonomyRoot={field.fieldConfig?.taxonomyRoot as string | undefined}
        maxDepth={Number(field.fieldConfig?.maxDepth) || undefined}
        singleSelect={field.fieldConfig?.singleSelect !== false}
        onChange={(id, alias) => {
          onChange?.(id);
          onCategorySelect?.(typeof id === 'string' ? id : undefined, alias);
        }}
      />
    );
  }
  if (['INTEGER', 'DECIMAL'].includes(field.fieldType)) {
    return <InputNumber style={{ width: '100%' }} disabled={readOnly} value={value as number} onChange={onChange} />;
  }
  if (field.fieldType === 'RICH_TEXT') {
    // FT-003 / TC-M65-008：预览同样呈现富文本编辑器（与内容编辑页一致）。
    return (
      <RichTextEditor
        rows={Number(field.fieldConfig?.rows) || 6}
        disabled={readOnly}
        siteId={siteId || undefined}
        value={value as string}
        onChange={onChange}
      />
    );
  }
  if (['LONG_TEXT', 'JSON'].includes(field.fieldType)) {
    return (
      <Input.TextArea
        rows={Number(field.fieldConfig?.rows) || 4}
        disabled={readOnly}
        value={value as string}
        onChange={onChange}
      />
    );
  }
  if (['ENUM', 'MULTI_ENUM'].includes(field.fieldType)) {
    return (
      <Select
        mode={field.fieldType === 'MULTI_ENUM' ? 'multiple' : undefined}
        disabled={readOnly}
        options={parseEnumOptions(field.fieldConfig?.options)}
        allowClear
        showSearch
        optionFilterProp="label"
        value={value as unknown}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'DATE' || field.fieldType === 'DATE_TIME') {
    return (
      <Input
        type={field.fieldType === 'DATE_TIME' ? 'datetime-local' : 'date'}
        disabled={readOnly}
        value={value as string}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'IMAGE') {
    return <ImageField siteId={siteId || ''} disabled={readOnly} value={value} onChange={onChange as (v: string) => void} />;
  }
  return <Input disabled={readOnly} value={value as string} onChange={onChange} />;
}

function PreviewFieldItem({
  field,
  locale,
  namePath,
  repeatCode,
  siblingCodes,
}: {
  field: FieldDef;
  locale: string;
  namePath?: (string | number)[];
  /** When nested under Form.List, the repeat group field code. */
  repeatCode?: string;
  siblingCodes?: string[];
}) {
  const form = Form.useFormInstance();
  const { siteId } = useSite();
  const name = namePath
    ? namePath
    : field.i18n
      ? [field.code, locale]
      : field.code;

  const showCompose =
    field.fieldType === 'CATEGORY' &&
    field.code === 'program_class' &&
    Boolean(siblingCodes?.includes('class_number'));

  const applyCompose = (r: { classNumber: string; classCaption: string }) => {
    if (repeatCode != null && namePath && namePath.length >= 1) {
      form.setFieldValue([repeatCode, namePath[0], 'class_number'], r.classNumber);
      if (siblingCodes?.includes('class_caption')) {
        form.setFieldValue([repeatCode, namePath[0], 'class_caption'], r.classCaption);
      }
    } else {
      form.setFieldValue('class_number', r.classNumber);
      if (siblingCodes?.includes('class_caption')) {
        form.setFieldValue('class_caption', r.classCaption);
      }
    }
  };

  return (
    <Form.Item
      name={name}
      label={field.name}
      extra={
        showCompose ? (
          <Space direction="vertical" size={0}>
            {field.helpText && <span>{field.helpText}</span>}
            <Form.Item noStyle shouldUpdate>
              {() => {
                const catId =
                  repeatCode != null && namePath
                    ? (form.getFieldValue([repeatCode, namePath[0], field.code]) as string | undefined)
                    : (form.getFieldValue(field.code) as string | undefined);
                return (
                  <ClassComposeTrigger
                    siteId={siteId || ''}
                    taxonomyRoot={field.fieldConfig?.taxonomyRoot as string | undefined}
                    categoryId={catId}
                    onApply={applyCompose}
                  />
                );
              }}
            </Form.Item>
          </Space>
        ) : (
          field.helpText
        )
      }
      rules={[
        { required: field.required, message: `请输入${field.name}` },
        Number(field.fieldConfig?.maxLength)
          ? { max: Number(field.fieldConfig?.maxLength), type: 'string' as const }
          : {},
      ].filter((r) => Object.keys(r).length > 0)}
      initialValue={field.defaultValue}
    >
      <PreviewControl
        field={field}
        onCategorySelect={
          field.fieldType === 'CATEGORY' && siblingCodes?.includes('class_number')
            ? (_id, alias) => {
                if (!alias) return;
                if (repeatCode != null && namePath && namePath.length >= 1) {
                  form.setFieldValue([repeatCode, namePath[0], 'class_number'], alias);
                } else {
                  form.setFieldValue('class_number', alias);
                }
              }
            : undefined
        }
      />
    </Form.Item>
  );
}

function PreviewClassificationRow({
  fieldCode,
  itemName,
  index,
  childFields,
  locale,
  siteId,
  hasClassCompose,
  composeConfig,
  atMax,
  atMin,
  itemCount,
  minItems,
  onCopy,
  onRemove,
}: {
  fieldCode: string;
  itemName: number;
  index: number;
  childFields: FieldDef[];
  locale: string;
  siteId: string;
  hasClassCompose: boolean;
  composeConfig: ReturnType<typeof findComposeConfig>;
  atMax: boolean;
  atMin: boolean;
  itemCount: number;
  minItems: number;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const { enabled, visibility, visibleChildren } = useClassificationRoleVisibility(
    siteId,
    fieldCode,
    itemName,
    childFields,
  );
  return (
    <div className="model-preview-repeat-item">
      <div className="model-preview-repeat-item-head">
        <Typography.Text strong>{t('第')} {index + 1}  {t('项')}</Typography.Text>
        <Space size={4}>
          <Tooltip title={t('复制此项')}>
            <Button type="text" size="small" icon={<CopyOutlined />} disabled={atMax} onClick={onCopy} />
          </Tooltip>
          <Tooltip title={atMin ? `至少保留 ${minItems} 项` : t('删除此项')}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={atMin || itemCount <= 1}
              onClick={onRemove}
            />
          </Tooltip>
        </Space>
      </div>
      <ClassificationVisibilityHint enabled={enabled} visibility={visibility} />
      {hasClassCompose && (
        <ClassificationAutoCompose
          siteId={siteId}
          repeatCode={fieldCode}
          rowIndex={itemName}
          childFields={childFields}
          composeConfig={composeConfig}
        />
      )}
      <Row gutter={[12, 0]}>
        {visibleChildren.map((child) => (
          <Col key={child.code} xs={24} md={visibleChildren.length === 1 ? 24 : 12}>
            <PreviewFieldItem
              field={child}
              locale={locale}
              namePath={[itemName, child.code]}
              repeatCode={fieldCode}
              siblingCodes={visibleChildren.map((c) => c.code)}
            />
          </Col>
        ))}
        {visibleChildren.length === 0 && (
          <Col span={24}>
            <Typography.Text type="secondary">{t('此重复组尚无子字段')}</Typography.Text>
          </Col>
        )}
      </Row>
    </div>
  );
}

function PreviewRepeatGroup({
  field,
  childFields,
  locale,
  listName,
}: {
  field: FieldDef;
  childFields: FieldDef[];
  locale: string;
  /** Optional nested Form.List path (e.g. under COMPONENT_REF fieldValues). */
  listName?: (string | number)[];
}) {
  const form = Form.useFormInstance();
  const minItems = Math.max(0, Number(field.fieldConfig?.minItems) || 0);
  const maxRaw = Number(field.fieldConfig?.maxItems);
  const maxItems = Number.isFinite(maxRaw) ? maxRaw : -1;
  const title = formatRepeatGroupLabel(field);
  const initialRows = Math.max(minItems, 1);
  const { siteId } = useSite();
  const composeConfig = findComposeConfig(field.fieldConfig as Record<string, unknown> | undefined);
  const hasClassCompose = childFields.some((c) => c.code === 'class_number');
  const formListName = listName && listName.length ? listName : field.code;

  return (
    <Card
      size="small"
      type="inner"
      className="model-preview-repeat"
      title={
        <Space>
          <BarsOutlined />
          <span>{title}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            {field.code}
          </Typography.Text>
        </Space>
      }
    >
      <Form.List
        name={formListName}
        initialValue={Array.from({ length: initialRows }, () => ({}))}
      >
        {(items, { add, remove }) => {
          const atMax = maxItems >= 0 && items.length >= maxItems;
          const atMin = items.length <= minItems;
          return (
            <div className="model-preview-repeat-list">
              {items.map((item, index) =>
                siteId ? (
                  <PreviewClassificationRow
                    key={item.key}
                    fieldCode={field.code}
                    itemName={item.name}
                    index={index}
                    childFields={childFields}
                    locale={locale}
                    siteId={siteId}
                    hasClassCompose={hasClassCompose}
                    composeConfig={composeConfig}
                    atMax={atMax}
                    atMin={atMin}
                    itemCount={items.length}
                    minItems={minItems}
                    onCopy={() => {
                      const path = Array.isArray(formListName)
                        ? [...formListName, item.name]
                        : [formListName, item.name];
                      const current = form.getFieldValue(path) || {};
                      add({ ...current }, index + 1);
                    }}
                    onRemove={() => remove(item.name)}
                  />
                ) : (
                  <div key={item.key} className="model-preview-repeat-item">
                    <Row gutter={[12, 0]}>
                      {childFields.map((child) => (
                        <Col key={child.code} xs={24} md={12}>
                          <PreviewFieldItem
                            field={child}
                            locale={locale}
                            namePath={[item.name, child.code]}
                            repeatCode={field.code}
                            siblingCodes={childFields.map((c) => c.code)}
                          />
                        </Col>
                      ))}
                    </Row>
                  </div>
                ),
              )}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                disabled={atMax}
                onClick={() => add({})}
              >
                {atMax ? `已达上限（${maxItems}）` : `添加${title}`}
              </Button>
            </div>
          );
        }}
      </Form.List>
    </Card>
  );
}

function previewableComponentFields(ct: ContentType | undefined): FieldDef[] {
  if (!ct?.fields?.length) return [];
  return [...ct.fields]
    .filter((f) => !['title_s', 'url_s', 'template_s'].includes(f.code))
    .filter((f) => !f.isSystem)
    .filter((f) => !isNestedRepeatChild(f))
    .filter((f) => !STRUCTURAL.has(f.fieldType) || f.fieldType === 'REPEAT_GROUP')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

const MAX_COMPONENT_PREVIEW_DEPTH = 5;

function PreviewComponentRef({
  field,
  locale,
  namePath,
  depth = 0,
}: {
  field: FieldDef;
  locale: string;
  /** Form.List name path for this COMPONENT_REF (default: field.code). */
  namePath?: (string | number)[];
  depth?: number;
}) {
  const form = Form.useFormInstance();
  const { siteId } = useSite();
  const cfg = field.fieldConfig || {};
  const allowed = useMemo(
    () => (Array.isArray(cfg.allowedComponentTypes) ? (cfg.allowedComponentTypes as string[]) : []).filter(Boolean),
    [cfg.allowedComponentTypes],
  );
  const minItems = Math.max(0, Number(cfg.minItems) || 0);
  const maxRaw = cfg.maxItems;
  const maxItems =
    maxRaw === null || maxRaw === undefined || maxRaw === ''
      ? -1
      : Number(maxRaw);
  const listName = namePath && namePath.length ? namePath : field.code;
  const listNameAbs = useMemo(
    () => (Array.isArray(listName) ? listName : [listName]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listName may be string | array
    [Array.isArray(listName) ? listName.join('.') : listName],
  );
  const bindingMode = String(cfg.bindingMode || 'EMBEDDED');

  const [typeMap, setTypeMap] = useState<Record<string, ContentType>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    setSeeded(false);
  }, [listNameAbs.join('.')]);

  useEffect(() => {
    if (!siteId || allowed.length === 0) {
      setTypeMap({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const list = await modelsApi.list(siteId);
        const byCode = new Map(list.map((t) => [t.code, t]));
        const next: Record<string, ContentType> = {};
        await Promise.all(
          allowed.map(async (code) => {
            const meta = byCode.get(code);
            if (!meta) return;
            const detail = await modelsApi.get(siteId, meta.id);
            next[code] = detail;
          }),
        );
        if (!cancelled) setTypeMap(next);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, allowed.join('|')]);

  // Auto-seed nested component instances so preview shows embedded structure
  useEffect(() => {
    if (loading || seeded || allowed.length === 0 || depth >= MAX_COMPONENT_PREVIEW_DEPTH) return;
    const current = form.getFieldValue(listNameAbs);
    if (Array.isArray(current) && current.length > 0) {
      setSeeded(true);
      return;
    }
    const defaultCode = allowed.find((c) => typeMap[c]) || allowed[0];
    const detail = typeMap[defaultCode];
    if (!detail && Object.keys(typeMap).length === 0 && !loadError) return;
    if (!detail) {
      setSeeded(true);
      return;
    }
    const seedCount = Math.max(minItems > 0 ? minItems : 1, 1);
    const capped = maxItems >= 0 ? Math.min(seedCount, Math.max(maxItems, 1)) : seedCount;
    const stubs = Array.from({ length: capped }, (_, order) => ({
      componentType: defaultCode,
      componentTypeId: detail.id,
      order,
      fieldValues: {},
    }));
    form.setFieldValue(listNameAbs, stubs);
    setSeeded(true);
  }, [loading, seeded, allowed, typeMap, loadError, listNameAbs, minItems, maxItems, depth, form]);

  if (depth >= MAX_COMPONENT_PREVIEW_DEPTH) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`${field.name}：嵌套深度已达上限（${MAX_COMPONENT_PREVIEW_DEPTH}）`}
      />
    );
  }

  if (!allowed.length) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`${field.name}（${field.code}）未配置 allowedComponentTypes`}
      />
    );
  }

  return (
    <Collapse
      className="model-preview-component"
      size="small"
      defaultActiveKey={['main']}
      items={[
        {
          key: 'main',
          label: (
            <Space wrap>
              <AppstoreOutlined />
              <span>{field.name}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                {field.code}
              </Typography.Text>
              <Tag>{bindingMode === 'SHARED' ? t('共享') : t('嵌入')}</Tag>
              {allowed.length === 1 ? (
                <Tag color="purple">{allowed[0]}</Tag>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  
                  {t('可选')} {allowed.length}  {t('种组件')}
                </Typography.Text>
              )}
            </Space>
          ),
          children: (
            <>
              {loading && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <Spin tip={t('加载嵌套组件模型…')} />
                </div>
              )}
              {loadError && (
                <Alert type="error" showIcon message={`加载失败：${loadError}`} style={{ marginBottom: 8 }} />
              )}
              {!loading && (
                <Form.List name={listNameAbs}>
                  {(items, { add, remove }) => {
                    const atMax = maxItems >= 0 && items.length >= maxItems;
                    const atMin = items.length <= minItems;
                    return (
                      <div className="model-preview-component-list">
                        {items.map((item, index) => (
                          <PreviewComponentInstance
                            key={item.key}
                            field={field}
                            itemName={item.name}
                            index={index}
                            locale={locale}
                            depth={depth}
                            allowed={allowed}
                            typeMap={typeMap}
                            listNameAbs={listNameAbs}
                            atMax={atMax}
                            atMin={atMin}
                            itemCount={items.length}
                            minItems={minItems}
                            defaultExpanded={depth < 2}
                            onRemove={() => remove(item.name)}
                            onCopy={() => {
                              const cur = form.getFieldValue([...listNameAbs, item.name]) || {};
                              add({ ...cur, fieldValues: { ...(cur.fieldValues || {}) } }, index + 1);
                            }}
                          />
                        ))}
                        <Button
                          type="dashed"
                          block
                          icon={<PlusOutlined />}
                          disabled={atMax || allowed.every((c) => !typeMap[c])}
                          onClick={() => {
                            const code = allowed.find((c) => typeMap[c]) || allowed[0];
                            add({
                              componentType: code,
                              componentTypeId: typeMap[code]?.id,
                              order: items.length,
                              fieldValues: {},
                            });
                          }}
                        >
                          {atMax
                            ? `已达上限（${maxItems}）`
                            : `添加${field.name}${allowed.length > 1 ? t('（默认首个类型）') : ''}`}
                        </Button>
                      </div>
                    );
                  }}
                </Form.List>
              )}
            </>
          ),
        },
      ]}
    />
  );
}

function PreviewComponentInstance({
  itemName,
  index,
  locale,
  depth,
  allowed,
  typeMap,
  listNameAbs,
  atMax,
  atMin,
  itemCount,
  minItems,
  defaultExpanded = true,
  onRemove,
  onCopy,
}: {
  field: FieldDef;
  itemName: number;
  index: number;
  locale: string;
  depth: number;
  allowed: string[];
  typeMap: Record<string, ContentType>;
  listNameAbs: (string | number)[];
  atMax: boolean;
  atMin: boolean;
  itemCount: number;
  minItems: number;
  defaultExpanded?: boolean;
  onRemove: () => void;
  onCopy: () => void;
}) {
  const form = Form.useFormInstance();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const absoluteItemPath = useMemo(() => [...listNameAbs, itemName], [listNameAbs, itemName]);
  const typePath = useMemo(() => [...absoluteItemPath, 'componentType'], [absoluteItemPath]);
  const componentType = Form.useWatch(typePath, form) as string | undefined;
  const activeCode = componentType && allowed.includes(componentType) ? componentType : allowed[0];
  const ct = typeMap[activeCode];
  const childFields = previewableComponentFields(ct);
  // Relative to this Form.List
  const relativeValuesPrefix = useMemo(() => [itemName, 'fieldValues'] as (string | number)[], [itemName]);

  return (
    <div className={`model-preview-component-item${expanded ? '' : ' is-collapsed'}`}>
      <div className="model-preview-component-item-head">
        <Space wrap style={{ flex: 1, minWidth: 0 }}>
          <Tooltip title={expanded ? t('收起') : t('展开')}>
            <Button
              type="text"
              size="small"
              icon={expanded ? <DownOutlined /> : <RightOutlined />}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            />
          </Tooltip>
          <Typography.Text
            strong
            className="model-preview-component-item-title"
            onClick={() => setExpanded((v) => !v)}
            style={{ cursor: 'pointer' }}
          >
            {ct?.name || activeCode || t('组件')} #{index + 1}
          </Typography.Text>
          {allowed.length > 1 ? (
            <Select
              size="small"
              style={{ minWidth: 220 }}
              value={activeCode}
              options={allowed.map((code) => ({
                value: code,
                label: typeMap[code] ? `${typeMap[code].name}（${code}）` : code,
                disabled: !typeMap[code],
              }))}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(code) => {
                form.setFieldValue(typePath, code);
                form.setFieldValue([...absoluteItemPath, 'componentTypeId'], typeMap[code]?.id);
                form.setFieldValue([...absoluteItemPath, 'fieldValues'], {});
              }}
            />
          ) : (
            <Tag color="purple">{activeCode}</Tag>
          )}
          {!expanded && childFields.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {childFields.length}  {t('个字段已收起')}
            </Typography.Text>
          )}
        </Space>
        <Space size={4}>
          <Tooltip title={t('复制此项')}>
            <Button type="text" size="small" icon={<CopyOutlined />} disabled={atMax} onClick={onCopy} />
          </Tooltip>
          <Tooltip title={atMin ? `至少保留 ${minItems} 项` : t('删除此项')}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={atMin || itemCount <= 1}
              onClick={onRemove}
            />
          </Tooltip>
        </Space>
      </div>
      {expanded && (
        <div className="model-preview-component-item-body">
          {!ct && (
            <Alert type="warning" showIcon message={`未找到组件类型：${activeCode}`} style={{ marginBottom: 8 }} />
          )}
          {ct && childFields.length === 0 && (
            <Typography.Text type="secondary">{t('该组件暂无预览字段')}</Typography.Text>
          )}
          {ct && childFields.length > 0 && (
            <Row gutter={[12, 0]}>
              {childFields.map((child) => {
                if (child.fieldType === 'COMPONENT_REF') {
                  return (
                    <Col key={child.code} span={24}>
                      <PreviewComponentRef
                        field={child}
                        locale={locale}
                        depth={depth + 1}
                        namePath={[...absoluteItemPath, 'fieldValues', child.code]}
                      />
                    </Col>
                  );
                }
                if (child.fieldType === 'REPEAT_GROUP') {
                  return (
                    <Col key={child.code} span={24}>
                      <PreviewRepeatGroup
                        field={child}
                        childFields={repeatChildrenOf(ct.fields || [], child.code)}
                        locale={locale}
                        listName={[...absoluteItemPath, 'fieldValues', child.code]}
                      />
                    </Col>
                  );
                }
                return (
                  <Col key={child.code} xs={24} md={childFields.length === 1 ? 24 : 12}>
                    <PreviewFieldItem
                      field={child}
                      locale={locale}
                      namePath={[...relativeValuesPrefix, child.code]}
                    />
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewCodeSlot({
  code,
  fields,
  fieldsByCode,
  locale,
}: {
  code: string;
  fields: FieldDef[];
  fieldsByCode: Map<string, FieldDef>;
  locale: string;
}) {
  const field = fieldsByCode.get(code);
  if (!field || isNestedRepeatChild(field)) return null;
  if (field.fieldType === 'REPEAT_GROUP') {
    return (
      <PreviewRepeatGroup
        field={field}
        childFields={repeatChildrenOf(fields, field.code)}
        locale={locale}
      />
    );
  }
  if (field.fieldType === 'COMPONENT_REF') {
    return <PreviewComponentRef field={field} locale={locale} depth={0} />;
  }
  if (STRUCTURAL.has(field.fieldType)) return null;
  return <PreviewFieldItem field={field} locale={locale} />;
}

function Preview({ fields, blocks }: { fields: FieldDef[]; blocks: CanvasBlock[] }) {
  const [form] = Form.useForm();
  const [locale, setLocale] = useState('zh-CN');
  const fieldsByCode = useMemo(() => new Map(fields.map((f) => [f.code, f])), [fields]);

  const renderPreviewBlock = (block: CanvasBlock, key: string): React.ReactNode => {
    if (block.kind === 'DIVIDER') {
      return (
        <Divider key={key} className="model-preview-divider" plain>
          {t('分隔线')}
        </Divider>
      );
    }
    if (block.kind === 'ROW') return renderRow(block.row, key);
    return (
      <Tabs
        key={key}
        className="model-preview-tabs"
        items={block.tabs.map((tab, tabIndex) => ({
          key: tab.id,
          label: tab.title || `Tab ${tabIndex + 1}`,
          children: (
            <div className="model-preview-layout">
              {tab.rows.map((row, rowIndex) =>
                renderRow(row, `${tab.id}_${row.id}`, `行 ${rowIndex + 1}`),
              )}
            </div>
          ),
        }))}
      />
    );
  };

  const renderRow = (row: CanvasRow, key: string, title?: string) => {
    const hasContent = row.columns.some((c) => c.fieldCodes.length > 0 || Boolean(c.blocks?.length));
    if (!hasContent) return null;
    const sectionTitle = formatSectionLabel(row) || title;
    return (
      <Card key={key} size="small" className="model-preview-section" title={sectionTitle}>
        <Row gutter={[16, 8]}>
          {row.columns.map((col) => (
            <Col key={col.id} xs={24} md={Math.min(24, Math.max(1, (col.span || 1) * 2))}>
              {col.fieldCodes.map((code) => (
                <PreviewCodeSlot
                  key={code}
                  code={code}
                  fields={fields}
                  fieldsByCode={fieldsByCode}
                  locale={locale}
                />
              ))}
              {(col.blocks || []).map((b) => renderPreviewBlock(b, `${col.id}_${b.id}`))}
            </Col>
          ))}
        </Row>
      </Card>
    );
  };

  return (
    <Card
      title={
        <Space>
          
          {t('表单预览')}
          <Select size="small" value={locale} onChange={setLocale} options={['zh-CN', 'en-US'].map((value) => ({ value }))} />
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={() => message.success(t('预览数据校验通过'))}>
        <div className="model-preview-layout">
          {blocks.map((block, blockIndex) =>
            block.kind === 'ROW'
              ? renderRow(block.row, block.id, `分区 ${blockIndex + 1}`)
              : renderPreviewBlock(block, block.id),
          )}
          {!blocks.length && (
            <Empty description={t('画布为空，请先在设计页签添加字段')} />
          )}
        </div>
        <Button type="primary" htmlType="submit" style={{ marginTop: 16 }}>
          
          {t('验证测试数据')}
        </Button>
      </Form>
    </Card>
  );
}

export default function ModelsPage() {
  return (
    <RequireSite>
      <ModelsInner />
    </RequireSite>
  );
}
