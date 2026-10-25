import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, List, Modal, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { contentsApi, modelsApi } from '../api';
import type { ContentItem, ContentType, FieldDef } from '../api/types';
import { t } from '../i18n/locale';

type PickerView = 'card' | 'list' | 'table';

const VIEW_LABELS: Record<PickerView, string> = {
  card: '卡片',
  list: '列表',
  table: '表格',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  SCHEDULED: '已排期',
  WITHDRAWN: '已撤回',
  ARCHIVED: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'success',
  IN_REVIEW: 'processing',
  APPROVED: 'cyan',
  SCHEDULED: 'cyan',
  WITHDRAWN: 'default',
  ARCHIVED: 'default',
  DRAFT: 'warning',
};

/** 选择框每次展示的条数。检索一次取回符合条件的内容，滚动时再多显示一页。 */
const PAGE_SIZE = 24;

type PickerItem = ContentItem & { typeName: string; typeCode: string };

function codesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function selectedIds(value: unknown, multiple: boolean): string[] {
  if (multiple) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return value ? [String(value)] : [];
  }
  const one = Array.isArray(value) ? value[0] : value;
  return one ? [String(one)] : [];
}

function StatusTag({ status }: { status?: string }) {
  const key = status || 'DRAFT';
  return <Tag color={STATUS_COLORS[key] || 'default'}>{t(STATUS_LABELS[key] || key)}</Tag>;
}

/** 与内容搜索页相同：已发布或草稿，且不是媒体库类型、系统预置类型。 */
export function isContentSearchModel(type: ContentType): boolean {
  return (type.status === 'PUBLISHED' || type.status === 'DRAFT')
    && type.objectType !== 'MEDIA'
    && !type.isSystem;
}

/**
 * CONTENT_REF 选择器：在内容搜索允许的模型内，再按字段上的允许类型与多选打开列表。
 * 类型和状态变更后立即筛选，标题用检索；卡片、列表、表格三种展示。
 */
