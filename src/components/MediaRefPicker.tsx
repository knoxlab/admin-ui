import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, List, Modal, Progress, Select, Space, Spin, Table, Tag, Typography, Upload, message } from 'antd';
import { EyeOutlined, LinkOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { mediaApi, mediaFolderApi } from '../api';
import { PdfPreview } from './PdfPreview';
import type { MediaAsset, MediaFolderView } from '../api/types';
import { t } from '../i18n/locale';

/** 媒体引用值条目：内部表示，assetId 与 url 互斥。 */
export interface MediaRefEntry {
  assetId?: string;
  url?: string;
  kind?: string;
  version?: number;
  filename?: string;
  mimeType?: string;
}

function parseEntry(raw: string): MediaRefEntry | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const o = JSON.parse(text) as { assetId?: string; url?: string; kind?: string; version?: number };
      if (o.assetId) return { assetId: o.assetId, kind: o.kind, version: o.version };
      if (o.url) return { url: o.url };
      return null;
    } catch { return null; }
  }
  if (text.startsWith('http://') || text.startsWith('https://')) return { url: text };
  return { assetId: text };
}

const entryToString = (e: MediaRefEntry) =>
  e.url
    ? e.url
    : JSON.stringify({ assetId: e.assetId, ...(e.kind ? { kind: e.kind } : {}), ...(e.version ? { version: e.version } : {}) });

const KIND_LABELS: Record<string, string> = {
  video: '视频', audio: '音频', image: '图片', document: '文档', other: '其他',
};
const KIND_COLORS: Record<string, string> = {
  video: 'purple', audio: 'cyan', image: 'green', document: 'blue', other: 'default',
};

type PickerView = 'thumbnail' | 'list' | 'table';

const VIEW_LABELS: Record<PickerView, string> = {
  thumbnail: '缩略图',
  list: '列表',
  table: '表格',
};

/** 选择框每次滚动加载的条数。与媒体库页一致，避免一次拉全库。 */
const PAGE_SIZE = 24;

const formatFileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

const thumbUrl = (siteId: string, id: string) => `/media-thumb/${siteId}/${id}`;

function statusView(status?: string) {
  const value = status || 'PROCESSING';
  if (value === 'ACTIVE') return { color: 'green', label: '就绪' };
  if (value === 'FAILED') return { color: 'red', label: '失败' };
  if (value === 'ARCHIVED') return { color: 'default', label: '已归档' };
  return { color: 'gold', label: '处理中' };
}

function StatusTag({ status }: { status?: string }) {
  const view = statusView(status);
  return <Tag color={view.color}>{t(view.label)}</Tag>;
}

/**
 * MEDIA_REF 字段选择器（FR-KNX-031）：
 * - 从媒体库选择（类型 / 目录变更即筛选，关键字搜索；缩略图、列表、表格；滚动加载）；
 * - 对话框内本地上传，上传后默认选中，并显示处理状态；
 * - 已选媒体可点击预览；
 * - 支持粘贴 Knox 外部 URL 登记。
 */
