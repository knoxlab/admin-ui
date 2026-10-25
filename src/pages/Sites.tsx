import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Spin, Table, Tabs, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { sitesApi } from '../api';
import type { Site, SiteDeletionBlocker, SiteDeletionPreview } from '../api/types';
import { useSite } from '../context/SiteContext';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: '活跃' },
  FROZEN: { color: 'orange', label: '已冻结' },
  ARCHIVED: { color: 'default', label: '已归档' },
};

/** 删除预览影响面表 → 展示名（t() 本地化）。 */
const IMPACT_LABEL: Record<string, string> = {
  content_type: '内容类型',
  content_item: '内容项',
  category: '栏目',
  media_asset: '媒体资产',
  site_folder: '站点文件夹',
  site_controller: '控制器',
  site_template: '模板',
  site_theme: '主题',
  site_container: '容器',
  template_project: '模板工程',
  release: 'Release',
  deployment: '部署',
  form_definition: '表单',
  interaction_submission: '互动提交',
  doc_unit: '知识库文档',
  analytics_event: '统计事件',
};

/** 阻断项按 code 本地化（{count} 插值；后端 message 为中文兜底）。 */
const BLOCKER_TEXT: Record<string, string> = {
  USER_HOME_SITE: '被 {count} 个用户设为主站点，请先改绑或清空其主站点',
  THEME_SHARED: '主题被其他站点共享消费（site_theme_share × {count}），请先解除共享',
  CROSS_SITE_INHERIT: '其他站点通过继承列引用本站（{count} 行），请先解除继承',
  FOREIGN_RELEASE_THEME_REF: '其他站点的发布引用本站主题版本（release_theme_version × {count}）',
  CROSS_SITE_REFERENCE: '其他站点的数据引用本站（{count} 行）',
};

const blockerText = (b: SiteDeletionBlocker) =>
  BLOCKER_TEXT[b.code] ? t(BLOCKER_TEXT[b.code], { count: b.count }) : b.message;