export default function ContentRefPicker({
  field,
  siteId,
  disabled,
  id,
  value,
  onChange,
}: {
  field: FieldDef;
  siteId: string;
  disabled?: boolean;
  id?: string;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  const allowed = codesOf(field.fieldConfig?.allowedContentTypes);
  const allowedKey = allowed.join('\n');
  const multiple = Boolean(field.fieldConfig?.allowMultiple);
  const maxItems = Number(field.fieldConfig?.maxItems) || 0;
  const ids = useMemo(() => selectedIds(value, multiple), [value, multiple]);

  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [typesReady, setTypesReady] = useState(false);
  const [typeId, setTypeId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<PickerView>('list');
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const [known, setKnown] = useState<Record<string, PickerItem>>({});
  const knownRef = useRef(known);
  knownRef.current = known;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!siteId) {
      setTypes([]);
      setTypesReady(false);
      return;
    }
    let cancelled = false;
    setTypesReady(false);
    modelsApi.list(siteId).then((all) => {
      if (cancelled) return;
      const codes = allowedKey ? allowedKey.split('\n') : [];
      setTypes(all.filter((type) => {
        if (!isContentSearchModel(type)) return false;
        if (codes.length > 0) return codes.includes(type.code);
        return true;
      }));
    }).catch(() => {
      if (!cancelled) setTypes([]);
    }).finally(() => {
      if (!cancelled) setTypesReady(true);
    });
    return () => { cancelled = true; };
  }, [siteId, allowedKey]);

  useEffect(() => {
    if (!siteId || ids.length === 0) return;
    const missing = ids.filter((itemId) => !knownRef.current[itemId]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((itemId) => contentsApi.get(itemId).catch(() => null))).then((rows) => {
      if (cancelled) return;
      setKnown((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!row) continue;
          const type = types.find((item) => item.id === row.contentTypeId);
          next[row.id] = { ...row, typeName: type?.name || '', typeCode: type?.code || '' };
        }
        return next;
      });
    }).catch(() => { /* 标题解析失败时仍显示编号 */ });
    return () => { cancelled = true; };
  }, [siteId, ids, types]);

  const loadItems = useCallback(async () => {
    if (!open || !siteId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const targets = typeId ? types.filter((type) => type.id === typeId) : types;
      const groups = await Promise.all(targets.map(async (type) => {
        const rows = await contentsApi.search(siteId, {
          contentTypeId: type.id,
          keyword: query,
          status,
        }).catch(() => [] as ContentItem[]);
        return rows
          .filter((row) => status === 'ARCHIVED' || row.status !== 'ARCHIVED')
          .map((row) => ({ ...row, typeName: type.name, typeCode: type.code }));
      }));
      if (seq !== requestSeq.current) return;
      setItems(groups.flat().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setVisibleCount(PAGE_SIZE);
    } catch {
      if (seq === requestSeq.current) {
        setItems([]);
        message.error(t('加载内容失败'));
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [open, siteId, typeId, query, status, types]);

  useEffect(() => {
    if (!open || !typesReady) return;
    void loadItems();
  }, [open, typesReady, loadItems]);

  useEffect(() => {
    if (open && types.length === 1) setTypeId(types[0].id);
  }, [open, types]);

  const shown = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const revealMore = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight < 40 || !hasMore || loading) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const notFilled = el.scrollHeight <= el.clientHeight + 1;
    if (!nearBottom && !notFilled) return;
    setVisibleCount((count) => Math.min(items.length, count + PAGE_SIZE));
  }, [hasMore, loading, items.length]);

  useEffect(() => {
    if (!open || loading || !hasMore) return;
    const el = scrollRef.current;
    if (!el) return;
    revealMore();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => revealMore());
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, loading, hasMore, shown.length, viewMode, revealMore]);

  const remember = (nextIds: string[]) => {
    setKnown((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (nextIds.includes(item.id)) next[item.id] = item;
      }
      return next;
    });
  };

  const limit = (next: string[]) => {
    if (multiple && maxItems > 0 && next.length > maxItems) {
      message.warning(t('最多选择 {n} 项', { n: maxItems }));
      return false;
    }
    return true;
  };

  const toggle = (itemId: string) => {
    const checked = selected.includes(itemId);
    if (!multiple) {
      setSelected(checked ? [] : [itemId]);
      return;
    }
    const next = checked ? selected.filter((id) => id !== itemId) : [...selected, itemId];
    if (!limit(next)) return;
    setSelected(next);
  };

  const openPicker = () => {
    setSelected(ids);
    setKeyword('');
    setQuery(undefined);
    setStatus(undefined);
    setTypeId(types.length === 1 ? types[0].id : undefined);
    setOpen(true);
  };

  const apply = () => {
    remember(selected);
    onChange?.(multiple ? selected : selected[0]);
    setOpen(false);
  };

  const remove = (itemId: string) => {
    const next = ids.filter((id) => id !== itemId);
    onChange?.(multiple ? next : undefined);
  };

  const lockedType = types.length === 1;

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Button id={id} disabled={disabled || !siteId} icon={<PlusOutlined />} onClick={openPicker}>
          {siteId ? t('选择内容') : t('请先选择站点')}
        </Button>
        {ids.length > 0 && (
          <List
            size="small"
            bordered
            dataSource={ids}
            renderItem={(itemId) => {
              const item = known[itemId];
              return (
                <List.Item
                  actions={[
                    <Button key="remove" type="text" danger size="small" disabled={disabled} onClick={() => remove(itemId)}>
                      {t('移除')}
                    </Button>,
                  ]}
                >
                  <Space size={10}>
                    <FileTextOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                    <div>
                      <Typography.Text strong>{item?.title || itemId}</Typography.Text>
                      <div>
                        {item?.typeName && <Tag>{item.typeName}</Tag>}
                        {item && <StatusTag status={item.status} />}
                        {item?.routePath && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.routePath}</Typography.Text>
                        )}
                      </div>
                    </div>
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
      </Space>

      <Modal
        open={open}
        title={t('选择内容')}
        width={920}
        okText={multiple ? t('选择') : t('确定')}
        okButtonProps={{ disabled: selected.length === 0 }}
        onCancel={() => setOpen(false)}
        onOk={apply}
        destroyOnHidden
      >
        <Space wrap style={{ marginBottom: 12 }}>
          {types.length > 0 && (
            <Select
              aria-label={t('内容类型')}
              disabled={lockedType}
              allowClear={!lockedType}
              showSearch
              optionFilterProp="label"
              placeholder={t('内容类型')}
              style={{ width: 180 }}
              value={typeId}
              onChange={(next) => setTypeId(next || undefined)}
              options={types.map((type) => ({ value: type.id, label: type.name }))}
            />
          )}
          <Select
            aria-label={t('状态')}
            allowClear
            placeholder={t('状态')}
            style={{ width: 120 }}
            value={status}
            onChange={(next) => setStatus(next || undefined)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
          />
          <Input.Search
            allowClear
            placeholder={t('搜索标题')}
            style={{ width: 200 }}
            value={keyword}
            onChange={(event) => {
              const next = event.target.value;
              setKeyword(next);
              if (!next) setQuery(undefined);
            }}
            onSearch={(next) => setQuery(next.trim() || undefined)}
          />
          <Select<PickerView>
            className="content-ref-view-select"
            value={viewMode}
            onChange={setViewMode}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 88 } } }}
            aria-label={t('展示方式')}
            options={(Object.keys(VIEW_LABELS) as PickerView[]).map((value) => ({
              value,
              label: t(VIEW_LABELS[value]),
            }))}
          />
        </Space>
        <style>{`
          .content-ref-view-select.ant-select { width: auto; min-width: 0; }
          .content-ref-view-select .ant-select-selector { width: auto !important; flex: 0 0 auto !important; padding-inline: 8px 20px !important; }
          .content-ref-view-select .ant-select-selection-item { flex: none !important; padding-inline-end: 2px !important; overflow: visible; text-overflow: clip; }
        `}</style>
        <div ref={scrollRef} onScroll={revealMore} style={{ maxHeight: 420, overflow: 'auto' }}>
          {loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          )}
          {!loading && typesReady && types.length === 0 && (
            <Typography.Text type="secondary">{t('没有可引用的内容类型')}</Typography.Text>
          )}
          {!loading && types.length > 0 && items.length === 0 && (
            <Typography.Text type="secondary">{t('没有符合条件的内容')}</Typography.Text>
          )}
          {viewMode === 'card' && shown.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {shown.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    style={{
                      border: checked ? '1px solid #1677ff' : '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: 12,
                      cursor: 'pointer',
                      background: checked ? '#e6f4ff' : '#fff',
                    }}
                  >
                    <Space align="start">
                      <Checkbox checked={checked} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} />
                      <div style={{ minWidth: 0 }}>
                        <Typography.Text style={{ display: 'block', maxWidth: 148, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.id}</Typography.Text>
                        <div>
                          <Tag>{item.typeName}</Tag>
                          <StatusTag status={item.status} />
                        </div>
                      </div>
                    </Space>
                  </div>
                );
              })}
            </div>
          )}
          {viewMode === 'list' && shown.length > 0 && (
            <List
              dataSource={shown}
              renderItem={(item) => {
                const checked = selected.includes(item.id);
                return (
                  <List.Item
                    style={{ cursor: 'pointer', background: checked ? '#e6f4ff' : undefined }}
                    onClick={() => toggle(item.id)}
                  >
                    <Checkbox checked={checked} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} />
                    <FileTextOutlined style={{ fontSize: 18, color: '#1677ff', margin: '0 10px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <Typography.Text style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.id}</Typography.Text>
                        <Tag style={{ marginLeft: 8 }}>{item.typeName}</Tag>
                        <StatusTag status={item.status} />
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {item.routePath || t('无路径')} · v{item.currentVersion}
                      </Typography.Text>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
          {viewMode === 'table' && shown.length > 0 && (
            <Table
              size="small"
              rowKey="id"
              dataSource={shown}
              pagination={false}
              rowSelection={{
                type: multiple ? 'checkbox' : 'radio',
                selectedRowKeys: selected,
                onChange: (keys) => {
                  const next = keys.map(String);
                  if (!limit(next)) return;
                  setSelected(next);
                },
              }}
              onRow={(item) => ({
                onClick: (event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('.ant-checkbox, .ant-radio, .ant-table-selection-column')) return;
                  toggle(item.id);
                },
                style: { cursor: 'pointer' },
              })}
              columns={[
                {
                  title: t('标题'),
                  dataIndex: 'title',
                  render: (title: string, item: PickerItem) => (
                    <span style={{ display: 'inline-block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || item.id}</span>
                  ),
                },
                { title: t('类型'), dataIndex: 'typeName', width: 140 },
                { title: t('状态'), dataIndex: 'status', width: 100, render: (value: string) => <StatusTag status={value} /> },
                { title: t('路径'), dataIndex: 'routePath', width: 180, render: (path?: string) => path || t('无路径') },
              ]}
            />
          )}
          <div style={{ textAlign: 'center', padding: 8 }}>
            {!loading && !hasMore && items.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('已加载全部 {n} 条内容', { n: items.length })}
              </Typography.Text>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
