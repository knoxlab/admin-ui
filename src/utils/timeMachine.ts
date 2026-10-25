import type { Category, TimeMachineSnapshot, TimeMachineSnapshotItem } from '../api/types';

/** 栏目树里的一个可选节点（时间机器左栏；栏目本身没有版本，展示的是当前栏目树）。 */
export interface CategoryTreeOption {
  key: string;
  title: string;
  children?: CategoryTreeOption[];
}
/**
 * FR-CV-VER-009：把栏目树转成左栏 `Tree` 需要的节点结构。
 *
 * <p>栏目**没有版本表**，时间机器只能给出当前栏目树（界面按只读渲染，不提供任何增删改入口）；
 * 因此这里不做历史还原，也不隐藏「当时还不存在的栏目」——内容列表里那条内容会落在它**当前**所属的
 * 栏目下，这一点在界面上以「栏目为当前值」的说明标注。</p>
 */
export function categoryTreeOptions(cats: Category[] = []): CategoryTreeOption[] {
  return cats.map((c) => ({
    key: c.id,
    title: c.name,
    children: c.children?.length ? categoryTreeOptions(c.children) : undefined,
  }));
}

/**
 * 全部栏目 id（含各级）。用于左栏**受控展开**：栏目是异步到达的，`defaultExpandAll` 只在首次挂载
 * 生效，等数据回来时节点已经渲染过了，新挂上的子节点不会被展开——不显式控制就会出现「点进来只看到
 * 一个折叠的根节点」。
 */
export function allCategoryKeys(cats: Category[] = []): string[] {
  const keys: string[] = [];
  const walk = (nodes: Category[]) => {
    for (const node of nodes) {
      keys.push(node.id);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(cats);
  return keys;
}

/**
 * 选中栏目的内容范围：该栏目**及其子树**（与内容页「选父栏目看子栏目内容」的直觉一致）。
 * 未选栏目（`null`/空）时返回 `null`，调用方据此表示「不按栏目过滤」。
 */
export function categoryScopeIds(cats: Category[] = [], selectedId?: string | null): Set<string> | null {
  if (!selectedId) return null;
  const scope = new Set<string>();
  const walk = (nodes: Category[], inside: boolean) => {
    for (const node of nodes) {
      const hit = inside || node.id === selectedId;
      if (hit) scope.add(node.id);
      if (node.children?.length) walk(node.children, hit);
    }
  };
  walk(cats, false);
  return scope;
}

/** 内容列表的筛选条件。 */
export interface SnapshotFilter {
  /** 栏目范围（含子树）；`null` 表示不过滤栏目。 */
  categoryIds?: Set<string> | null;
  keyword?: string;
}

/**
 * FR-CV-VER-009：按栏目范围 + 关键词筛选快照内容。
 *
 * <p>关键词匹配标题 / 页面路径（大小写不敏感、首尾空白忽略）——历史快照里字段值可能是旧结构，
 * 用标题与路径检索比让用户记住当时的字段码更实际。空关键词不做过滤。</p>
 */
export function filterSnapshot(
  items: TimeMachineSnapshotItem[] = [],
  filter: SnapshotFilter = {},
): TimeMachineSnapshotItem[] {
  const keyword = (filter.keyword || '').trim().toLowerCase();
  return items.filter((item) => {
    if (filter.categoryIds && !(item.categoryId && filter.categoryIds.has(item.categoryId))) return false;
    if (!keyword) return true;
    const haystack = `${item.title || ''}\n${item.routePath || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });
}

/** 快照为空的原因，用于给出准确提示而不是笼统的「暂无数据」。 */
export type EmptySnapshotReason = 'no-content-in-site' | 'before-creation' | 'unknown';

/**
 * FR-CV-VER-009：空快照的归因。
 *
 * <p>规范要求「时间点早于内容创建时间」时给出提示。仅凭 `items` 为空无法区分「站点本来就没内容」
 * 与「那一刻还没有内容」，故后端回带 `earliestContentCreatedAt`：快照为空且该时间晚于所浏览的
 * 时间点时，才是真正的「该时间点早于内容创建时间」。两者都不会显示成错误——历史浏览是正常操作。</p>
 */
export function emptySnapshotReason(snapshot: Pick<TimeMachineSnapshot,
  'total' | 'earliestContentCreatedAt' | 'at'> | null | undefined): EmptySnapshotReason | null {
  if (!snapshot || snapshot.total > 0) return null;
  const earliest = snapshot.earliestContentCreatedAt;
  if (!earliest) return 'no-content-in-site';
  const earliestMs = Date.parse(earliest);
  const atMs = Date.parse(snapshot.at);
  if (Number.isNaN(earliestMs) || Number.isNaN(atMs)) return 'unknown';
  return earliestMs > atMs ? 'before-creation' : 'unknown';
}

/**
 * 每个栏目在**当前快照**里的内容条数，且父栏目包含其子树（与左栏点击后的筛选范围一致：
 * 选父栏目看到的是整棵子树的内容，节点上的计数必须等于点击后看到的条数，否则计数就是误导）。
 *
 * <p>只统计有栏目的条目；栏目 id 在快照里不存在（内容被移动到别处）时该栏目计数为 0。</p>
 */
export function subtreeCounts(cats: Category[] = [], items: TimeMachineSnapshotItem[] = []): Map<string, number> {
  const direct = countByCategory(items);
  const totals = new Map<string, number>();
  const walk = (nodes: Category[]): number => {
    let sum = 0;
    for (const node of nodes) {
      let own = direct.get(node.id) || 0;
      if (node.children?.length) own += walk(node.children);
      totals.set(node.id, own);
      sum += own;
    }
    return sum;
  };
  walk(cats);
  return totals;
}

/**
 * 时间点晚于「当前时刻」时，快照必然等于现在——不必拦，但要如实提示，
 * 否则用户会以为自己看到了历史（`true` 表示所选时间点在未来）。
 */
export function timePointInFuture(at: string | null | undefined, now: Date = new Date()): boolean {
  if (!at) return false;
  const atMs = Date.parse(at);
  return !Number.isNaN(atMs) && atMs > now.getTime();
}

/** 快照内容按「直接所属栏目」的条数汇总（不含子树；对外的节点计数见 {@link subtreeCounts}）。 */
function countByCategory(items: TimeMachineSnapshotItem[] = []): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.categoryId) continue;
    counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1);
  }
  return counts;
}
