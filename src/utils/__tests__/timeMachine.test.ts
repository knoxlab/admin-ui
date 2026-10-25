import { describe, expect, it } from 'vitest';
import type { Category, TimeMachineSnapshotItem } from '../../api/types';
import {
  categoryScopeIds,
  categoryTreeOptions,
  emptySnapshotReason,
  filterSnapshot,
  subtreeCounts,
  timePointInFuture,
} from '../timeMachine';

const cat = (id: string, name: string, children?: Category[]): Category => ({
  id,
  name,
  pathAlias: name,
  sortOrder: 0,
  depth: children ? 0 : 1,
  children,
});

const tree: Category[] = [
  cat('news', '新闻', [cat('news-cn', '国内'), cat('news-intl', '国际')]),
  cat('video', '视频'),
];

const item = (id: string, title: string, categoryId?: string, routePath?: string): TimeMachineSnapshotItem => ({
  id,
  title,
  categoryId,
  routePath,
  version: 1,
  modelVersion: 1,
  versionCreatedAt: '2026-09-18T02:00:00Z',
  fieldValues: '{}',
});

describe('categoryTreeOptions', () => {
  it('保留层级，叶子节点不带 children 字段', () => {
    const options = categoryTreeOptions(tree);
    expect(options.map((o) => o.key)).toEqual(['news', 'video']);
    expect(options[0].children?.map((o) => o.key)).toEqual(['news-cn', 'news-intl']);
    expect(options[1].children).toBeUndefined();
  });

  it('空树返回空数组', () => {
    expect(categoryTreeOptions()).toEqual([]);
  });
});

describe('categoryScopeIds', () => {
  it('选父栏目时范围含整棵子树（与点击后看到的条数一致）', () => {
    expect([...categoryScopeIds(tree, 'news')!].sort()).toEqual(['news', 'news-cn', 'news-intl']);
  });

  it('选叶子栏目时只含自身', () => {
    expect([...categoryScopeIds(tree, 'news-cn')!]).toEqual(['news-cn']);
  });

  it('未选栏目返回 null（表示不按栏目过滤）', () => {
    expect(categoryScopeIds(tree, null)).toBeNull();
    expect(categoryScopeIds(tree, '')).toBeNull();
  });

  it('选中的栏目不在树上时返回空集合（列表为空，而不是回落成全量）', () => {
    expect(categoryScopeIds(tree, 'missing')!.size).toBe(0);
  });
});

describe('filterSnapshot', () => {
  const rows = [
    item('1', '夏季促销', 'news', '/news/summer'),
    item('2', '机房改造', 'news-cn', '/news/room'),
    item('3', '产品视频', 'video', '/video/intro'),
    item('4', '无栏目内容', undefined, '/misc'),
  ];

  it('按栏目子树过滤', () => {
    expect(filterSnapshot(rows, { categoryIds: categoryScopeIds(tree, 'news') }).map((r) => r.id))
      .toEqual(['1', '2']);
  });

  it('无栏目范围时只按关键词过滤', () => {
    expect(filterSnapshot(rows, { keyword: '促销' }).map((r) => r.id)).toEqual(['1']);
  });

  it('关键词同时匹配页面路径，且大小写不敏感、忽略首尾空白', () => {
    expect(filterSnapshot(rows, { keyword: '  /VIDEO/Intro ' }).map((r) => r.id)).toEqual(['3']);
  });

  it('空关键词不做过滤', () => {
    expect(filterSnapshot(rows, { keyword: '   ' })).toHaveLength(4);
  });

  it('栏目与关键词同时生效（交集）', () => {
    expect(filterSnapshot(rows, { categoryIds: categoryScopeIds(tree, 'news'), keyword: '机房' }).map((r) => r.id))
      .toEqual(['2']);
  });

  it('无栏目 id 的内容在指定栏目范围时被排除（不误归入任何栏目）', () => {
    expect(filterSnapshot(rows, { categoryIds: categoryScopeIds(tree, 'video') }).map((r) => r.id)).toEqual(['3']);
  });
});

describe('emptySnapshotReason', () => {
  it('有内容时无需归因', () => {
    expect(emptySnapshotReason({ total: 2, earliestContentCreatedAt: '2026-01-01T00:00:00Z', at: '2026-09-18T10:00:00Z' }))
      .toBeNull();
  });

  it('时间点早于站内最早内容创建时间 → 该时间点早于内容创建时间', () => {
    expect(emptySnapshotReason({
      total: 0,
      earliestContentCreatedAt: '2026-09-19T00:00:00Z',
      at: '2026-09-18T10:00:00Z',
    })).toBe('before-creation');
  });

  it('站点本就没有内容 → 与「早于创建」区分开', () => {
    expect(emptySnapshotReason({ total: 0, earliestContentCreatedAt: null, at: '2026-09-18T10:00:00Z' }))
      .toBe('no-content-in-site');
  });

  it('空快照但时间点不早于创建时间（条目已被删除等）→ 归为未知而不是误报', () => {
    expect(emptySnapshotReason({
      total: 0,
      earliestContentCreatedAt: '2026-09-01T00:00:00Z',
      at: '2026-09-18T10:00:00Z',
    })).toBe('unknown');
  });

  it('时间串无法解析时不误报为「早于创建」', () => {
    expect(emptySnapshotReason({ total: 0, earliestContentCreatedAt: 'not-a-date', at: '2026-09-18T10:00:00Z' }))
      .toBe('unknown');
  });

  it('快照缺失时返回 null', () => {
    expect(emptySnapshotReason(null)).toBeNull();
  });
});

describe('timePointInFuture', () => {
  it('未来时间点提示为真', () => {
    expect(timePointInFuture('2030-01-01T00:00:00Z', new Date('2026-09-18T10:00:00Z'))).toBe(true);
  });

  it('过去/当前时间点为假', () => {
    expect(timePointInFuture('2020-01-01T00:00:00Z', new Date('2026-09-18T10:00:00Z'))).toBe(false);
    expect(timePointInFuture('2026-09-18T10:00:00Z', new Date('2026-09-18T10:00:00Z'))).toBe(false);
  });

  it('缺失或非法值不提示', () => {
    expect(timePointInFuture(null)).toBe(false);
    expect(timePointInFuture('昨天')).toBe(false);
  });
});

describe('subtreeCounts', () => {
  it('父栏目计数含子树，与点击后的列表条数一致', () => {
    const counts = subtreeCounts(tree, [
      item('1', 'a', 'news'),
      item('2', 'b', 'news-cn'),
      item('3', 'c', 'news-cn'),
      item('4', 'd', 'video'),
    ]);
    expect(counts.get('news')).toBe(3);
    expect(counts.get('news-cn')).toBe(2);
    expect(counts.get('news-intl')).toBe(0);
    expect(counts.get('video')).toBe(1);
  });

  it('无栏目的内容不计入任何栏目', () => {
    const counts = subtreeCounts(tree, [item('1', 'a')]);
    expect([...counts.values()].every((v) => v === 0)).toBe(true);
  });
});
