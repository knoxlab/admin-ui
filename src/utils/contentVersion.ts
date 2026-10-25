import { t } from '../i18n/locale';
import type { ContentVersion, FieldDef } from '../api/types';

/**
 * FR-CV-VER-001/003：条目级系统字段在「查看版本」「版本对比」里的展示名。
 *
 * <p>后端把标题 / 页面路径 / 页面模板存在内容条目（并自 `V100` 起随版本落快照），
 * 而不是放在 `field_values` 里，所以这三个键不会出现在模型字段定义中，必须显式映射。</p>
 */
export const ITEM_FIELD_LABELS: Record<string, string> = {
  title: '标题',
  routePath: '页面路径',
  templatePath: '页面模板',
};

/** 字段码 → 展示名：条目级系统字段走固定映射，其余按当前模型字段定义解析，兜底回字段码。 */
export function versionFieldLabel(code: string, fields: FieldDef[] = []): string {
  const itemKey = ITEM_FIELD_LABELS[code];
  if (itemKey) return t(itemKey);
  return fields.find((f) => f.code === code)?.name || code;
}

/** 「查看版本」表格的一行：字段码 + 展示名 + 可读值。 */
export interface VersionSnapshotRow {
  code: string;
  label: string;
  text: string;
}

/**
 * 把某个版本的 `field_values` 摊平成「字段 → 展示值」行，用于只读查看历史版本（FR-CV-VER-001/003）。
 *
 * <p>复合值（重复组 / 嵌套组）保持 JSON 原样展示——它们的子字段不在顶层，强行套用字段标签
 * 反而会误导。JSON 解析失败时退化为展示原始串，保证历史脏数据不会让弹窗直接空掉。</p>
 */
export function versionSnapshotRows(
  version: Pick<ContentVersion, 'fieldValues'>,
  fields: FieldDef[] = [],
): VersionSnapshotRow[] {
  let parsed: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(version.fieldValues || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch {
    return [{ code: '__raw__', label: t('原始数据'), text: version.fieldValues || '' }];
  }
  return Object.entries(parsed).map(([code, value]) => ({
    code,
    label: versionFieldLabel(code, fields),
    text:
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value),
  }));
}

/** 对比区间（`from` 早于 `to`）。 */
export interface VersionDiffRange {
  from: number;
  to: number;
}

/** 版本链上的一行：对比只需要版本号与来源版本号。 */
export type VersionChainRow = Pick<ContentVersion, 'version' | 'revertedFrom'>;
/**
 * OBS-11-10：解析某行「来源版本」——只有来源版本**确实存在于版本链**且不等于自身时才有效。
 *
 * <p>恢复产生的版本把来源版本号落库（`reverted_from`），但历史脏数据、跨内容条目复制或
 * 版本被清理后都可能留下悬空引用；直接拿它当对比区间会拉到 404 的 diff，故这里做一次收敛。</p>
 */
export function resolveRevertedFrom(
  row: Pick<ContentVersion, 'version' | 'revertedFrom'>,
  chain: Pick<ContentVersion, 'version'>[] = [],
): number | null {
  const source = row.revertedFrom;
  if (typeof source !== 'number' || !Number.isInteger(source)) return null;
  if (source === row.version) return null;
  if (!chain.some((v) => v.version === source)) return null;
  return source;
}

/**
 * OBS-11-10：版本对比弹窗的默认区间。
 *
 * <p>最新版本若由恢复产生，默认「来源版本 → 新版本」（核对恢复是否忠实还原来源快照）；
 * 其余情况维持「上一版本 → 新版本」。版本少于两个时无区间可比，返回 `null`。</p>
 */
export function defaultDiffRange(rows: VersionChainRow[] = []): VersionDiffRange | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.version - b.version);
  const newest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const source = resolveRevertedFrom(newest, sorted);
  if (source !== null) return { from: source, to: newest.version };
  return { from: previous.version, to: newest.version };
}

/**
 * OBS-11-10：某一行的对比区间（行内「与来源版本对比」入口）——非恢复版本返回 `null`。
 */
export function diffRangeWithSource(
  row: Pick<ContentVersion, 'version' | 'revertedFrom'>,
  chain: Pick<ContentVersion, 'version'>[] = [],
): VersionDiffRange | null {
  const source = resolveRevertedFrom(row, chain);
  return source === null ? null : { from: source, to: row.version };
}

