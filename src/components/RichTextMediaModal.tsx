/**
 * 富文本媒体插入对话框（图片 / 视频）。
 *
 * <p>图片：本地上传（上传至媒体库）或从媒体库选择；视频：本地上传 / 媒体库 / 链接地址。
 * 本地上传走 {@link ./mediaUpload}（小文件直传、大文件分片），入库后按稳定交付端点生成插入片段：
 * - 图片：{@code /media-file/{siteId}/{assetId}} 原文件直出端点（图片/字体白名单，稳定可缓存）；
 * - 库内视频：{@code /media-play/{siteId}/{assetId}} 播放代理页 iframe（与媒体库「播放代码」
 *   iframe 形态一致，按需换 token、无固定到期）；
 * - 外链视频：直链视频文件用 {@code <video>}，其余地址（第三方播放页/嵌入地址）用 iframe。
 */
import { useEffect, useState } from 'react';
import { Input, Modal, Progress, Space, Spin, Tabs, Tag, Typography, message } from 'antd';
import { mediaApi } from '../api';
import type { MediaAsset } from '../api/types';
import { uploadToLibrary } from './mediaUpload';
import { t } from '../i18n/locale';

export type MediaKind = 'image' | 'video';
type TabKey = 'upload' | 'library' | 'link';

const thumbUrl = (siteId: string, id: string) => `/media-thumb/${siteId}/${id}`;

export function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 图片片段：/media-file 原文件交付端点；v 为缓存版本号（给出时服务端可声明不可变长缓存）。 */
export function imageHtml(siteId: string, assetId: string, alt: string, version?: number): string {
  const v = version ? `?v=${version}` : '';
  return `<img src="/media-file/${siteId}/${assetId}${v}" alt="${escapeAttr(alt)}">`;
}

/** 库内视频片段：iframe 指向播放代理页（无固定 token 到期问题）。 */
export function libraryVideoHtml(siteId: string, assetId: string, title: string): string {
  return `<iframe src="/media-play/${siteId}/${assetId}" width="640" height="360" frameborder="0" allowfullscreen title="${escapeAttr(title)}"></iframe>`;
}

