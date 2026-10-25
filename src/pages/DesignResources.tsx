import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Form, Input, List, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { HistoryOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { visualLayoutApi } from '../api';
import type { ThemeRevision, VisualContainer, VisualTemplate, VisualTemplateAcl, VisualTemplateRevision, VisualContainerRevision, VisualTheme } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { formatDateTimeSeconds } from '../utils/datetime';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';

export type DesignResourceKind = 'theme' | 'template' | 'container';

type Resource = VisualTheme | VisualTemplate | VisualContainer;

const labels = {
  theme: { title: '主题', singular: '主题', deepKey: 'theme' },
  template: { title: '模板', singular: '模板', deepKey: 'template' },
  container: { title: '容器', singular: '容器', deepKey: 'container' },
} as const;

function DesignResourcesInner({ kind }: { kind: DesignResourceKind }) {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<ThemeRevision | VisualTemplateRevision | VisualContainerRevision>>([]);
  const [acl, setAcl] = useState<VisualTemplateAcl[]>([]);
  /** 页面提示层（管理规则说明）：可关闭，「?」恢复。 */
  const hint = usePageHint();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aclOpen, setAclOpen] = useState(false);
  const [containerOpen, setContainerOpen] = useState(false);
  const [containerForm] = Form.useForm();
  const selectedId = searchParams.get('item') || undefined;
  const selected = resources.find((resource) => resource.id === selectedId);
  const copy = labels[kind];

  const load = async () => {
    if (!siteId) { setResources([]); return; }
    setLoading(true);
    try {
      const list = kind === 'theme' ? await visualLayoutApi.themes(siteId)
        : kind === 'template' ? await visualLayoutApi.templates(siteId)
          : await visualLayoutApi.containers(siteId);
      const requested = searchParams.get('item');
      if (requested) {
        try {
          const detail = kind === 'theme' ? await visualLayoutApi.getTheme(siteId, requested)
            : kind === 'template' ? await visualLayoutApi.getTemplate(siteId, requested)
              : await visualLayoutApi.getContainer(siteId, requested);
          setResources(list.some((resource) => resource.id === detail.id) ? list : [detail, ...list]);
        } catch {
          setResources(list);
          const next = new URLSearchParams(searchParams); next.delete('item'); setSearchParams(next, { replace: true });
          message.warning(`${copy.singular}不存在或不属于当前站点，已清除深链`);
        }
      } else setResources(list);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [siteId, kind]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((resource) => resource.name.toLowerCase().includes(q)
      || ('description' in resource && resource.description?.toLowerCase().includes(q))
      || resource.id.toLowerCase().includes(q));
  }, [keyword, resources]);

  const select = (id: string) => {
    const next = new URLSearchParams(searchParams); next.set('item', id); setSearchParams(next);
  };

  const openHistory = async () => {
    if (!siteId || !selected) return;
    setHistory(kind === 'theme'
      ? await visualLayoutApi.themeHistory(siteId, selected.id)
      : kind === 'template' ? await visualLayoutApi.revisions(siteId, selected.id)
        : await visualLayoutApi.containerRevisions(siteId, selected.id));
    setHistoryOpen(true);
  };

  const openAcl = async () => {
    if (!siteId || !selected || kind !== 'template') return;
    setAcl(await visualLayoutApi.getAcl(siteId, selected.id)); setAclOpen(true);
  };

  const saveContainer = async (values: { name: string; allowedComponentTypes?: string; config?: string }) => {
    if (!siteId) return;
    const current = selected as VisualContainer | undefined;
    if (current) await visualLayoutApi.updateContainer(siteId, current.id, values);
    else await visualLayoutApi.createContainer(siteId, values);
    setContainerOpen(false); containerForm.resetFields(); await load(); message.success(t('容器已保存'));
  };

  const openContainer = (container?: VisualContainer) => {
    containerForm.setFieldsValue(container || { allowedComponentTypes: '[]', config: '{}' }); setContainerOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHintAlert
        hint={hint}
        message={`${copy.title}管理`}
        description={kind === 'theme'
          ? t('主题支持本站与共享包；package revision 不可变，共享主题仅只读。')
          : kind === 'template' ? t('模板支持不可变 revision、ACL 与可视化/代码布局；请在模板列表中创建和编辑。')
            : t('容器限制允许组件类型与展示 FTL；保存会创建不可变 revision，可从历史恢复。')} />
      <Space wrap>
        <Input allowClear prefix={<SearchOutlined />} placeholder={`搜索${copy.singular}名称、描述或 ID`} value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 360 }} />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t('刷新')}</Button>
        {kind === 'theme' && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/template-designer?resource=theme&create=1')}>{t('新建主题')}</Button>}
        {kind === 'template' && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/templates')}>{t('前往模板列表')}</Button>}
        {kind === 'container' && <Button type="primary" icon={<PlusOutlined />} onClick={() => openContainer()}>{t('新建容器')}</Button>}
        <PageHintRestore hint={hint} />
      </Space>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 38%) minmax(420px, 1fr)', gap: 16 }}>
        <Card size="small" title={`${copy.title}（${filtered.length}）`} loading={loading}>
          <List dataSource={filtered} locale={{ emptyText: `暂无${copy.singular}` }} renderItem={(resource) => (
            <List.Item onClick={() => select(resource.id)} style={{ cursor: 'pointer', background: resource.id === selectedId ? '#e6f4ff' : undefined, paddingInline: 8 }}>
              <List.Item.Meta title={resource.name} description={<Space wrap><Typography.Text type="secondary">{resource.id}</Typography.Text>{'status' in resource && <Tag>{resource.status}</Tag>}{'currentVersion' in resource && <Tag>v{resource.currentVersion || 0}</Tag>}{'readOnly' in resource && resource.readOnly && <Tag color="purple">{t('共享只读')}</Tag>}</Space>} />
            </List.Item>
          )} />
        </Card>
        <Card size="small" title={t('资源详情')}>
          {!selected ? <Empty description={`请选择${copy.singular}`} /> : <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label={t('名称')}>{selected.name}</Descriptions.Item>
              {'description' in selected && <Descriptions.Item label={t('描述')}>{selected.description || '—'}</Descriptions.Item>}
              {'status' in selected && <Descriptions.Item label={t('状态')}>{selected.status}</Descriptions.Item>}
              {'currentVersion' in selected && <Descriptions.Item label={t('当前 revision')}>v{selected.currentVersion || 0}</Descriptions.Item>}
              {kind === 'template' && <Descriptions.Item label={t('投放区')}>{(selected as VisualTemplate).zones.length}</Descriptions.Item>}
              {kind === 'container' && <Descriptions.Item label={t('允许组件类型')}>{(selected as VisualContainer).allowedComponentTypes || '[]'}</Descriptions.Item>}
            </Descriptions>
            <Space wrap style={{ marginTop: 16 }}>
              <Button icon={<HistoryOutlined />} onClick={() => void openHistory()}>{t('Revision 历史')}</Button>
              {kind === 'template' && <Button onClick={() => void openAcl()}>{t('查看权限')}</Button>}
              {kind === 'template' && <Button type="primary" onClick={() => navigate(`/template-designer?resource=template&item=${selected.id}`)}>{t('打开编辑器')}</Button>}
              {kind === 'theme' && <Button type="primary" onClick={() => navigate(`/template-designer?resource=theme&item=${selected.id}`)}>{t('在设计器中打开')}</Button>}
              {kind === 'container' && <Button type="primary" onClick={() => openContainer(selected as VisualContainer)}>{t('编辑容器')}</Button>}
            </Space>
          </>}
        </Card>
      </div>
      <Modal title={`${copy.singular} Revision 历史`} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={820}>
        <Table size="small" rowKey="id" dataSource={history} pagination={false} columns={[
          { title: t('版本'), dataIndex: 'version', width: 90 }, { title: t('作者'), dataIndex: 'author', width: 140 },
          { title: t('说明'), dataIndex: 'message' }, { title: t('时间'), dataIndex: 'createdAt', width: 190, render: (value: string) => formatDateTimeSeconds(value) },
          ...(kind === 'container' ? [{ title: t('操作'), width: 90, render: (_: unknown, row: ThemeRevision | VisualTemplateRevision | VisualContainerRevision) => <Button type="link" size="small" disabled={row.version === (selected as VisualContainer | undefined)?.currentVersion} onClick={() => Modal.confirm({ title: `恢复到 v${row.version}？`, content: t('恢复不会覆盖旧版本，而是创建新的不可变 revision。'), onOk: async () => { if (!siteId || !selected) return; await visualLayoutApi.restoreContainer(siteId, selected.id, row.version); await load(); setHistory(await visualLayoutApi.containerRevisions(siteId, selected.id)); message.success(t('已恢复为新 revision')); } })}>{t('恢复')}</Button> }] : []),
        ]} />
      </Modal>
      <Modal title={t('模板权限 ACL')} open={aclOpen} onCancel={() => setAclOpen(false)} footer={null} width={760}>
        <Alert type="info" showIcon message={t('此处仅查看；修改 ACL 请在模板编辑器中操作，且需要 site-admin。')} style={{ marginBottom: 12 }} />
        <Table size="small" rowKey="roleCode" dataSource={acl} pagination={false} columns={[
          { title: t('角色'), dataIndex: 'roleCode' }, { title: t('查看'), dataIndex: 'canView', render: BooleanTag },
          { title: t('使用'), dataIndex: 'canUse', render: BooleanTag }, { title: t('编辑'), dataIndex: 'canEdit', render: BooleanTag },
          { title: t('发布'), dataIndex: 'canPublish', render: BooleanTag },
        ]} />
      </Modal>
      <Modal title={selected ? t('编辑容器') : t('新建容器')} open={containerOpen} onCancel={() => setContainerOpen(false)} onOk={() => containerForm.submit()} destroyOnClose>
        <Form form={containerForm} layout="vertical" onFinish={saveContainer}>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="allowedComponentTypes" label={t('允许组件类型 JSON')} rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="config" label={t('配置 JSON')} rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function BooleanTag(value: boolean) { return <Tag color={value ? 'green' : 'default'}>{value ? t('是') : t('否')}</Tag>; }

export default function DesignResourcesPage({ kind }: { kind: DesignResourceKind }) {
  return <RequireSite><DesignResourcesInner kind={kind} /></RequireSite>;
}