/**
 * 规范 §15.2「与指定版本对比」：以该行为起点、链上最新版本为终点打开对比弹窗。
 *
 * <p>与 {@link diffRangeWithSource} 的区别是「不要求该行由恢复产生」——任意版本都能作为
 * 起点发起对比，之后的区间仍可在弹窗里改选。行本身已是链上最新版本时返回 `null`
 * （自己跟自己对比没有意义），链上只有一个版本时同样返回 `null`。</p>
 */
export function diffRangeFromVersion(
  row: Pick<ContentVersion, 'version'>,
  chain: Pick<ContentVersion, 'version'>[] = [],
): VersionDiffRange | null {
  if (chain.length < 2) return null;
  const newest = chain.reduce(
    (max, v) => (v.version > max ? v.version : max),
    chain[0].version,
  );
  if (newest <= row.version) return null;
  return { from: row.version, to: newest };
}

/** 规范 §15.4「模型变更」提示的信息载体。 */
export interface ModelVersionChange {
  from: number;
  fromModelVersion: number;
  to: number;
  toModelVersion: number;
}/**
 * 规范 §15.4：对比区间两端的内容**模型版本**不一致时给出提示。
 *
 * <p>模型改版（字段增删/重命名）会让字段级 diff 出现「一侧不存在」的噪声行，界面上必须先
 * 说明「模型变了」，否则用户会把模型差异误读成内容差异。区间不完整或两端模型版本相同时
 * 返回 `null`（无需提示）。</p>
 */
export function modelVersionChange(
  rows: Pick<ContentVersion, 'version' | 'modelVersion'>[] = [],
  from: number | null = null,
  to: number | null = null,
): ModelVersionChange | null {
  if (from === null || to === null) return null;
  const before = rows.find((v) => v.version === from);
  const after = rows.find((v) => v.version === to);
  if (!before || !after) return null;
  if (before.modelVersion === after.modelVersion) return null;
  return {
    from,
    fromModelVersion: before.modelVersion,
    to,
    toModelVersion: after.modelVersion,
  };
}

/** FR-CV-VER-006：版本时间线每页条数（规范 §15.1「加载更多」）。 */
export const VERSION_PAGE_SIZE = 20;

/** 规范 §15.1 时间线的分页结果。 */
export interface VersionPage<T> {
  rows: T[];
  hasMore: boolean;
}

/**
 * FR-CV-VER-006：时间线分页——只暴露前 `shownCount` 行，并告知是否还有下一页。
 *
 * <p>`shownCount` 小于等于 0 时按第一页处理（避免「加载更多」按钮被连点或因状态初始化为 0
 * 而渲染出空时间线）；行数不超过一页时不展示「加载更多」。</p>
 */
export function sliceVersionPage<T>(
  rows: T[] = [],
  shownCount: number = VERSION_PAGE_SIZE,
  pageSize: number = VERSION_PAGE_SIZE,
): VersionPage<T> {
  const size = pageSize > 0 ? pageSize : VERSION_PAGE_SIZE;
  const shown = shownCount > 0 ? shownCount : size;
  return { rows: rows.slice(0, shown), hasMore: rows.length > shown };
}

/**
 * FR-CV-VER-007「与前一版本对比」：该行 → 其前一版本（`from` 是较旧的一侧）。
 *
 * <p>链上最早的一行没有前一版本，此时以「空版本 0」为起点——后端把 `fromVersion=0` 定义为
 * 「与空版本比较、全部字段为 ADDED」，正好回答「这个版本最初创建了什么」，而不是禁用入口。</p>
 */
export function diffRangeWithPrevious(
  row: Pick<ContentVersion, 'version'>,
  chain: Pick<ContentVersion, 'version'>[] = [],
): VersionDiffRange {
  const older = chain
    .map((v) => v.version)
    .filter((v) => v < row.version)
    .sort((a, b) => b - a);
  return { from: older.length > 0 ? older[0] : 0, to: row.version };
}

/**
 * FR-CV-VER-007「与当前版本对比」：该行 → 内容当前版本；该行就是当前版本时返回 `null`。
 *
 * <p>区间方向固定为「较旧 → 较新」，所以选中历史行时是「该行 → 当前版本」，选中当前行
 * 自身时无意义（自己跟自己对比恒为 0 差异），由调用方据此禁用入口。</p>
 */
export function diffRangeWithCurrent(
  row: Pick<ContentVersion, 'version'>,
  currentVersion: number,
): VersionDiffRange | null {
  if (!Number.isInteger(currentVersion) || currentVersion === row.version) return null;
  return row.version < currentVersion
    ? { from: row.version, to: currentVersion }
    : { from: currentVersion, to: row.version };
}
