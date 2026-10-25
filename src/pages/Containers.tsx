import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Dropdown, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message,
  type MenuProps,
} from 'antd';
import { EditOutlined, EllipsisOutlined, HistoryOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { modelsApi, visualLayoutApi } from '../api';
import type { ContainerStructure, ContentType, VisualContainer, VisualContainerRevision } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import './Templates.css';
import { t } from '../i18n/locale';
import { CONTAINER_FORM_DEFAULTS, readContainerForm, writeContainerForm, type ContainerFormValues } from '../utils/containerConfig';
import { formatDateTime } from '../utils/datetime';

function containerDescription(item: VisualContainer) {
  return readContainerForm(item).description || '—';
}

export default function ContainersPage() {
  return <RequireSite><ContainersInner /></RequireSite>;
}

function ContainersInner() {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('item') || undefined;
  const editing = params.get('edit') === '1' || Boolean(editId);

  if (editing) {
    return <ContainerEditor siteId={siteId || ''} id={editId} onCancel={() => navigate('/containers')} />;
  }

  return (
    <ContainerList
      siteId={siteId || ''}
      onAdd={() => navigate('/containers/edit?edit=1')}
      onEdit={(id) => navigate(`/containers/edit?item=${encodeURIComponent(id)}&edit=1`)}
    />
  );
}

function ContainerList({ siteId, onAdd, onEdit }: { siteId: string; onAdd: () => void; onEdit: (id: string) => void }) {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<VisualContainer[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<VisualContainerRevision[]>([]);
  const [historyContainer, setHistoryContainer] = useState<VisualContainer>();
  const selectedId = params.get('item') || undefined;

  const load = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setItems(await visualLayoutApi.containers(siteId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [siteId]);

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.name} ${containerDescription(item)} ${item.id}`.toLowerCase().includes(q));
  }, [items, keyword]);

  const openHistory = async (item: VisualContainer) => {
    setHistoryContainer(item);
    setHistory(await visualLayoutApi.containerRevisions(siteId, item.id));
  };

  const rowMenu = (item: VisualContainer): MenuProps => ({
    items: [
      { key: 'edit', icon: <EditOutlined />, label: t('编辑') },
      { key: 'history', icon: <HistoryOutlined />, label: t('Revision 历史') },
    ],
    onClick: async ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === 'edit') onEdit(item.id);
      else if (key === 'history') await openHistory(item);
    },
  });

  return (
    <div className="templates-page">
      <div className="templates-toolbar">
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('搜索容器')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Space>
        <Button
          className="templates-add"
          type="primary"
          shape="circle"
          size="large"
          icon={<PlusOutlined />}
          onClick={onAdd}
          aria-label={t('添加容器')}
        />
      </div>

      <Table<VisualContainer>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        rowClassName={(row) => (row.id === selectedId ? 'ant-table-row-selected' : '')}
        onRow={(item) => ({
          onClick: () => setParams({ item: item.id }),
          onDoubleClick: () => onEdit(item.id),
        })}
        locale={{ emptyText: <Empty description={t('尚无容器')} /> }}
        columns={[
          {
            title: t('容器名称'),
            dataIndex: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (value, item) => (
              <a onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}>{value}</a>
            ),
          },
          {
            title: t('状态'),
            width: 130,
            render: () => <Tag color="green">Published</Tag>,
          },
          {
            title: t('描述'),
            ellipsis: true,
            render: (_, item) => containerDescription(item),
          },
          {
            title: t('最后修改时间'),
            dataIndex: 'updatedAt',
            width: 190,
            sorter: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
            render: (value) => formatDateTime(value),
          },
          {
            title: '',
            width: 64,
            fixed: 'right',
            render: (_, item) => (
              <Dropdown menu={rowMenu(item)} trigger={['click']}>
                <Button
                  type="text"
                  icon={<EllipsisOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${item.name} 更多操作`}
                />
              </Dropdown>
            ),
          },
        ]}
      />

      <Modal
        title={`${historyContainer?.name || ''} · Revision 历史`}
        open={Boolean(historyContainer)}
        onCancel={() => setHistoryContainer(undefined)}
        footer={null}
        width={780}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={history}
          pagination={false}
          columns={[
            { title: t('版本'), dataIndex: 'version', width: 90 },
            { title: t('作者'), dataIndex: 'author', width: 140 },
            { title: t('说明'), dataIndex: 'message' },
            {
              title: t('时间'),
              dataIndex: 'createdAt',
              width: 190,
              render: (value) => formatDateTime(value),
            },
            {
              title: t('操作'),
              width: 90,
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  disabled={row.version === historyContainer?.currentVersion}
                  onClick={() => Modal.confirm({
                    title: `恢复到 v${row.version}？`,
                    content: t('恢复不会覆盖旧版本，而是创建新的不可变 revision。'),
                    onOk: async () => {
                      if (!historyContainer) return;
                      await visualLayoutApi.restoreContainer(siteId, historyContainer.id, row.version);
                      await load();
                      setHistory(await visualLayoutApi.containerRevisions(siteId, historyContainer.id));
                      message.success(t('已恢复为新 revision'));
                    },
                  })}
                >
                  
                  {t('恢复')}
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}

function ContainerEditor({ siteId, id, onCancel }: { siteId: string; id?: string; onCancel: () => void }) {
  const [form] = Form.useForm<ContainerFormValues>();
  const [current, setCurrent] = useState<VisualContainer>();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [structures, setStructures] = useState<ContainerStructure[]>([]);
  const [activeType, setActiveType] = useState<string>();
  const [loading, setLoading] = useState(false);
  const maxContents = Form.useWatch('maxContents', form) || 0;

  useEffect(() => { if (siteId) void modelsApi.list(siteId).then((items) => setContentTypes(items.filter((item) => item.objectType !== 'PAGE'))); }, [siteId]);
  useEffect(() => {
    if (!id) { form.setFieldsValue(CONTAINER_FORM_DEFAULTS); setStructures([]); return; }
    void visualLayoutApi.getContainer(siteId, id).then((container) => {
      setCurrent(container); form.setFieldsValue({ ...CONTAINER_FORM_DEFAULTS, name: container.name, ...readContainerForm(container) });
      const links = container.containerStructures || [];
      setStructures(links); setActiveType(links[0]?.structureId);
    });
  }, [id, siteId, form]);

  const addStructure = (structureId: string) => {
    if (structures.some((item) => item.structureId === structureId)) return;
    const next = [...structures, { structureId, code: '<div class="content-item">\n  ${content.title!}\n</div>', sortOrder: structures.length * 10 }];
    setStructures(next); setActiveType(structureId);
  };
  const removeStructure = (structureId: string) => {
    const next = structures.filter((item) => item.structureId !== structureId).map((item, index) => ({ ...item, sortOrder: index * 10 }));
    setStructures(next); if (activeType === structureId) setActiveType(next[0]?.structureId);
  };
  const updateCode = (structureId: string, code: string) => setStructures((items) => items.map((item) => item.structureId === structureId ? { ...item, code } : item));

  const save = async (values: ContainerFormValues) => {
    if (values.maxContents > 0 && !structures.length) return message.error(t('Max Contents 大于 0 时至少添加一个 Content Type'));
    setLoading(true);
    try {
      const body = { name: values.name, config: writeContainerForm(values, current?.config), containerStructures: values.maxContents > 0 ? structures : [] };
      if (current) await visualLayoutApi.updateContainer(siteId, current.id, body);
      else await visualLayoutApi.createContainer(siteId, body);
      message.success(t('容器已保存')); onCancel();
    } catch (error) { message.error(error instanceof Error ? error.message : t('保存失败')); }
    finally { setLoading(false); }
  };

  const available = contentTypes.filter((type) => !structures.some((item) => item.structureId === type.id));
  return <div className="templates-page">
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>{id ? t('编辑容器') : t('新建容器')}</Typography.Title>
      <Space><Button onClick={onCancel}>Cancel</Button><Button type="primary" loading={loading} onClick={() => form.submit()}>Save</Button></Space>
    </Space>
    <Form form={form} layout="vertical" onFinish={save} initialValues={CONTAINER_FORM_DEFAULTS}>
      <div style={{ maxWidth: 760 }}>
        <Form.Item name="name" label="Title" rules={[{ required: true, message: t('请输入标题') }]}><Input autoFocus /></Form.Item>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
        <Form.Item name="maxContents" label="Max Contents" extra={t('0 表示单一 Code 模式；大于 0 时启用 Content Type 绑定。')} rules={[{ required: true }]}><InputNumber min={0} style={{ width: 160 }} /></Form.Item>
      </div>
      {maxContents > 0 ? <Card size="small" title="Container Code" style={{ marginBottom: 16 }}>
        <Form.Item name="preLoopFtl" label="Pre-loop"><Editor height="110px" language="html" value={form.getFieldValue('preLoopFtl') || ''} onChange={(value) => form.setFieldValue('preLoopFtl', value || '')} options={{ minimap: { enabled: false }, automaticLayout: true }} /></Form.Item>
        <Typography.Text strong>Content Type Code</Typography.Text>
        <Space wrap style={{ margin: '10px 0' }}><Select showSearch placeholder={t('添加 Content Type')} style={{ width: 280 }} value={undefined} options={available.map((type) => ({ value: type.id, label: `${type.name} (${type.code})` }))} onChange={addStructure} /><Typography.Text type="secondary">{t('每个 Content Type 使用独立 FreeMarker 渲染代码')}</Typography.Text></Space>
        {!structures.length ? <Alert showIcon type="warning" message={t('尚未绑定 Content Type')} /> : <Tabs type="editable-card" hideAdd activeKey={activeType} onChange={setActiveType} onEdit={(key, action) => { if (action === 'remove') removeStructure(String(key)); }} items={structures.map((link) => { const type = contentTypes.find((item) => item.id === link.structureId); return { key: link.structureId, label: type?.name || link.contentTypeName || link.structureId, children: <><Typography.Text type="secondary">{t('变量：')}{type?.code || link.contentTypeVar || link.structureId}</Typography.Text><Typography.Text type="secondary" style={{ display: 'block', margin: '6px 0' }}>{t('可填内联 FreeMarker 源码，或填 templates/xxx.ftl 文件路径（须以 templates/ 开头）；沙箱为单模板隔离，不支持 #include / #import。')}</Typography.Text><Editor height="300px" language="html" value={link.code} onChange={(value) => updateCode(link.structureId, value || '')} options={{ minimap: { enabled: false }, automaticLayout: true }} /></> }; })} />}
        <Form.Item name="postLoopFtl" label="Post-loop" style={{ marginTop: 16 }}><Editor height="110px" language="html" value={form.getFieldValue('postLoopFtl') || ''} onChange={(value) => form.setFieldValue('postLoopFtl', value || '')} options={{ minimap: { enabled: false }, automaticLayout: true }} /></Form.Item>
      </Card> : <Card size="small" title="Code" style={{ marginBottom: 16 }}><Alert showIcon type="info" message={t('单一 Code 模式')} description={<>{t('Max Contents 为 0，不绑定 Content Type，容器直接输出以下 FreeMarker。')}<br />{t('可填内联 FreeMarker 源码，或填 templates/xxx.ftl 文件路径（须以 templates/ 开头）；沙箱为单模板隔离，不支持 #include / #import。')}</>} style={{ marginBottom: 12 }} /><Form.Item name="code"><Editor height="420px" language="html" value={form.getFieldValue('code') || ''} onChange={(value) => form.setFieldValue('code', value || '')} options={{ minimap: { enabled: false }, automaticLayout: true }} /></Form.Item></Card>}
    </Form>
  </div>;
}
