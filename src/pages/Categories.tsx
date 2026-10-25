import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type Key, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Button,
  Breadcrumb,
  Col,
  Collapse,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  FolderAddOutlined,
  FolderOutlined,
  HolderOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { categoriesApi, modelsApi } from '../api';
import type { Category, ContentType } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import './Categories.css';
import { t } from '../i18n/locale';

const PATH_ALIAS_RE = /^[a-z0-9-]+$/;
const SIDER_WIDTH_KEY = 'powercms.categories.siderWidth';
const SIDER_COLLAPSED_KEY = 'powercms.categories.siderCollapsed';
const SIDER_MIN = 200;
const SIDER_MAX = 560;
const SIDER_DEFAULT = 280;

function readSiderWidth() {
  const raw = Number(localStorage.getItem(SIDER_WIDTH_KEY));
  if (!Number.isFinite(raw)) return SIDER_DEFAULT;
  return Math.min(SIDER_MAX, Math.max(SIDER_MIN, raw));
}

function readSiderCollapsed() {
  return localStorage.getItem(SIDER_COLLAPSED_KEY) === '1';
}

type DragHandleContextValue = {
  setActivatorNodeRef?: (el: HTMLElement | null) => void;
  listeners?: ReturnType<typeof useSortable>['listeners'];
  attributes?: ReturnType<typeof useSortable>['attributes'];
};

const DragHandleContext = createContext<DragHandleContextValue>({});

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

/** Ancestor chain from root to the given category (inclusive). */
function catAncestors(cats: Category[], id: string): Category[] {
  const map = new Map(flattenCats(cats).map((c) => [c.id, c]));
  const chain: Category[] = [];
  let cur = map.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return chain;
}

type ListRow = {
  id: string;
  parentId?: string;
  name: string;
  pathAlias: string;
  sortOrder: number;
  depth: number;
  childCount: number;
};

function DragHandle() {
  const { setActivatorNodeRef, listeners, attributes } = useContext(DragHandleContext);
  return (
    <Button
      type="text"
      size="small"
      className="cat-drag-handle"
      icon={<HolderOutlined />}
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function SortableBodyRow({ children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  const id = String((props as { 'data-row-key'?: string })['data-row-key'] || '');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 1, opacity: 0.72 } : {}),
  };
  return (
    <DragHandleContext.Provider value={{ setActivatorNodeRef, listeners, attributes }}>
      <tr {...props} ref={setNodeRef} style={style}>
        {children}
      </tr>
    </DragHandleContext.Provider>
  );
}

