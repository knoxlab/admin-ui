import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { FolderAddOutlined, FolderOpenOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons';
import { mediaFolderApi } from '../api';
import type { MediaFolderView } from '../api/types';
import { hasCapability, useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nProvider';

/** 根目录占位选项值（antd Select 不接受 undefined 作为受控值）。 */
const ROOT_VALUE = '__root__';

/**
 * FR-AGT-MEDIA-005 站点媒体目录面板。
 *
 * <p>目录为物化路径树（`media_folder`，(site_id, path) 唯一），资产仍以 `folder_path` 字符串挂载：
 * 管理台在此建目录 / 搬目录，搬移时后端同步重写子目录与资产的路径前缀。查看须站点 `read` 能力，
 * 建/搬须站点 `write` 能力（与 MCP 工具 `create_media_folder` / `move_media` 同一领域服务与门禁）。
 */
export function MediaFoldersPanel({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const { t } = useI18n();
  const canWrite = hasCapability(me, siteId, 'write');

  const [folders, setFolders] = useState<MediaFolderView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moving, setMoving] = useState<MediaFolderView | null>(null);
  const [createForm] = Form.useForm();
  const [moveForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!siteId) {
      setFolders([]);
      return;
    }
    setLoading(true);
    try {
      setFolders((await mediaFolderApi.tree(siteId)) ?? []);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  /** 按物化路径字典序（父先于子），与后端返回口径一致。 */
  const sorted = useMemo(
    () => [...folders].sort((a, b) => a.path.localeCompare(b.path)),
    [folders],
  );

  const parentOptions = useMemo(
    () => [
      { value: ROOT_VALUE, label: t('根目录') },
      ...sorted.map((folder) => ({ value: folder.id, label: folder.path })),
    ],
    [sorted, t],
  );

  /**
   * 搬移目标候选：排除自身与自身子树（后端亦拒成环，这里提前隐藏避免无效提交）。
   */
  const moveTargetOptions = useMemo(() => {
    if (!moving) return [];
    const prefix = `${moving.path}/`;
    return [
      { value: ROOT_VALUE, label: t('根目录') },
      ...sorted
        .filter((folder) => folder.id !== moving.id && !folder.path.startsWith(prefix))
        .map((folder) => ({ value: folder.id, label: folder.path })),
    ];
  }, [moving, sorted, t]);

  const create = async () => {
    let values: { name?: string; parentId?: string };
    try {
      values = await createForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await mediaFolderApi.create(siteId, {
        name: values.name!,
        parentId: values.parentId === ROOT_VALUE || !values.parentId ? null : values.parentId,
      });
      message.success(t('媒体目录已创建'));
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } catch {
      // 拦截器已提示（重复路径返回 409）
    } finally {
      setSaving(false);
    }
  };

  const move = async () => {
    if (!moving) return;
    let values: { parentId?: string };
    try {
      values = await moveForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await mediaFolderApi.move(siteId, moving.id, {
        parentId: values.parentId === ROOT_VALUE || !values.parentId ? null : values.parentId,
      });
      message.success(t('媒体目录已搬移（子目录与资产挂载路径同步更新）'));
      setMoving(null);
      moveForm.resetFields();
      await load();
    } catch {
      // 拦截器已提示（成环或跨站返回 4xx）
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><FolderOpenOutlined /> {t('媒体目录')}</span>}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
          <Button type="primary" icon={<FolderAddOutlined />} disabled={!canWrite}
            onClick={() => setCreateOpen(true)}>{t('新建目录')}</Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        {t('目录以物化路径组织（形如 /images/2026），资产按目录路径挂载；搬移目录会同步重写其子目录与资产的挂载路径。目录级权限沿用站点 read/write 能力。')}
      </Typography.Paragraph>

      {!canWrite && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={t('当前站点角色无 write 能力，仅可查看媒体目录。')} />
      )}

      <Table<MediaFolderView>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={sorted}
        pagination={false}
        locale={{ emptyText: t('暂无媒体目录，可新建后用 Agent 工具或上传挂载资产') }}
        columns={[
          {
            title: t('目录路径'), dataIndex: 'path',
            render: (value: string, row: MediaFolderView) => (
              <Space size={6}>
                <Typography.Text style={{ paddingLeft: row.depth * 12 }}>{value}</Typography.Text>
                {row.parentId === null && <Tag>{t('根级')}</Tag>}
              </Space>
            ),
          },
          { title: t('名称'), dataIndex: 'name', width: 160 },
          { title: t('层级'), dataIndex: 'depth', width: 80 },
          { title: t('直属资产'), dataIndex: 'directAssetCount', width: 100 },
          { title: t('累计资产'), dataIndex: 'totalAssetCount', width: 100 },
          {
            title: t('操作'), width: 100,
            render: (_: unknown, row: MediaFolderView) => (
              <Tooltip title={t('搬移到其他目录')}>
                <Button size="small" type="link" icon={<SwapOutlined />} aria-label={t('搬移目录')}
                  disabled={!canWrite}
                  onClick={() => { setMoving(row); moveForm.resetFields(); }} />
              </Tooltip>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        title={t('新建媒体目录')}
        confirmLoading={saving}
        onOk={() => void create()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        okText={t('确认创建')}
        cancelText={t('取消')}
        okButtonProps={{ disabled: !canWrite }}
      >
        <Form form={createForm} layout="vertical" initialValues={{ parentId: ROOT_VALUE }}>
          <Form.Item name="parentId" label={t('父目录')}>
            <Select options={parentOptions} disabled={!canWrite} />
          </Form.Item>
          <Form.Item name="name" label={t('目录名称')}
            rules={[{ required: true, message: t('请输入目录名称') }]}>
            <Input placeholder={t('如：banners')} disabled={!canWrite} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(moving)}
        title={t('搬移目录：{path}').replace('{path}', moving?.path ?? '')}
        confirmLoading={saving}
        onOk={() => void move()}
        onCancel={() => { setMoving(null); moveForm.resetFields(); }}
        okText={t('确认搬移')}
        cancelText={t('取消')}
        okButtonProps={{ disabled: !canWrite }}
      >
        <Form form={moveForm} layout="vertical" initialValues={{ parentId: ROOT_VALUE }}>
          <Form.Item name="parentId" label={t('目标父目录')} extra={t('自身与其子树不可作为目标（避免成环）')}>
            <Select options={moveTargetOptions} disabled={!canWrite} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default MediaFoldersPanel;
