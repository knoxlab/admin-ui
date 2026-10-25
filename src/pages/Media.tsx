import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Descriptions, Drawer, Empty, Input, Popconfirm, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import {
  AudioOutlined, DeleteOutlined, FileOutlined, FileTextOutlined, FontSizeOutlined,
  PictureOutlined, ReloadOutlined, VideoCameraOutlined,
} from '@ant-design/icons';
import { mediaApi } from '../api';
import type { MediaAsset, MediaDetail } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import MediaFoldersPanel from '../components/MediaFoldersPanel';
import { t } from '../i18n/locale';
import { formatDateTime } from '../utils/datetime';

/** 媒体种类展示与筛选（FR-ASSET-001）。 */
const KIND_LABELS: Record<string, string> = {
  video: '视频', audio: '音频', image: '图片', document: '文档', font: '字体', other: '其他',
};
const KIND_COLORS: Record<string, string> = {
  video: 'purple', audio: 'cyan', image: 'green', document: 'blue', font: 'magenta', other: 'default',
};
const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));

function statusTag(status: string) {
  if (status === 'ACTIVE') return <Tag color="green">{t('可用')}</Tag>;
  if (status === 'ARCHIVED') return <Tag>{t('已归档')}</Tag>;
  return <Tag color="orange">{status}</Tag>;
}

function KindIcon({ kind }: { kind?: string }) {
  if (kind === 'video') return <VideoCameraOutlined />;
  if (kind === 'audio') return <AudioOutlined />;
  if (kind === 'image') return <PictureOutlined />;
  if (kind === 'document') return <FileTextOutlined />;
  if (kind === 'font') return <FontSizeOutlined />;
  return <FileOutlined />;
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function MediaInner() {
  const { siteId } = useSite();
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [kind, setKind] = useState<string>();
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await mediaApi.page(siteId, { page, size, q: keyword || undefined, kind });
      setRows(data.items);
      setTotal(data.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [siteId, page, size, keyword, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: MediaAsset) => {
    if (!siteId) return;
    setDetailLoading(true);
    try {
      setDetail(await mediaApi.detail(siteId, row.id));
    } catch {
      message.error(t('加载媒体详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const remove = async (row: MediaAsset) => {
    if (!siteId) return;
    try {
      await mediaApi.remove(siteId, row.id);
      message.success(t('已删除'));
      await load();
    } catch {
      message.error(t('删除失败'));
    }
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('社区版使用本地存储（powercms.media.storage-root），不接入外部媒资中台。')}
      />
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('搜索文件名')}
            style={{ width: 260 }}
            onSearch={(value) => { setPage(1); setKeyword(value.trim()); }}
          />
          <Select
            allowClear
            placeholder={t('全部类型')}
            style={{ width: 140 }}
            options={KIND_OPTIONS}
            value={kind}
            onChange={(value) => { setPage(1); setKind(value); }}
          />
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
      </Space>

      <Table<MediaAsset>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        locale={{ emptyText: <Empty description={t('暂无媒体资产')} /> }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: (n) => t('共 {n} 条', { n }),
          onChange: (nextPage, nextSize) => { setPage(nextPage); setSize(nextSize); },
        }}
        columns={[
          {
            title: t('名称'),
            dataIndex: 'filename',
            render: (value: string, row) => (
              <Space>
                <KindIcon kind={row.kind} />
                <Typography.Link onClick={() => void openDetail(row)}>{value}</Typography.Link>
              </Space>
            ),
          },
          {
            title: t('类型'),
            dataIndex: 'kind',
            width: 100,
            render: (value?: string) => value
              ? <Tag color={KIND_COLORS[value] || 'default'}>{KIND_LABELS[value] || value}</Tag>
              : '—',
          },
          { title: t('大小'), dataIndex: 'fileSize', width: 110, render: (v: number) => formatFileSize(v) },
          { title: t('版本'), dataIndex: 'currentVersion', width: 80 },
          { title: t('状态'), dataIndex: 'status', width: 100, render: statusTag },
          {
            title: t('操作'),
            width: 100,
            render: (_: unknown, row) => (
              <Popconfirm
                title={t('删除该媒体资产？')}
                onConfirm={() => void remove(row)}
                okText={t('删除')}
                cancelText={t('取消')}
              >
                <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('删除')} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Drawer
        width={520}
        open={detail != null}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.asset.filename || t('媒体详情')}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('文件名')}>{detail.asset.filename}</Descriptions.Item>
            <Descriptions.Item label={t('类型')}>{detail.asset.kind ? (KIND_LABELS[detail.asset.kind] || detail.asset.kind) : '—'}</Descriptions.Item>
            <Descriptions.Item label={t('MIME')}>{detail.asset.mimeType || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('大小')}>{formatFileSize(detail.asset.fileSize)}</Descriptions.Item>
            <Descriptions.Item label={t('当前版本')}>{detail.asset.currentVersion}</Descriptions.Item>
            <Descriptions.Item label={t('状态')}>{statusTag(detail.asset.status || 'ACTIVE')}</Descriptions.Item>
            {detail.asset.mediaTypeName && (
              <Descriptions.Item label={t('媒体类型')}>{detail.asset.mediaTypeName}</Descriptions.Item>
            )}
            {detail.asset.folderPath && (
              <Descriptions.Item label={t('目录')}>{detail.asset.folderPath}</Descriptions.Item>
            )}
            <Descriptions.Item label={t('摘要')}>
              <Typography.Text code copyable>{detail.asset.contentHash || '—'}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        )}
        {detail?.versions?.length ? (
          <>
            <Typography.Title level={5} style={{ marginTop: 20 }}>{t('版本历史')}</Typography.Title>
            <Table
              rowKey="version"
              size="small"
              pagination={false}
              dataSource={detail.versions}
              columns={[
                { title: t('版本'), dataIndex: 'version', width: 70 },
                { title: t('文件名'), dataIndex: 'filename' },
                { title: t('大小'), dataIndex: 'fileSize', width: 100, render: (v: number) => formatFileSize(v) },
                { title: t('时间'), dataIndex: 'storedAt', width: 170, render: (v: string) => formatDateTime(v) },
              ]}
            />
          </>
        ) : null}
      </Drawer>

      <div style={{ marginTop: 24 }}>
        <Typography.Title level={5}>{t('媒体文件夹')}</Typography.Title>
        {siteId && <MediaFoldersPanel siteId={siteId} />}
      </div>
    </div>
  );
}

export default function MediaPage() {
  return (
    <RequireSite>
      <MediaInner />
    </RequireSite>
  );
}