export default function MediaRefPicker({
  siteId,
  disabled,
  multiple = false,
  value,
  onChange,
  onSelect,
}: {
  siteId: string;
  disabled?: boolean;
  multiple?: boolean;
  value?: string | string[];
  onChange?: (v: string | string[] | undefined) => void;
  /** 从媒体库确定选择后回调选中的资产（供内容编辑器自动填写空白字段）。 */
  onSelect?: (assets: MediaAsset[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>();
  const [folders, setFolders] = useState<MediaFolderView[]>([]);
  const [query, setQuery] = useState<string>();
  const [list, setList] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [viewMode, setViewMode] = useState<PickerView>('thumbnail');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState<{ id: string; filename: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);
  const requestSeq = useRef(0);
  const loadMorePending = useRef(false);
  /** 首屏请求进行中。用 ref 挡住同一轮渲染里的滚动补页，避免跳过第一页。 */
  const loadingRef = useRef(false);
  /** 刚上传、需要钉在当前结果最前的资产。筛选条件变化时清掉。 */
  const pinnedRef = useRef<MediaAsset | null>(null);

  const entries = useMemo<MediaRefEntry[]>(() => {
    const raws = value == null ? [] : Array.isArray(value) ? value : [value];
    return raws.map(parseEntry).filter((e): e is MediaRefEntry => e !== null);
  }, [value]);

  const [assetsById, setAssetsById] = useState<Record<string, MediaAsset>>({});
  useEffect(() => {
    const ids = entries.filter((e) => e.assetId).map((e) => e.assetId!);
    const missing = ids.filter((id) => !assetsById[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => mediaApi.detail(siteId, id).then((d) => ({ id, asset: d.asset })).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const next = { ...assetsById };
        for (const r of results) {
          if (r) next[r.id] = r.asset;
        }
        setAssetsById(next);
      })
      .catch(() => { /* 忽略：展示兜底 */ });
    return () => { cancelled = true; };
  }, [entries, siteId, assetsById]);

  const remember = (assets: MediaAsset[]) => {
    setAssetsById((prev) => {
      const next = { ...prev };
      for (const asset of assets) next[asset.id] = asset;
      return next;
    });
  };

  const visible = useCallback((asset: MediaAsset) => asset.status !== 'ARCHIVED', []);

  const mergePage = (prev: MediaAsset[], items: MediaAsset[], append: boolean) => {
    const pin = pinnedRef.current;
    const incoming = items.filter((asset) => !pin || asset.id !== pin.id);
    const head = !append && pin && visible(pin) ? [pin, ...incoming] : incoming;
    if (!append) return head;
    const seen = new Set(prev.map((asset) => asset.id));
    return [...prev, ...head.filter((asset) => !seen.has(asset.id))];
  };

  const loadPage = useCallback(async (
    targetPage: number,
    opts?: { append?: boolean; silent?: boolean; pin?: MediaAsset },
  ) => {
    if (!siteId) return;
    const append = opts?.append ?? false;
    const silent = opts?.silent ?? false;
    if (opts?.pin) pinnedRef.current = opts.pin;
    const seq = ++requestSeq.current;
    if (!silent) {
      if (append) setLoadingMore(true);
      else {
        loadingRef.current = true;
        setLoading(true);
      }
    }
    try {
      const res = await mediaApi.page(siteId, {
        kind: pickerKind,
        q: query,
        folderPath,
        page: targetPage,
        size: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      const items = res.items.filter(visible);
      setList((prev) => mergePage(prev, items, append));
      remember(opts?.pin ? [opts.pin, ...items] : items);
      pageRef.current = res.page;
      setHasMore(res.hasMore);
    } catch {
      if (!silent) message.error(t('加载媒体库失败'));
    } finally {
      if (seq === requestSeq.current && !silent) {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
    // mergePage / remember 读取最新钉选与缓存，不放入依赖以免筛选未变时重复拉第一页。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, pickerKind, query, folderPath, visible]);

  const refreshLoaded = useCallback(async () => {
    if (!siteId) return;
    const seq = ++requestSeq.current;
    const last = Math.max(pageRef.current, 1);
    const collected: MediaAsset[] = [];
    try {
      let more = false;
      for (let p = 1; p <= last; p += 1) {
        const res = await mediaApi.page(siteId, {
          kind: pickerKind, q: query, folderPath, page: p, size: PAGE_SIZE,
        });
        if (seq !== requestSeq.current) return;
        collected.push(...res.items.filter(visible));
        more = res.hasMore;
        if (!res.hasMore) break;
      }
      setList(mergePage([], collected, false));
      const pin = pinnedRef.current;
      remember(pin ? [pin, ...collected] : collected);
      setHasMore(more);
    } catch {
      // 状态轮询失败不打断选择
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, pickerKind, query, folderPath, visible]);

  useEffect(() => {
    if (!open || !siteId) return;
    pinnedRef.current = null;
    setList([]);
    pageRef.current = 1;
    setHasMore(false);
    scrollRef.current?.scrollTo({ top: 0 });
    void loadPage(1);
  }, [open, siteId, pickerKind, folderPath, query, loadPage]);

  const openPicker = () => {
    setSelected(entries.map((e) => e.assetId).filter((v): v is string => Boolean(v)));
    setOpen(true);
    mediaFolderApi.tree(siteId).then((rows) => setFolders(rows ?? [])).catch(() => setFolders([]));
  };

  const hasProcessing = list.some((a) => !a.status || a.status === 'PROCESSING');
  useEffect(() => {
    if (!open || !hasProcessing) return;
    const timer = window.setInterval(() => { void refreshLoaded(); }, 8000);
    return () => window.clearInterval(timer);
  }, [open, hasProcessing, refreshLoaded]);

  const loadMore = useCallback(() => {
    if (loadMorePending.current || loadingRef.current || loading || loadingMore || !hasMore) return;
    const el = scrollRef.current;
    if (!el || el.clientHeight < 40) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const notFilled = el.scrollHeight <= el.clientHeight + 1;
    if (!nearBottom && !notFilled) return;
    loadMorePending.current = true;
    void loadPage(pageRef.current + 1, { append: true }).finally(() => { loadMorePending.current = false; });
  }, [loading, loadingMore, hasMore, loadPage]);

  useEffect(() => {
    if (!open || loading || loadingMore || !hasMore) return;
    const el = scrollRef.current;
    if (!el) return;
    loadMore();
    const observer = new ResizeObserver(() => loadMore());
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, loading, loadingMore, hasMore, list.length, viewMode, loadMore]);

  const toggle = (id: string) => {
    const checked = selected.includes(id);
    if (multiple) {
      setSelected(checked ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      setSelected(checked ? [] : [id]);
    }
  };

  const applySelection = (ids: string[]) => {
    const merged: MediaRefEntry[] = [];
    const picked: MediaAsset[] = [];
    for (const id of ids) {
      const asset = assetsById[id] ?? list.find((a) => a.id === id);
      if (!asset) continue;
      picked.push(asset);
      merged.push({ assetId: id, kind: asset.kind, version: asset.currentVersion, filename: asset.filename, mimeType: asset.mimeType });
    }
    emit(merged);
    // 表单自动填写（需求 2026-10-23）：把选中的资产交给外层（内容编辑器）补空白字段。
    if (picked.length) onSelect?.(picked);
  };

  const emit = (next: MediaRefEntry[]) => {
    if (multiple) {
      onChange?.(next.map(entryToString));
    } else {
      onChange?.(next.length ? entryToString(next[0]) : undefined);
    }
  };

  const removeEntry = (idx: number) => {
    emit(entries.filter((_, i) => i !== idx));
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) {
      message.warning(t('外部引用必须是 http(s) URL'));
      return;
    }
    emit([...entries, { url: u, filename: u }]);
    setUrlInput('');
  };

  const uploadFolder = folderPath && folderPath !== '/' ? folderPath : undefined;

  const uploadLocal = async (file: File) => {
    setUploading(true);
    setUploadPct(0);
    try {
      const result = await mediaApi.upload(siteId, file, setUploadPct, uploadFolder);
      const detail = await mediaApi.detail(siteId, result.assetId).catch(() => null);
      const asset = detail?.asset ?? {
        id: result.assetId,
        siteId,
        title: file.name,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        contentHash: '',
        currentVersion: 1,
        status: result.status as MediaAsset['status'],
        folderPath: uploadFolder,
      } satisfies MediaAsset;
      remember([asset]);
      setSelected(multiple ? Array.from(new Set([...selected, asset.id])) : [asset.id]);
      scrollRef.current?.scrollTo({ top: 0 });
      await loadPage(1, { pin: asset });
      message.success(result.status === 'ACTIVE' ? t('已上传并选中') : t('已上传并选中，处理状态见列表'));
    } catch {
      // 拦截器已提示
    } finally {
      setUploading(false);
    }
    return false;
  };

  const openAssetPreview = (asset: { id: string; filename?: string }) => {
    setPreview({ id: asset.id, filename: asset.filename || t('媒体预览') });
  };

  const folderOptions = [
    { value: '/', label: t('根目录') },
    ...[...folders].sort((a, b) => a.path.localeCompare(b.path)).map((folder) => ({
      value: folder.path,
      label: folder.path,
    })),
  ];

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Button disabled={disabled || !siteId} icon={<PlusOutlined />} onClick={openPicker}>
          {t('从媒体库选择')}
        </Button>
        {entries.length > 0 && (
          <List
            size="small"
            bordered
            dataSource={entries}
            locale={{ emptyText: '' }}
            renderItem={(e, idx) => {
              const asset = e.assetId ? assetsById[e.assetId] : undefined;
              return (
                <List.Item
                  actions={[
                    e.assetId ? (
                      <Button key="preview" type="text" size="small" icon={<EyeOutlined />} onClick={() => openAssetPreview({ id: e.assetId!, filename: asset?.filename ?? e.filename })}>
                        {t('预览')}
                      </Button>
                    ) : null,
                    <Button key="remove" type="text" danger size="small" disabled={disabled} onClick={() => removeEntry(idx)}>
                      {t('移除')}
                    </Button>,
                  ]}
                >
                  <Space
                    size={10}
                    style={{ cursor: e.assetId || e.url ? 'pointer' : undefined }}
                    onClick={() => {
                      if (e.assetId) openAssetPreview({ id: e.assetId, filename: asset?.filename ?? e.filename });
                      else if (e.url) window.open(e.url, '_blank', 'noopener');
                    }}
                  >
                    {asset ? (
                      <img
                        src={thumbUrl(siteId, asset.id)}
                        alt=""
                        style={{ width: 40, height: 40, objectFit: 'contain', background: '#f5f5f5', borderRadius: 4 }}
                        onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                      />
                    ) : e.url ? (
                      <LinkOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                    ) : (
                      <Typography.Text code>?</Typography.Text>
                    )}
                    <div>
                      <div>
                        <Typography.Text strong>{e.filename ?? asset?.filename ?? (e.assetId ? `媒体 ${e.assetId.slice(0, 8)}` : t('外部 URL'))}</Typography.Text>
                      </div>
                      <Space size={6} wrap>
                        {asset?.kind && <Tag color={KIND_COLORS[asset.kind] ?? 'default'}>{t(KIND_LABELS[asset.kind] ?? asset.kind)}</Tag>}
                        {asset && <StatusTag status={asset.status} />}
                        {e.url
                          ? <Tag color="orange">{t('外部 URL')}</Tag>
                          : <Tag>v{e.version ?? asset?.currentVersion ?? '?'}</Tag>}
                        {asset?.mimeType && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{asset.mimeType}</Typography.Text>}
                        {asset && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(asset.fileSize)}</Typography.Text>}
                      </Space>
                    </div>
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder={t('或粘贴外部媒体 URL（http/https）')}
            value={urlInput}
            disabled={disabled}
            onChange={(e) => setUrlInput(e.target.value)}
            onPressEnter={() => addUrl()}
          />
          <Button onClick={addUrl} disabled={disabled}>{t('登记')}</Button>
        </Space.Compact>
      </Space>

      <Modal
        open={open}
        title={t('从媒体库选择')}
        width={920}
        okText={multiple ? t('选择') : t('确定')}
        okButtonProps={{ disabled: selected.length === 0 }}
        onCancel={() => setOpen(false)}
        onOk={() => { applySelection(selected); setOpen(false); }}
        destroyOnHidden
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder={t('类型过滤')}
            style={{ width: 130 }}
            value={pickerKind}
            onChange={(v) => setPickerKind(v || undefined)}
            options={Object.entries(KIND_LABELS).map(([v, l]) => ({ value: v, label: t(l) }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('目录')}
            style={{ width: 180 }}
            value={folderPath}
            onChange={(v) => setFolderPath(v || undefined)}
            options={folderOptions}
          />
          <Input.Search
            allowClear
            placeholder={t('搜索文件名')}
            style={{ width: 180 }}
            onSearch={(v) => { setQuery(v || undefined); }}
          />
          <Select<PickerView>
            className="media-ref-view-select"
            value={viewMode}
            onChange={setViewMode}
            popupMatchSelectWidth={false}
            dropdownStyle={{ minWidth: 88 }}
            aria-label={t('展示方式')}
            options={(Object.keys(VIEW_LABELS) as PickerView[]).map((value) => ({
              value,
              label: t(VIEW_LABELS[value]),
            }))}
          />
          <Upload showUploadList={false} disabled={uploading || disabled} beforeUpload={(file) => { void uploadLocal(file); return false; }}>
            <Button icon={<UploadOutlined />} type="primary" loading={uploading}>{t('本地上传')}</Button>
          </Upload>
        </Space>
        {uploading && <Progress percent={uploadPct} style={{ marginBottom: 12 }} />}
        <style>{`
          .media-ref-view-select.ant-select { width: auto; min-width: 0; }
          .media-ref-view-select .ant-select-selector { width: auto !important; flex: 0 0 auto !important; padding-inline: 8px 20px !important; }
          .media-ref-view-select .ant-select-selection-item { flex: none !important; padding-inline-end: 2px !important; overflow: visible; text-overflow: clip; }
        `}</style>
        <div ref={scrollRef} onScroll={loadMore} style={{ maxHeight: 420, overflow: 'auto' }}>
          {loading && list.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          )}
          {!loading && list.length === 0 && (
            <Typography.Text type="secondary">{t('没有符合条件的媒体')}</Typography.Text>
          )}
          {viewMode === 'thumbnail' && list.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {list.map((a) => {
                const checked = selected.includes(a.id);
                return (
                  <div
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    style={{
                      border: checked ? '1px solid #1677ff' : '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: 8,
                      cursor: 'pointer',
                      background: checked ? '#e6f4ff' : '#fff',
                    }}
                  >
                    <img
                      src={thumbUrl(siteId, a.id)}
                      alt=""
                      onClick={(ev) => { ev.stopPropagation(); openAssetPreview(a); }}
                      style={{ width: '100%', height: 96, objectFit: 'contain', background: '#f5f5f5', borderRadius: 4 }}
                      onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                    />
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <Checkbox checked={checked} onClick={(ev) => ev.stopPropagation()} onChange={() => toggle(a.id)} />
                      <div style={{ minWidth: 0 }}>
                        <Typography.Text ellipsis={{ tooltip: a.filename }}>{a.filename}</Typography.Text>
                        <div><StatusTag status={a.status} /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {viewMode === 'list' && list.length > 0 && (
            <List
              dataSource={list}
              renderItem={(a) => {
                const checked = selected.includes(a.id);
                return (
                  <List.Item style={{ cursor: 'pointer', background: checked ? '#e6f4ff' : undefined }} onClick={() => toggle(a.id)}>
                    <Checkbox checked={checked} onClick={(ev) => ev.stopPropagation()} onChange={() => toggle(a.id)} />
                    <img
                      src={thumbUrl(siteId, a.id)}
                      alt=""
                      onClick={(ev) => { ev.stopPropagation(); openAssetPreview(a); }}
                      style={{ width: 56, height: 40, objectFit: 'contain', background: '#f5f5f5', borderRadius: 4, margin: '0 10px' }}
                      onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <Typography.Text ellipsis={{ tooltip: a.filename }}>{a.filename}</Typography.Text>
                        {a.kind && <Tag style={{ marginLeft: 8 }} color={KIND_COLORS[a.kind] ?? 'default'}>{t(KIND_LABELS[a.kind] ?? a.kind)}</Tag>}
                        <StatusTag status={a.status} />
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {a.mimeType} · {formatFileSize(a.fileSize)}{a.folderPath ? ` · ${a.folderPath}` : ''}
                      </Typography.Text>
                    </div>
                    <Button type="text" icon={<EyeOutlined />} onClick={(ev) => { ev.stopPropagation(); openAssetPreview(a); }}>{t('预览')}</Button>
                  </List.Item>
                );
              }}
            />
          )}
          {viewMode === 'table' && list.length > 0 && (
            <Table
              size="small"
              rowKey="id"
              dataSource={list}
              pagination={false}
              rowSelection={{
                type: multiple ? 'checkbox' : 'radio',
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys.map(String)),
              }}
              onRow={(a) => ({ onClick: () => toggle(a.id), style: { cursor: 'pointer' } })}
              columns={[
                {
                  title: t('预览'),
                  width: 72,
                  render: (_: unknown, a: MediaAsset) => (
                    <img
                      src={thumbUrl(siteId, a.id)}
                      alt=""
                      onClick={(ev) => { ev.stopPropagation(); openAssetPreview(a); }}
                      style={{ width: 48, height: 36, objectFit: 'contain', background: '#f5f5f5', borderRadius: 4 }}
                      onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                    />
                  ),
                },
                { title: t('文件名'), dataIndex: 'filename', ellipsis: true },
                {
                  title: t('类型'),
                  dataIndex: 'kind',
                  width: 90,
                  render: (kind: string) => kind ? <Tag color={KIND_COLORS[kind] ?? 'default'}>{t(KIND_LABELS[kind] ?? kind)}</Tag> : '-',
                },
                { title: t('大小'), dataIndex: 'fileSize', width: 90, render: (n: number) => formatFileSize(n) },
                { title: t('目录'), dataIndex: 'folderPath', width: 140, render: (v?: string) => v || t('根目录') },
                { title: t('状态'), dataIndex: 'status', width: 90, render: (s: string) => <StatusTag status={s} /> },
              ]}
            />
          )}
          <div style={{ textAlign: 'center', padding: 8 }}>
            {loadingMore && <Spin size="small" />}
            {!loading && !loadingMore && !hasMore && list.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('已加载全部 {n} 个媒体', { n: list.length })}
              </Typography.Text>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={preview !== null}
        title={t('预览：{name}', { name: preview?.filename ?? '' })}
        footer={null}
        width={760}
        onCancel={() => setPreview(null)}
        destroyOnHidden
      >
        {preview && (
          /\.pdf$/i.test(preview.filename ?? '') ? (
            // PDF 走 pdf.js 客户端渲染：内嵌浏览器/精简内核常常没有 PDF 插件，
            // 直接 iframe 原件会得到一片空白
            <PdfPreview
              src={`/media-pdf/${siteId}/${preview.id}?v=${preview.id}`}
              fallbackSrc={`/media-preview/${siteId}/${preview.id}?_cb=${preview.id}&page=1`}
              title={preview.filename}
              height={420}
            />
          ) : (
            <iframe
              title={preview.filename}
              // 其他文档走 /media-preview 并显式带 page=1（不带 page 只会得到「文件名 + 大小」占位卡）；
              // page 只对文档分支生效，图片/音视频会忽略它，统一带上即可。
              src={`/media-preview/${siteId}/${preview.id}?_cb=${preview.id}&page=1`}
              width="100%"
              height="420"
              style={{ border: 0 }}
            />
          )
        )}
      </Modal>
    </div>
  );
}