export default function SitesPage() {
  const { sites, refresh, setSiteId, siteId } = useSite();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('active');
  const [archived, setArchived] = useState<Site[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  // FR-SITE-LC-007：归档站点删除（先预览影响面与外部引用，再确认执行）
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deletePreview, setDeletePreview] = useState<SiteDeletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 页面提示信息层：关闭图标可隐藏；隐藏后标题右侧「?」图标可再次显示。 */
  const hint = usePageHint();

  const openDeletePreview = useCallback(async (row: Site) => {
    setDeleteTarget(row);
    setDeletePreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      setDeletePreview(await sitesApi.deletionPreview(row.id));
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setPreviewError(e.response?.data?.message || t('读取删除预览失败'));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const closeDeletePreview = () => {
    setDeleteTarget(null);
    setDeletePreview(null);
    setPreviewError(null);
  };


  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      setArchived(await sitesApi.list({ status: 'ARCHIVED' }));
    } catch {
      setArchived([]);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === 'archived') void loadArchived();
  }, [tab, loadArchived]);

  const rows = tab === 'active' ? sites : archived;

  const afterMutation = async () => {
    await Promise.all([refresh(), loadArchived()]);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deletePreview?.deletable) return;
    setDeleting(true);
    try {
      await sitesApi.delete(deleteTarget.id);
      message.success(t('站点已删除'));
      closeDeletePreview();
      await afterMutation();
    } finally {
      setDeleting(false);
    }
  };

  const actions = (row: Site) => {
    const isActive = row.status === 'ACTIVE';
    const isFrozen = row.status === 'FROZEN';
    const isArchived = row.status === 'ARCHIVED';
    return (
      <Space>
        {tab === 'active' && (
          <Button size="small" onClick={() => setSiteId(row.id)}>
            
            {t('设为当前')}
          </Button>
        )}
        {isActive && (
          <Button
            size="small"
            onClick={() =>
              Modal.confirm({
                title: t('冻结站点'),
                content: `冻结后站点将禁止写入（读取不受影响），可在列表中继续执行归档。确定冻结「${row.name}」吗？`,
                okButtonProps: { danger: true },
                okText: t('冻结'),
                cancelText: t('取消'),
                onOk: async () => {
                  await sitesApi.freeze(row.id);
                  message.success(t('已冻结'));
                  await afterMutation();
                },
              })
            }
          >
            
            {t('冻结')}
          </Button>
        )}
        {isFrozen && (
          <Button
            size="small"
            danger
            onClick={() =>
              Modal.confirm({
                title: t('归档站点'),
                content: `归档将停止发布任务，保留只读查询。确定归档「${row.name}」吗？`,
                okButtonProps: { danger: true },
                okText: t('归档'),
                cancelText: t('取消'),
                onOk: async () => {
                  await sitesApi.archive(row.id);
                  message.success(t('已归档'));
                  await afterMutation();
                },
              })
            }
          >
            
            {t('归档')}
          </Button>
        )}
        {isFrozen && (
          <Button size="small" onClick={async () => { await sitesApi.unarchive(row.id); message.success(t('已恢复')); await afterMutation(); }}>
            
            {t('解冻')}
          </Button>
        )}
        {isArchived && (
          <Button size="small" onClick={async () => { await sitesApi.unarchive(row.id); message.success(t('已恢复')); await afterMutation(); }}>
            
            {t('恢复')}
          </Button>
        )}
        {isArchived && (
          <Button
            size="small"
            danger
            data-testid="site-delete-button"
            onClick={() => void openDeletePreview(row)}
          >
            {t('删除')}
          </Button>
        )}
      </Space>
    );
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          
          {t('站点与环境')}
        </Typography.Title>
        <Space>
          <PageHintRestore hint={hint} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            {t('新建站点')}
          </Button>
        </Space>
      </Space>
      <PageHintAlert
        hint={hint}
        message={t('当前工作站点可通过顶部下拉切换；冻结站点保留在列表中以便归档，已归档站点在「已归档」页签中显示。')}
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'active', label: `进行中（${sites.length}）` },
          { key: 'archived', label: `已归档（${archived.length}）` },
        ]}
      />
      <Table
        rowKey="id"
        loading={tab === 'archived' ? archivedLoading : undefined}
        dataSource={rows}
        columns={[
          {
            title: t('名称'),
            dataIndex: 'name',
            render: (name: string, row: Site) => (
              <Space>
                {tab === 'active' ? (
                  <a onClick={() => setSiteId(row.id)}>{name}</a>
                ) : (
                  <span>{name}</span>
                )}
                {row.id === siteId && <Tag color="blue">{t('当前')}</Tag>}
              </Space>
            ),
          },
          { title: 'Key', dataIndex: 'siteKey' },
          {
            title: t('站点 UUID'),
            dataIndex: 'id',
            width: 340,
            render: (id: string) => (
              <Typography.Text copyable={{ text: id }} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
                {id}
              </Typography.Text>
            ),
          },
          {
            title: t('状态'),
            dataIndex: 'status',
            render: (s: string) => {
              const meta = STATUS_TAG[s] ?? { color: 'default', label: s };
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          { title: t('区域'), dataIndex: 'defaultLocale' },
          { title: t('时区'), dataIndex: 'timezone' },
          {
            title: t('操作'),
            render: (_: unknown, row: Site) => actions(row),
          },
        ]}
      />
      <Modal
        title={t('新建站点')}
        open={open}
        onCancel={() => setOpen(false)}
        confirmLoading={loading}
        onOk={() => {
          const form = document.getElementById('site-create-form') as HTMLFormElement | null;
          form?.requestSubmit();
        }}
        destroyOnClose
      >
        <Form
          id="site-create-form"
          layout="vertical"
          onFinish={async (v) => {
            setLoading(true);
            try {
              const site = await sitesApi.create(v);
              message.success(t('站点已创建'));
              setOpen(false);
              await refresh();
              setSiteId(site.id);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="siteKey" label={t('站点 Key')} rules={[{ required: true }]}>
            <Input placeholder={t('例如 demo')} />
          </Form.Item>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('描述')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="defaultLocale" label={t('默认语言')} initialValue="zh-CN">
            <Input />
          </Form.Item>
          <Form.Item name="timezone" label={t('时区')} initialValue="Asia/Shanghai">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={deleteTarget ? t('删除站点「{name}」', { name: deleteTarget.name }) : t('删除站点')}
        open={Boolean(deleteTarget)}
        onCancel={closeDeletePreview}
        onOk={confirmDelete}
        okText={t('永久删除')}
        cancelText={t('取消')}
        okButtonProps={{ danger: true, disabled: !deletePreview?.deletable, loading: deleting }}
        confirmLoading={deleting}
        destroyOnClose
        width={560}
      >
        {previewLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin />
          </div>
        ) : previewError ? (
          <Alert type="error" showIcon message={previewError} />
        ) : deletePreview ? (
          <div>
            {deletePreview.status !== 'ARCHIVED' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message={t('仅已归档站点可删除')}
              />
            )}
            {deletePreview.blockers.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message={t('无法删除')}
                description={
                  <div>
                    <div>{t('该站点仍被以下外部引用关联，无法删除：')}</div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {deletePreview.blockers.map((b) => (
                        <li key={b.code}>{blockerText(b)}</li>
                      ))}
                    </ul>
                  </div>
                }
              />
            )}
            {deletePreview.deletable && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message={t('此操作不可撤销：将永久删除该站点的全部数据，包括内容类型、内容与版本、栏目、媒体、模板与主题、容器、发布与部署、表单、工作流、互动、知识库、AI 配置与统计数据。审计日志将保留。')}
              />
            )}
            <Typography.Paragraph strong style={{ marginBottom: 4 }}>
              {t('删除后，以下数据将被永久删除：')}
            </Typography.Paragraph>
            <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 220, overflowY: 'auto' }}>
              {Object.entries(deletePreview.impact)
                .filter(([, n]) => n > 0)
                .map(([table, n]) => (
                  <li key={table}>
                    {t(IMPACT_LABEL[table] ?? table)}：{n}
                  </li>
                ))}
              {Object.values(deletePreview.impact).every((n) => n === 0) && (
                <li>{t('无业务数据')}</li>
              )}
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