function CategoriesInner() {
  const { siteId } = useSite();
  const [cats, setCats] = useState<Category[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [rows, setRows] = useState<ListRow[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Category | null>(null);
  const [catParentId, setCatParentId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [siderWidth, setSiderWidth] = useState(readSiderWidth);
  const [siderCollapsed, setSiderCollapsed] = useState(readSiderCollapsed);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(SIDER_DEFAULT);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const loadCats = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [list, typeList] = await Promise.all([categoriesApi.tree(siteId), modelsApi.list(siteId)]);
      setCats(list);
      setTypes(typeList.filter((t) => t.status === 'PUBLISHED' || t.status === 'DRAFT'));
    } catch {
      message.error(t('加载分类失败'));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(
        SIDER_MAX,
        Math.max(SIDER_MIN, startWidthRef.current + (e.clientX - startXRef.current)),
      );
      setSiderWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.classList.remove('cat-resizing');
      setSiderWidth((w) => {
        localStorage.setItem(SIDER_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('cat-resizing');
    };
  }, []);

  const startResize = (e: ReactMouseEvent) => {
    if (siderCollapsed) return;
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = siderWidth;
    document.body.classList.add('cat-resizing');
  };

  const toggleSiderCollapsed = () => {
    setSiderCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDER_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    const parent = selectedCat ? findCat(cats, selectedCat) : null;
    const siblings = selectedCat ? parent?.children || [] : cats;
    setRows(
      siblings.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        pathAlias: c.pathAlias,
        sortOrder: c.sortOrder,
        depth: c.depth,
        childCount: c.children?.length ?? 0,
      })),
    );
    setSelectedRowKeys([]);
  }, [cats, selectedCat]);

  const openCreate = (parentId: string | null = selectedCat) => {
    setFormMode('create');
    setEditing(null);
    setCatParentId(parentId);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 10, inheritConfig: true });
    setFormOpen(true);
  };

  const openEdit = (cat: Category) => {
    setFormMode('edit');
    setEditing(cat);
    setCatParentId(cat.parentId || null);
    form.resetFields();
    form.setFieldsValue({
      name: cat.name,
      pathAlias: cat.pathAlias,
      sortOrder: cat.sortOrder,
      inheritConfig: true,
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    const v = await form.validateFields();
    if (formMode === 'create') {
      await categoriesApi.create(siteId!, {
        name: v.name,
        pathAlias: v.pathAlias,
        parentId: catParentId || undefined,
        sortOrder: v.sortOrder,
      });
      message.success(t('分类已创建'));
    } else if (editing) {
      await categoriesApi.update(editing.id, {
        name: v.name,
        pathAlias: v.pathAlias,
        sortOrder: v.sortOrder,
      });
      message.success(t('分类已更新'));
    }
    setFormOpen(false);
    await loadCats();
  };

  const removeOne = (cat: Category) => {
    Modal.confirm({
      title: `删除分类「${cat.name}」？`,
      content: t('将同时删除其子分类；若分类下仍有内容则无法删除。'),
      okType: 'danger',
      onOk: async () => {
        await categoriesApi.remove(cat.id);
        message.success(t('已删除'));
        if (selectedCat === cat.id) setSelectedCat(null);
        setSelectedRowKeys((keys) => keys.filter((k) => k !== cat.id));
        await loadCats();
      },
    });
  };

  const batchRemove = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: `批量删除 ${selectedRowKeys.length} 个分类？`,
      content: t('将同时删除其子分类；若分类下仍有内容则无法删除。'),
      okType: 'danger',
      onOk: async () => {
        const results = await Promise.allSettled(
          selectedRowKeys.map((id) => categoriesApi.remove(String(id))),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        const ok = results.length - failed;
        if (ok) message.success(`已删除 ${ok} 个分类`);
        if (failed) message.error(`${failed} 个分类删除失败（可能仍有内容）`);
        if (selectedCat && selectedRowKeys.includes(selectedCat)) setSelectedCat(null);
        setSelectedRowKeys([]);
        await loadCats();
      },
    });
  };

  const patchSortOrder = async (id: string, sortOrder: number | null) => {
    if (sortOrder == null || Number.isNaN(sortOrder)) return;
    try {
      await categoriesApi.update(id, { sortOrder });
      await loadCats();
    } catch {
      message.error(t('更新排序失败'));
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    try {
      await categoriesApi.reorder(siteId!, {
        parentId: selectedCat || null,
        orderedIds: next.map((r) => r.id),
      });
      message.success(t('排序已更新'));
      await loadCats();
    } catch {
      message.error(t('排序保存失败'));
      await loadCats();
    }
  };

  const treeData = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    const build = (list: Category[]): DataNode[] =>
      list
        .filter((c) => {
          if (!q) return true;
          const hit =
            c.name.toLowerCase().includes(q) ||
            (c.pathAlias || '').toLowerCase().includes(q) ||
            (c.children || []).some(function match(ch): boolean {
              return (
                ch.name.toLowerCase().includes(q) ||
                (ch.pathAlias || '').toLowerCase().includes(q) ||
                (ch.children || []).some(match)
              );
            });
          return hit;
        })
        .map((c) => {
          const menu: MenuProps['items'] = [
            {
              key: 'child',
              icon: <FolderAddOutlined />,
              label: t('创建子分类'),
              onClick: () => openCreate(c.id),
            },
            {
              key: 'edit',
              icon: <EditOutlined />,
              label: t('编辑'),
              onClick: () => openEdit(c),
            },
            { type: 'divider' },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              danger: true,
              label: t('删除'),
              onClick: () => removeOne(c),
            },
          ];
          return {
            key: c.id,
            title: (
              <div className="cat-tree-node">
                <Tooltip title={`${c.name}${c.pathAlias ? ` · /${c.pathAlias}` : ''}`}>
                  <span className="cat-tree-node-main">
                    <FolderOutlined className="cat-tree-node-icon" />
                    <span className="cat-tree-node-label">
                      <span className="cat-tree-node-name">{c.name}</span>
                      {c.pathAlias ? <span className="cat-tree-node-path">/{c.pathAlias}</span> : null}
                    </span>
                  </span>
                </Tooltip>
                <Dropdown menu={{ items: menu }} trigger={['click']}>
                  <Button
                    type="text"
                    size="small"
                    className="cat-tree-node-more"
                    icon={<EllipsisOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            ),
            children: c.children?.length ? build(c.children) : undefined,
          };
        });
    return build(cats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, treeFilter]);

  const selectedCatObj = selectedCat ? findCat(cats, selectedCat) : undefined;
  const breadcrumbPath = useMemo(
    () => (selectedCat ? catAncestors(cats, selectedCat) : []),
    [cats, selectedCat],
  );

  const columns: TableColumnsType<ListRow> = [
    {
      title: '',
      key: 'drag',
      width: 40,
      render: () => <DragHandle />,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, row) => (
        <Typography.Text
          strong
          className="cat-name-link"
          onClick={() => setSelectedCat(row.id)}
        >
          {name}
        </Typography.Text>
      ),
    },
    {
      title: 'Key',
      dataIndex: 'pathAlias',
      render: (v: string) => v || '—',
    },
    {
      title: 'Children',
      dataIndex: 'childCount',
      width: 100,
      align: 'center',
    },
    {
      title: 'Sort Order',
      dataIndex: 'sortOrder',
      width: 120,
      render: (v: number, row) => (
        <InputNumber
          size="small"
          min={0}
          value={v}
          className="cat-sort-input"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const next = Number((e.target as HTMLInputElement).value);
            if (next !== v) void patchSortOrder(row.id, next);
          }}
          onPressEnter={(e) => {
            const next = Number((e.target as HTMLInputElement).value);
            if (next !== v) void patchSortOrder(row.id, next);
          }}
        />
      ),
    },
    {
      title: t('操作'),
      key: 'actions',
      width: 72,
      align: 'center',
      render: (_, row) => {
        const menu: MenuProps['items'] = [
          { key: 'edit', icon: <EditOutlined />, label: t('编辑'), onClick: () => openEdit(row) },
          {
            key: 'child',
            icon: <FolderAddOutlined />,
            label: t('创建子分类'),
            onClick: () => openCreate(row.id),
          },
          { type: 'divider' },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: t('删除'),
            onClick: () => removeOne(row),
          },
        ];
        return (
          <Dropdown menu={{ items: menu }} trigger={['click']}>
            <Button type="text" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div className="cat-page">
      <div
        className={`cat-browse${siderCollapsed ? ' is-sider-collapsed' : ''}`}
        style={{
          gridTemplateColumns: siderCollapsed ? '48px 1fr' : `${siderWidth}px 12px 1fr`,
        }}
      >
        <aside className="cat-browse-sider">
          <div className="cat-sider-collapsed" hidden={!siderCollapsed}>
            <Tooltip title={t('展开分类树')} placement="right">
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                aria-label={t('展开分类树')}
                onClick={toggleSiderCollapsed}
              />
            </Tooltip>
            <Tooltip title={t('分类树')} placement="right">
              <Button
                type="text"
                icon={<FolderOutlined />}
                aria-label={t('分类树')}
                className="is-active"
                onClick={toggleSiderCollapsed}
              />
            </Tooltip>
          </div>
          <div className="cat-sider-body" hidden={siderCollapsed}>
            <div className="cat-side-toolbar">
              <Input.Search
                allowClear
                placeholder={t('搜索分类')}
                className="cat-side-search"
                onChange={(e) => setTreeFilter(e.target.value)}
              />
              <Tooltip title={t('收起分类树')}>
                <Button
                  type="text"
                  size="small"
                  className="cat-sider-collapse-btn"
                  icon={<MenuFoldOutlined />}
                  aria-label={t('收起分类树')}
                  onClick={toggleSiderCollapsed}
                />
              </Tooltip>
            </div>
            <div className="cat-side-scroll">
              <Tree
                showLine
                blockNode
                treeData={treeData}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys)}
                selectedKeys={selectedCat ? [selectedCat] : []}
                onSelect={(keys) => {
                  const id = (keys[0] as string) || null;
                  setSelectedCat(id);
                  if (id) {
                    const parents = catAncestors(cats, id)
                      .slice(0, -1)
                      .map((c) => c.id);
                    setExpandedKeys((prev) => Array.from(new Set([...prev, ...parents])));
                  }
                }}
              />
              {!cats.length && (
                <Typography.Text type="secondary">{t('暂无分类，点击「新建根分类」开始。')}</Typography.Text>
              )}
            </div>
          </div>
        </aside>

        {!siderCollapsed && (
          <div
            className="cat-browse-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('调整分类树宽度')}
            onMouseDown={startResize}
          >
            <span className="cat-browse-resizer-grip" aria-hidden>
              <HolderOutlined />
            </span>
          </div>
        )}

        <main className="cat-browse-main">
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
            <Breadcrumb
              className="cat-list-breadcrumb"
              items={[
                {
                  key: 'root',
                  title: (
                    <Tooltip title={t('根分类')}>
                      <button
                        type="button"
                        className="cat-crumb-home"
                        aria-label={t('根分类')}
                        onClick={() => setSelectedCat(null)}
                      >
                        <HomeOutlined />
                      </button>
                    </Tooltip>
                  ),
                },
                ...breadcrumbPath.map((c, i) => {
                  const isLast = i === breadcrumbPath.length - 1;
                  return {
                    key: c.id,
                    title: isLast ? (
                      <span className="cat-crumb-current">{c.name}</span>
                    ) : (
                      <a
                        href={`#${c.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedCat(c.id);
                        }}
                      >
                        {c.name}
                      </a>
                    ),
                  };
                }),
              ]}
            />
            <Space wrap>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedRowKeys.length}
                onClick={batchRemove}
              >
                
                {t('批量删除')}
              </Button>
              <Button icon={<FolderAddOutlined />} onClick={() => openCreate(selectedCat)}>
                {selectedCatObj ? t('创建子分类') : t('新建根分类')}
              </Button>
            </Space>
          </Space>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <Table
                rowKey="id"
                loading={loading}
                dataSource={rows}
                columns={columns}
                pagination={{ pageSize: 25, showSizeChanger: true }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                }}
                locale={{
                  emptyText: selectedCat ? t('该分类下暂无子分类') : t('暂无根分类'),
                }}
                components={{
                  body: {
                    row: SortableBodyRow,
                  },
                }}
              />
            </SortableContext>
          </DndContext>
        </main>
      </div>

      <Modal
        title={
          formMode === 'edit'
            ? t('编辑分类')
            : catParentId
              ? t('创建子分类')
              : t('新增分类')
        }
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={() => void submitForm()}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical">
          {formMode === 'create' && catParentId && (
            <Form.Item label={t('父分类')}>
              <Input disabled value={findCat(cats, catParentId)?.name || catParentId} />
            </Form.Item>
          )}
          <Form.Item name="name" label={t('名称')} rules={[{ required: true, message: t('请输入名称') }]}>
            <Input placeholder={t('分类名称')} />
          </Form.Item>
          <Form.Item
            name="pathAlias"
            label={t('路径别名')}
            extra={t('仅小写字母、数字与连字符')}
            rules={[
              { required: true, message: t('请输入路径别名') },
              { pattern: PATH_ALIAS_RE, message: t('格式须为 /^[a-z0-9-]+$/') },
            ]}
          >
            <Input placeholder="news" />
          </Form.Item>
          <Form.Item name="description" label={t('描述')} rules={[{ max: 1000 }]}>
            <Input.TextArea rows={2} placeholder={t('选填')} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sortOrder" label={t('排序值')} initialValue={10}>
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="inheritConfig" label={t('继承配置')} valuePropName="checked" initialValue>
                <Switch checkedChildren={t('继承')} unCheckedChildren={t('覆盖')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="allowedTypes"
            label={t('允许模型')}
            extra={t('留空表示继承父分类（当前仅界面配置，创建时写入名称与别名）')}
          >
            <Select
              mode="multiple"
              allowClear
              options={types.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
              placeholder={t('可选')}
            />
          </Form.Item>
          <Collapse
            size="small"
            items={[
              {
                key: 'seo',
                label: t('SEO 元数据'),
                children: (
                  <>
                    <Form.Item name="seoTitle" label={t('SEO 标题')}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="seoKeywords" label={t('SEO 关键词')}>
                      <Input placeholder={t('逗号分隔')} />
                    </Form.Item>
                    <Form.Item name="seoDescription" label={t('SEO 描述')}>
                      <Input.TextArea rows={2} />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <RequireSite>
      <CategoriesInner />
    </RequireSite>
  );
}