/** 外链视频片段：直链视频文件用 <video controls>，其余地址用 iframe 嵌入。 */
export function videoUrlHtml(url: string): string {
  const clean = url.trim();
  if (/\.(mp4|webm|og[gv]|m4v|mov)(\?.*)?$/i.test(clean)) {
    return `<video controls src="${escapeAttr(clean)}"></video>`;
  }
  return `<iframe src="${escapeAttr(clean)}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
}

/** 外链校验：仅接受 http(s) 绝对地址。 */
export function isSafeMediaUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

export default function RichTextMediaModal({
  open,
  kind,
  siteId,
  onClose,
  onInsert,
}: {
  open: boolean;
  kind: MediaKind;
  siteId?: string;
  onClose: () => void;
  /** 提交插入片段（已含完整标签，调用方 insertHTML 进编辑区）。 */
  onInsert: (html: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [query, setQuery] = useState<string>();
  const [list, setList] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('upload');
    setFile(null);
    setPct(0);
    setQuery(undefined);
    setSelected(null);
    setUrl('');
    setList([]);
    if (siteId) void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const loadLibrary = async (q?: string) => {
    if (!siteId) return;
    setLoading(true);
    try {
      const rows = await mediaApi.list(siteId, { kind, q });
      setList(rows.filter((a) => a.status !== 'ARCHIVED' && a.status !== 'FAILED'
        && (a.kind === kind || Boolean(a.mimeType?.startsWith(`${kind}/`)))));
    } catch {
      message.error(t('加载媒体库失败'));
    } finally {
      setLoading(false);
    }
  };

  const insertForAsset = (assetId: string, name: string, version?: number) => {
    if (kind === 'image') onInsert(imageHtml(siteId!, assetId, name, version));
    else onInsert(libraryVideoHtml(siteId!, assetId, name));
  };

  const doUpload = async () => {
    if (!siteId || !file) return;
    setUploading(true);
    try {
      const result = await uploadToLibrary(siteId, file, setPct);
      insertForAsset(result.assetId, file.name);
      message.success(t('已上传至媒体库并插入'));
      onClose();
    } catch {
      message.error(t('上传失败，请重试'));
    } finally {
      setUploading(false);
    }
  };

  const doInsert = () => {
    if (tab === 'upload') {
      void doUpload();
    } else if (tab === 'library') {
      if (!selected) return;
      insertForAsset(selected.id, selected.filename, selected.currentVersion);
      onClose();
    } else if (tab === 'link') {
      if (!isSafeMediaUrl(url)) {
        message.warning(t('仅支持 http(s) 地址'));
        return;
      }
      onInsert(videoUrlHtml(url));
      onClose();
    }
  };

  const okDisabled = tab === 'upload' ? !file || uploading
    : tab === 'library' ? !selected
      : !isSafeMediaUrl(url);

  const tabs = [
    {
      key: 'upload',
      label: t('本地上传'),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <input
            type="file"
            data-testid="rich-media-file"
            accept={kind === 'image' ? 'image/*' : 'video/*'}
            disabled={uploading}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPct(0);
            }}
          />
          <Typography.Text type="secondary">
            {kind === 'image' ? t('支持常见图片格式，上传后自动入媒体库') : t('支持常见视频格式，大文件自动分片上传至媒体库')}
          </Typography.Text>
          {uploading && <Progress percent={pct} size="small" status="active" />}
        </Space>
      ),
    },
    {
      key: 'library',
      label: t('媒体库'),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Input.Search
            allowClear
            placeholder={t('搜索文件名')}
            value={query}
            onChange={(e) => setQuery(e.target.value || undefined)}
            onSearch={(v) => {
              setQuery(v || undefined);
              void loadLibrary(v || undefined);
            }}
          />
          <Spin spinning={loading}>
            <div style={{ maxHeight: 320, overflow: 'auto' }} role="listbox" aria-label={t('媒体库')}>
              {list.map((a) => (
                <div
                  key={a.id}
                  role="option"
                  aria-selected={selected?.id === a.id}
                  data-testid={`rich-media-asset-${a.id}`}
                  onClick={() => setSelected(a)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    border: selected?.id === a.id ? '1px solid #1677ff' : '1px solid transparent',
                    borderRadius: 4,
                  }}
                >
                  <img
                    src={thumbUrl(siteId!, a.id)}
                    alt=""
                    style={{ width: 48, height: 36, objectFit: 'contain', background: '#f5f5f5', borderRadius: 4 }}
                    onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text ellipsis={{ tooltip: a.filename }}>{a.filename}</Typography.Text>
                    <div>
                      <Tag>{a.kind ?? kind}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.mimeType}</Typography.Text>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && list.length === 0 && (
                <Typography.Text type="secondary">{t('没有符合条件的媒体资产')}</Typography.Text>
              )}
            </div>
          </Spin>
        </Space>
      ),
    },
    {
      key: 'link',
      label: t('链接地址'),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Input
            placeholder={t('输入视频链接（http/https）')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={() => doInsert()}
          />
          <Typography.Text type="secondary">
            {t('直链视频文件（mp4/webm 等）以 <video> 插入，其余地址以 iframe 嵌入')}
          </Typography.Text>
        </Space>
      ),
    },
  ];

  const items = kind === 'image' ? tabs.filter((x) => x.key !== 'link') : tabs;

  return (
    <Modal
      open={open}
      title={kind === 'image' ? t('插入图片') : t('插入视频')}
      width={640}
      okText={t('插入')}
      okButtonProps={{ disabled: okDisabled }}
      confirmLoading={uploading}
      onCancel={onClose}
      onOk={doInsert}
      destroyOnHidden
    >
      {!siteId ? (
        <Typography.Text type="secondary">{t('需要站点上下文才能使用媒体库')}</Typography.Text>
      ) : (
        <Tabs activeKey={tab} onChange={(k) => setTab(k as TabKey)} items={items} />
      )}
    </Modal>
  );
}
