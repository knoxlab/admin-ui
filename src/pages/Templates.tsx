import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Checkbox, Dropdown, Empty, Form, Input, Modal, Radio, Select, Space, Table, Tag, Typography, message,
  type MenuProps,
} from 'antd';
import {
  CodeOutlined, EditOutlined, EllipsisOutlined, HistoryOutlined, LayoutOutlined, PlusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { visualLayoutApi } from '../api';
import type { TemplateLayout, VisualTemplate, VisualTemplateRevision, VisualTheme } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import './Templates.css';
import { t } from '../i18n/locale';
import { formatDateTime } from '../utils/datetime';

const initialLayout = (mode: 'VISUAL' | 'CODE'): TemplateLayout => ({
  mode, columns: 12, header: true, footer: true, sidebar: 'NONE', sidebarWidth: 30,
  code: mode === 'CODE' ? '<#-- FreeMarker template -->\n<@powercms.zone key="main" />' : '', fragmentOverrides: {}, rows: [],
});

function TemplatesInner() {
  const { siteId } = useSite(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [templates, setTemplates] = useState<VisualTemplate[]>([]); const [themes, setThemes] = useState<VisualTheme[]>([]);
  const [loading, setLoading] = useState(false); const [keyword, setKeyword] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const [kindOpen, setKindOpen] = useState(false); const [detailsOpen, setDetailsOpen] = useState(false); const [kind, setKind] = useState<'VISUAL' | 'CODE'>('VISUAL');
  const [history, setHistory] = useState<VisualTemplateRevision[]>([]); const [historyTemplate, setHistoryTemplate] = useState<VisualTemplate>(); const [form] = Form.useForm();
  const selectedId = params.get('item') || undefined;

  const load = async () => {
    if (!siteId) return; setLoading(true);
    try { const [templateList, themeList] = await Promise.all([visualLayoutApi.templates(siteId), visualLayoutApi.themes(siteId)]); setTemplates(templateList); setThemes(themeList); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [siteId]);

  const rows = useMemo(() => templates.filter((item) => {
    if (!showArchived && item.status === 'ARCHIVED') return false;
    const q = keyword.trim().toLowerCase(); return !q || `${item.name} ${item.description || ''} ${themes.find((t) => t.id === item.themeId)?.name || ''}`.toLowerCase().includes(q);
  }), [templates, themes, keyword, showArchived]);
  const openEditor = (item: VisualTemplate) => navigate(`/template-designer?resource=template&item=${encodeURIComponent(item.id)}`);
  const openHistory = async (item: VisualTemplate) => { if (!siteId) return; setHistoryTemplate(item); setHistory(await visualLayoutApi.revisions(siteId, item.id)); };
  const create = async (values: { name: string; description?: string; themeId?: string }) => {
    if (!siteId) return;
    const created = await visualLayoutApi.createTemplate(siteId, { ...values, status: 'DRAFT', layoutJson: JSON.stringify(initialLayout(kind)), message: `创建${kind === 'VISUAL' ? t('设计器') : t('高级代码')}模板` });
    setDetailsOpen(false); form.resetFields(); message.success(t('模板已创建')); openEditor(created);
  };
  const rowMenu = (item: VisualTemplate): MenuProps => ({ items: [
    { key: 'edit', icon: <EditOutlined />, label: t('编辑') },
    { key: 'history', icon: <HistoryOutlined />, label: t('Revision 历史') },
    { key: 'publish', label: t('发布'), disabled: item.status === 'PUBLISHED' },
    { key: 'archive', label: t('归档'), disabled: item.status === 'ARCHIVED' },
  ], onClick: async ({ key, domEvent }) => { domEvent.stopPropagation(); if (!siteId) return; if (key === 'edit') openEditor(item); else if (key === 'history') await openHistory(item); else if (key === 'publish') { await visualLayoutApi.publishTemplate(siteId, item.id); await load(); message.success(t('模板已发布')); } else if (key === 'archive') { await visualLayoutApi.updateTemplate(siteId, item.id, { name: item.name, themeId: item.themeId, description: item.description, layoutJson: item.layoutJson, status: 'ARCHIVED', message: t('从模板列表归档') }); await load(); message.success(t('模板已归档')); } } });

  return <div className="templates-page">
    <div className="templates-toolbar">
      <Space wrap><Input allowClear prefix={<SearchOutlined />} placeholder={t('搜索模板')} value={keyword} onChange={(e) => setKeyword(e.target.value)} /><Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}>{t('显示已归档')}</Checkbox></Space>
      <Button className="templates-add" type="primary" shape="circle" size="large" icon={<PlusOutlined />} onClick={() => { setKind('VISUAL'); setKindOpen(true); }} aria-label={t('添加模板')} />
    </div>
    <Table<VisualTemplate> rowKey="id" loading={loading} dataSource={rows} rowClassName={(r) => r.id === selectedId ? 'ant-table-row-selected' : ''} onRow={(item) => ({ onClick: () => setParams({ item: item.id }), onDoubleClick: () => openEditor(item) })} locale={{ emptyText: <Empty description={t('尚无模板')} /> }} columns={[
      { title: t('模板名称'), dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (value, item) => <a onClick={(e) => { e.stopPropagation(); openEditor(item); }}>{value}</a> },
      { title: t('状态'), dataIndex: 'status', width: 130, render: (value) => <Tag color={value === 'PUBLISHED' ? 'green' : value === 'ARCHIVED' ? 'default' : 'gold'}>{value}</Tag> },
      { title: t('主题'), dataIndex: 'themeId', width: 180, render: (id) => themes.find((t) => t.id === id)?.name || t('未绑定') },
      { title: t('描述'), dataIndex: 'description', ellipsis: true, render: (value) => value || '?' },
      { title: t('最后修改时间'), dataIndex: 'updatedAt', width: 190, sorter: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt), render: (value) => formatDateTime(value) },
      { title: '', width: 64, fixed: 'right', render: (_, item) => <Dropdown menu={rowMenu(item)} trigger={['click']}><Button type="text" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} aria-label={`${item.name} 更多操作`} /></Dropdown> },
    ]} />

    <Modal title={t('创建模板')} open={kindOpen} onCancel={() => setKindOpen(false)} onOk={() => { setKindOpen(false); form.resetFields(); setDetailsOpen(true); }} okText={t('下一步')} destroyOnClose>
      <Radio.Group className="template-kind-options" value={kind} onChange={(e) => setKind(e.target.value)}>
        <Radio.Button value="VISUAL"><Space align="start"><LayoutOutlined className="template-kind-icon" /><span><Typography.Text strong>Designer</Typography.Text><Typography.Paragraph type="secondary">{t('使用拖放工具、行和列创建可复用模板。')}</Typography.Paragraph></span></Space></Radio.Button>
        <Radio.Button value="CODE"><Space align="start"><CodeOutlined className="template-kind-icon" /><span><Typography.Text strong>Advanced</Typography.Text><Typography.Paragraph type="secondary">{t('使用 FreeMarker 创建代码型高级模板。')}</Typography.Paragraph></span></Space></Radio.Button>
      </Radio.Group>
    </Modal>
    <Modal title={t('创建新模板')} open={detailsOpen} onCancel={() => setDetailsOpen(false)} onOk={() => form.submit()} okText={t('保存')} width={700} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={create}>
        <Form.Item name="name" label={t('模板名称')} rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label={t('描述')}><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="themeId" label={t('主题')}><Select allowClear placeholder={t('选择主题')} options={themes.filter((t) => t.validity !== 'INCOMPATIBLE').map((t) => ({ value: t.id, label: `${t.name}${t.shared ? `（共享固定 v${t.pinnedVersion}）` : ''}` }))} /></Form.Item>
        <Form.Item label={t('模板类型')}><Tag color={kind === 'VISUAL' ? 'blue' : 'purple'}>{kind === 'VISUAL' ? 'Designer' : 'Advanced'}</Tag></Form.Item>
      </Form>
    </Modal>
    <Modal title={`${historyTemplate?.name || ''} ? Revision 历史`} open={Boolean(historyTemplate)} onCancel={() => setHistoryTemplate(undefined)} footer={null} width={780}>
      <Table size="small" rowKey="id" dataSource={history} pagination={false} columns={[{ title: t('版本'), dataIndex: 'version', width: 90 }, { title: t('作者'), dataIndex: 'author', width: 140 }, { title: t('说明'), dataIndex: 'message' }, { title: t('时间'), dataIndex: 'createdAt', width: 190, render: (v) => formatDateTime(v, '?') }]} />
    </Modal>
  </div>;
}
export default function TemplatesPage() { return <RequireSite><TemplatesInner /></RequireSite>; }
