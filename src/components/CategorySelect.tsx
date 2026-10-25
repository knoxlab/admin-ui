import { useEffect, useMemo, useState } from 'react';
import { TreeSelect, Typography } from 'antd';
import { categoriesApi } from '../api';
import type { Category } from '../api/types';
import { t } from '../i18n/locale';

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

function findCat(cats: Category[], id: string): Category | undefined {
  return flattenCats(cats).find((c) => c.id === id);
}

function toTreeSelectData(
  nodes: Category[],
  maxDepth?: number,
  depth = 0,
): { title: string; value: string; children?: ReturnType<typeof toTreeSelectData> }[] {
  if (maxDepth != null && depth > maxDepth) return [];
  return nodes.map((n) => ({
    title: n.pathAlias ? `${n.pathAlias} ${n.name}` : n.name,
    value: n.id,
    children: n.children?.length ? toTreeSelectData(n.children, maxDepth, depth + 1) : undefined,
  }));
}

export type CategorySelectProps = {
  siteId: string;
  disabled?: boolean;
  value?: string | string[];
  taxonomyRoot?: string;
  maxDepth?: number;
  singleSelect?: boolean;
  placeholder?: string;
  onChange?: (id: string | string[] | undefined, pathAlias?: string) => void;
};

/** CATEGORY 字段：按 taxonomyRoot 限定的分类树选择。 */
export default function CategorySelect({
  siteId,
  disabled,
  value,
  taxonomyRoot,
  maxDepth,
  singleSelect = true,
  placeholder = t('从分类法选择'),
  onChange,
}: CategorySelectProps) {
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    void categoriesApi
      .tree(siteId)
      .then((all) => {
        if (taxonomyRoot) {
          const sub = findCat(all, taxonomyRoot);
          setTree(sub?.children?.length ? sub.children : sub ? [sub] : []);
        } else {
          setTree(all);
        }
      })
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [siteId, taxonomyRoot]);

  const flat = useMemo(() => flattenCats(tree), [tree]);
  const treeData = useMemo(() => toTreeSelectData(tree, maxDepth), [tree, maxDepth]);

  return (
    <div>
    <TreeSelect
      style={{ width: '100%' }}
      disabled={disabled || !siteId}
      loading={loading}
      allowClear
      showSearch
      treeDefaultExpandAll={false}
      treeNodeFilterProp="title"
      placeholder={siteId ? placeholder : t('请先选择站点')}
      value={Array.isArray(value) ? value : (value || undefined)}
      treeData={treeData}
      multiple={!singleSelect}
      onChange={(v) => {
        if (Array.isArray(v)) {
          onChange?.(v.map(String));
          return;
        }
        const id = (v as string | undefined) || undefined;
        const cat = id ? flat.find((c) => c.id === id) : undefined;
        onChange?.(id, cat?.pathAlias);
      }}
    />
    {!loading && siteId && treeData.length === 0 && (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('还没有分类。请先在内容模型的分类管理中建立分类。')}
      </Typography.Text>
    )}
    </div>
  );
}
