import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowLeftOutlined, CodeOutlined, EditOutlined, FolderOpenOutlined, SaveOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { cssClassesApi, visualLayoutApi } from '../api';
import type { TemplateLayout, TemplateLayoutBox, VisualContainer, VisualTemplate, VisualTemplateAcl, VisualTemplateRevision, VisualTheme } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import TemplateBuilder from './TemplateBuilder';
import './TemplateDesigner.css';
import { formatDateTime } from '../utils/datetime';

const DEFAULT_LAYOUT: TemplateLayout = { mode: 'VISUAL', columns: 12, header: true, footer: true, sidebar: 'NONE', sidebarWidth: 30, code: '', fragmentOverrides: {}, rows: [] };
const parseLayout = (raw?: string): TemplateLayout => {
  try { const value = JSON.parse(raw || '{}'); return { ...DEFAULT_LAYOUT, ...value, columns: 12, rows: Array.isArray(value.rows) ? value.rows : [] }; }
  catch { return { ...DEFAULT_LAYOUT }; }
};
function DesignerInner() {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedId = params.get('item') || '';
  const [template, setTemplate] = useState<VisualTemplate>();
  const [themes, setThemes] = useState<VisualTheme[]>([]);
  const [containers, setContainers] = useState<VisualContainer[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [activeTab, setActiveTab] = useState('design');
  const [selectedRowId, setSelectedRowId] = useState<string>();
  const [selectedBoxId, setSelectedBoxId] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [apiJson, setApiJson] = useState('');
  const [revisions, setRevisions] = useState<VisualTemplateRevision[]>([]);
  const [acl, setAcl] = useState<VisualTemplateAcl[]>([]);
  const [diff, setDiff] = useState('');
  const [editForm] = Form.useForm();
  const timer = useRef<number>();
  const generation = useRef(0);
  const saveSequence = useRef(0);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const readOnly = template?.status === 'ARCHIVED';

  const loadMeta = useCallback(async (id: string) => {
    if (!siteId) return;
    const [revisionList, aclList] = await Promise.all([visualLayoutApi.revisions(siteId, id), visualLayoutApi.getAcl(siteId, id)]);
    setRevisions(revisionList);
    setAcl(aclList.length ? aclList : [
      { roleCode: 'editor', canView: true, canUse: true, canEdit: true, canPublish: false },
      { roleCode: 'reviewer', canView: true, canUse: true, canEdit: false, canPublish: false },
    ]);
  }, [siteId]);

  const load = useCallback(async () => {
    if (!siteId || !requestedId) { setLoading(false); setTemplate(undefined); return; }
    const loadGeneration = ++generation.current;
    setLoading(true);
    try {
      const [item, themeList, containerList, classList] = await Promise.all([
        visualLayoutApi.getTemplate(siteId, requestedId),
        visualLayoutApi.themes(siteId),
        visualLayoutApi.containers(siteId),
        cssClassesApi.list(siteId).catch(() => ({ classes: [] })),
      ]);
      if (loadGeneration !== generation.current) return;
      setTemplate(item); setLayout(parseLayout(item.layoutJson)); setSelectedRowId(undefined); setSelectedBoxId(undefined); setThemes(themeList); setContainers(containerList); setClasses(classList.classes);
      await loadMeta(item.id);
    } catch (error) {
      if (loadGeneration === generation.current) { setTemplate(undefined); message.error(error instanceof Error ? error.message : 'Unable to open the requested template'); }
    } finally { if (loadGeneration === generation.current) setLoading(false); }
  }, [siteId, requestedId, loadMeta]);

  useEffect(() => { void load(); return () => { generation.current += 1; window.clearTimeout(timer.current); }; }, [load]);

  const persist = useCallback(async (next: TemplateLayout, sequence: number, templateId: string) => {
    if (!siteId || !template || readOnly || template.id !== templateId) return;
    setSaveState('saving');
    try {
      const updated = await visualLayoutApi.updateTemplate(siteId, templateId, { name: template.name, themeId: template.themeId, description: template.description, status: template.status, layoutJson: JSON.stringify(next), message: 'Template Designer autosave' });
      if (sequence !== saveSequence.current || templateId !== requestedId) return;
      setTemplate(updated); setSaveState('saved');
    } catch (error) {
      if (sequence === saveSequence.current) { setSaveState('error'); message.error(error instanceof Error ? error.message : 'Autosave failed'); }
    }
  }, [siteId, template, readOnly, requestedId]);

  const changeLayout = (updater: (current: TemplateLayout) => TemplateLayout) => {
    if (!template || readOnly) return;
    const next = updater(layoutRef.current);
    layoutRef.current = next; setLayout(next); setSaveState('dirty');
    const sequence = ++saveSequence.current;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(next, sequence, template.id), 700);
  };
  const flushSave = () => { if (!template || readOnly || saveState === 'saved') return; window.clearTimeout(timer.current); const sequence = ++saveSequence.current; void persist(layoutRef.current, sequence, template.id); };

  const boxZoneKeys = (box: TemplateLayoutBox) => Array.from(new Set([...(box.zoneKeys || []), ...(box.zoneKey ? [box.zoneKey] : [])]));
  const patchBox = (rowId: string, boxId: string, patch: Partial<TemplateLayoutBox>) => changeLayout((current) => ({ ...current, rows: current.rows.map((row) => row.id === rowId ? { ...row, boxes: row.boxes.map((box) => box.id === boxId ? { ...box, ...patch } : box) } : row) }));
  const deleteZones = async (keys: string[]) => {
    if (!siteId || !template) throw new Error('Template is not available');
    let latest = template;
    for (const key of Array.from(new Set(keys))) {
      const zone = latest.zones.find((item) => item.zoneKey === key) || template.zones.find((item) => item.zoneKey === key);
      if (zone) latest = await visualLayoutApi.deleteZone(siteId, template.id, zone.id);
    }
    setTemplate(latest);
  };
  const removeRow = (rowId: string) => Modal.confirm({
    title: 'Delete Row', content: 'This removes the Row, every Box, and all bound container zones inside it.', okButtonProps: { danger: true },
    onOk: async () => { const row = layoutRef.current.rows.find((item) => item.id === rowId); if (!row) return; try { await deleteZones(row.boxes.flatMap(boxZoneKeys)); changeLayout((c) => ({ ...c, rows: c.rows.filter((item) => item.id !== rowId) })); if (selectedRowId === rowId) { setSelectedRowId(undefined); setSelectedBoxId(undefined); } } catch (error) { message.error(error instanceof Error ? error.message : 'Unable to delete bound zones'); throw error; } },
  });
  const removeBox = (rowId: string, boxId: string) => {
    const row = layoutRef.current.rows.find((item) => item.id === rowId); const box = row?.boxes.find((item) => item.id === boxId);
    if (!row || !box || row.boxes.length <= 1) { message.warning('Each Row must keep at least one Box'); return; }
    Modal.confirm({ title: 'Delete Box', content: 'This removes the Box and all of its bound container zones.', okButtonProps: { danger: true }, onOk: async () => { try { await deleteZones(boxZoneKeys(box)); changeLayout((c) => ({ ...c, rows: c.rows.map((item) => item.id === rowId ? { ...item, boxes: item.boxes.filter((candidate) => candidate.id !== boxId) } : item) })); if (selectedBoxId === boxId) setSelectedBoxId(undefined); } catch (error) { message.error(error instanceof Error ? error.message : 'Unable to delete bound zones'); throw error; } } });
  };
  const nextZoneKey = (prefix: string) => { const used = new Set([...(template?.zones || []).map((zone) => zone.zoneKey), ...(layoutRef.current.sidebarZoneKeys || []), ...layoutRef.current.rows.flatMap((row) => row.boxes.flatMap(boxZoneKeys))]); let index = 1; while (used.has(`${prefix}-${index}`)) index += 1; return `${prefix}-${index}`; };
  const addBoxZone = async (rowId: string, box: TemplateLayoutBox, containerId: string) => {
    if (!siteId || !template || readOnly) return; const safeId = box.id.replace(/[^A-Za-z0-9-]/g, '-'); const key = nextZoneKey(`box-${safeId}`);
    try { const updated = await visualLayoutApi.createZone(siteId, template.id, { zoneKey: key, containerId, sortOrder: template.zones.length * 10, config: '{}' }); setTemplate(updated); patchBox(rowId, box.id, { zoneKeys: [...boxZoneKeys(box), key], zoneKey: undefined }); message.success('Container added'); } catch (error) { message.error(error instanceof Error ? error.message : 'Container binding failed'); }
  };
  const removeBoxZone = async (rowId: string, box: TemplateLayoutBox, key: string) => {
    if (!siteId || !template || readOnly) return; const zone = template.zones.find((item) => item.zoneKey === key); if (!zone) { patchBox(rowId, box.id, { zoneKeys: boxZoneKeys(box).filter((item) => item !== key), ...(box.zoneKey === key ? { zoneKey: undefined } : {}) }); return; }
    try { const updated = await visualLayoutApi.deleteZone(siteId, template.id, zone.id); setTemplate(updated); patchBox(rowId, box.id, { zoneKeys: boxZoneKeys(box).filter((item) => item !== key), ...(box.zoneKey === key ? { zoneKey: undefined } : {}) }); message.success('Container removed'); } catch (error) { message.error(error instanceof Error ? error.message : 'Container removal failed'); }
  };
  const addSidebarZone = async (containerId: string) => { if (!siteId || !template || readOnly) return; const key = nextZoneKey('sidebar'); try { const updated = await visualLayoutApi.createZone(siteId, template.id, { zoneKey: key, containerId, sortOrder: template.zones.length * 10, config: '{}' }); setTemplate(updated); changeLayout((c) => ({ ...c, sidebarZoneKeys: [...(c.sidebarZoneKeys || []), key] })); message.success('Sidebar container added'); } catch (error) { message.error(error instanceof Error ? error.message : 'Sidebar container failed'); } };
  const removeSidebarZone = async (key: string) => { if (!siteId || !template || readOnly) return; const zone = template.zones.find((item) => item.zoneKey === key); try { if (zone) setTemplate(await visualLayoutApi.deleteZone(siteId, template.id, zone.id)); changeLayout((c) => ({ ...c, sidebarZoneKeys: (c.sidebarZoneKeys || []).filter((item) => item !== key) })); message.success('Sidebar container removed'); } catch (error) { message.error(error instanceof Error ? error.message : 'Sidebar container removal failed'); } };

  const prepareImmediateSave = () => {
    window.clearTimeout(timer.current);
    saveSequence.current += 1;
    setSaveState('saving');
    return layoutRef.current;
  };
  const applyImmediateSave = (updated: VisualTemplate) => {
    const savedLayout = parseLayout(updated.layoutJson);
    layoutRef.current = savedLayout; setLayout(savedLayout); setTemplate(updated); setSaveState('saved');
  };
  const saveDetails = async (values: { name: string; description?: string }) => {
    if (!siteId || !template || readOnly) return;
    const currentLayout = prepareImmediateSave();
    try {
      const updated = await visualLayoutApi.updateTemplate(siteId, template.id, { ...values, themeId: template.themeId, status: template.status, layoutJson: JSON.stringify(currentLayout), message: 'Edit template details' });
      applyImmediateSave(updated); setEditOpen(false); message.success('Template details saved');
    } catch (error) { setSaveState('error'); message.error(error instanceof Error ? error.message : 'Failed to save template details'); }
  };
  const chooseTheme = async (themeId?: string) => {
    if (!siteId || !template || readOnly) return;
    const currentLayout = prepareImmediateSave();
    try {
      const updated = await visualLayoutApi.updateTemplate(siteId, template.id, { name: template.name, description: template.description, themeId, status: template.status, layoutJson: JSON.stringify(currentLayout), message: 'Change template theme' });
      applyImmediateSave(updated); setThemeOpen(false); message.success('Theme updated');
    } catch (error) { setSaveState('error'); message.error(error instanceof Error ? error.message : 'Failed to update theme'); }
  };
  const openApi = async () => {
    if (!siteId || !template) return;
    try { const doc = await visualLayoutApi.document(siteId, template.id); setApiJson(JSON.stringify(doc, null, 2)); setApiOpen(true); }
    catch (error) { message.error(error instanceof Error ? error.message : 'Failed to load API document'); }
  };
  const publish = async () => { try { await visualLayoutApi.publishTemplate(siteId!, template!.id); message.success('Template published'); await load(); } catch (error) { message.error(error instanceof Error ? error.message : 'Failed to publish template'); } };
  const deleteTemplate = async () => { try { await visualLayoutApi.deleteTemplate(siteId!, template!.id); navigate('/templates'); } catch (error) { message.error(error instanceof Error ? error.message : 'Failed to delete template'); throw error; } };
  const saveAcl = async () => { try { const saved = await visualLayoutApi.replaceAcl(siteId!, template!.id, acl); setAcl(saved); message.success('Permissions saved'); } catch (error) { message.error(error instanceof Error ? error.message : 'Failed to save permissions'); } };
  const compareRevision = async (version: number) => { try { const items = await visualLayoutApi.diff(siteId!, template!.id, version, revisions[0]?.version || version); setDiff(items.map((x) => `${x.change} ${x.path}`).join('\n') || 'No differences'); } catch (error) { message.error(error instanceof Error ? error.message : 'Failed to compare revisions'); } };
  const restoreRevision = async (version: number) => { try { await visualLayoutApi.restore(siteId!, template!.id, version); message.success('Revision restored'); await load(); } catch (error) { message.error(error instanceof Error ? error.message : 'Failed to restore revision'); } };

  const saveLabel = saveState === 'saving' ? 'Saving...' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Save failed' : 'Saved';
  const selectedTheme = themes.find((theme) => theme.id === template?.themeId);

  if (loading) return <div className="template-designer-loading">Opening template...</div>;
  if (!template) return <Empty description={requestedId ? 'The URL template was not found or is inaccessible' : 'The URL is missing the item parameter'}><Button onClick={() => navigate('/templates')}>Back to Templates</Button></Empty>;

  const codeEditor = <Card className="template-code-card" title={<Space><CodeOutlined />CODE / FreeMarker</Space>}><Editor height="calc(100vh - 330px)" language="html" value={layout.code || ''} onChange={(value) => changeLayout((c) => ({ ...c, code: value || '' }))} options={{ minimap: { enabled: false }, fontSize: 13, readOnly }} /></Card>;
  const switchMode = (mode: 'VISUAL' | 'CODE') => changeLayout((current) => ({ ...current, mode, code: mode === 'CODE' && !(current.code || '').trim() ? '<#-- FreeMarker template -->\n${pageBody!}' : current.code }));
  const design = <TemplateBuilder layout={layout} zones={template.zones} containers={containers} classes={classes} disabled={Boolean(readOnly)} selectedRowId={selectedRowId} selectedBoxId={selectedBoxId} onSelection={(rowId, boxId) => { setSelectedRowId(rowId); setSelectedBoxId(boxId); }} onChange={changeLayout} onDeleteRow={removeRow} onDeleteBox={removeBox} onAddZone={(rowId, box, containerId) => void addBoxZone(rowId, box, containerId)} onRemoveZone={(rowId, box, key) => void removeBoxZone(rowId, box, key)} onAddSidebarZone={(containerId) => void addSidebarZone(containerId)} onRemoveSidebarZone={(key) => void removeSidebarZone(key)} onTheme={() => setThemeOpen(true)} onLayout={() => setLayoutOpen(true)} onMode={switchMode} codeEditor={codeEditor} />;

  return <div className="template-designer-page">
    <header className="dotcms-topbar">
      <Space><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/templates')}>Templates</Button><div><Typography.Title level={4}>{template.name}</Typography.Title><Space size={6}><Tag>{template.status}</Tag><Typography.Text type="secondary">{selectedTheme?.name || 'No theme'} / v{template.currentVersion || 0}</Typography.Text></Space></div></Space>
      <Space wrap>
        <Typography.Text className={`save-state state-${saveState}`}>{saveLabel}</Typography.Text>
        <Button icon={<EditOutlined />} disabled={readOnly} onClick={() => { editForm.setFieldsValue(template); setEditOpen(true); }}>Edit</Button>
        <Button icon={<ApiOutlined />} onClick={() => void openApi()}>API</Button>
        <Button disabled={readOnly} onClick={() => void publish()}>Publish</Button>
        <Button danger disabled={readOnly} onClick={() => Modal.confirm({ title: 'Delete template', content: 'This removes the template, ACL and revision history.', okButtonProps: { danger: true }, onOk: deleteTemplate })}>Delete</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={readOnly || saveState === 'saved'} onClick={flushSave}>Save</Button>
      </Space>
    </header>
    {readOnly && <Alert className="archived-alert" type="warning" showIcon message="Archived template is read-only" description="History and permissions can be viewed but not edited. Restore or duplicate it before making changes." />}
    <Tabs activeKey={activeTab} onChange={setActiveTab} className="designer-tabs" items={[
      { key: 'design', label: 'Design', children: design },
      { key: 'permissions', label: 'Permissions', children: <Space direction="vertical" className="full-width"><Alert type="info" showIcon message="Template ACL" description="Permissions are retained independently from the design." /><Table size="small" rowKey="roleCode" pagination={false} dataSource={acl} columns={[
        { title: 'Role', dataIndex: 'roleCode', render: (value, row) => <Input value={value} disabled={readOnly} onChange={(e) => setAcl((list) => list.map((x) => x === row ? { ...x, roleCode: e.target.value } : x))} /> },
        ...(['canView', 'canUse', 'canEdit', 'canPublish'] as const).map((key) => ({ title: key.replace('can', ''), dataIndex: key, render: (value: boolean, row: VisualTemplateAcl) => <Switch checked={value} disabled={readOnly} onChange={(checked) => setAcl((list) => list.map((x) => x === row ? { ...x, [key]: checked } : x))} /> })),
      ]} /><Space><Button disabled={readOnly} onClick={() => setAcl((list) => [...list, { roleCode: `role-${list.length + 1}`, canView: true, canUse: false, canEdit: false, canPublish: false }])}>Add role</Button><Button type="primary" disabled={readOnly} onClick={() => void saveAcl()}>Save permissions</Button></Space></Space> },
      { key: 'history', label: 'History', children: <Space direction="vertical" className="full-width"><Table size="small" rowKey="id" pagination={false} dataSource={revisions} columns={[{ title: 'Version', dataIndex: 'version', width: 90 }, { title: 'Author', dataIndex: 'author' }, { title: 'Message', dataIndex: 'message' }, { title: 'Date', dataIndex: 'createdAt', render: (value) => formatDateTime(value, 'N/A') }, { title: 'Actions', render: (_, row) => <Space><Button type="link" onClick={() => void compareRevision(row.version)}>Compare</Button><Button type="link" disabled={readOnly} onClick={() => void restoreRevision(row.version)}>Restore</Button></Space> }]} />{diff && <Input.TextArea rows={7} readOnly value={diff} />}</Space> },
    ]} />

    <Modal title="Edit template" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()}><Form form={editForm} layout="vertical" onFinish={saveDetails}><Form.Item name="name" label="Template name" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="description" label="Description"><Input.TextArea rows={4} /></Form.Item></Form></Modal>
    <Modal title="Theme" open={themeOpen} onCancel={() => setThemeOpen(false)} footer={null}><Typography.Paragraph type="secondary">Choose an existing file-backed theme. Theme files are managed under /application/themes in the Site Browser.</Typography.Paragraph><Select className="full-width" allowClear value={template.themeId} placeholder="No theme" options={themes.filter((item) => item.validity === 'VALID' && item.status === 'PUBLISHED').map((item) => ({ value: item.id, label: `${item.name}${item.readOnly ? ' / read-only' : ''}` }))} onChange={(id) => void chooseTheme(id)} /><Button type="link" icon={<FolderOpenOutlined />} onClick={() => navigate('/browser?path=%2Fapplication%2Fthemes')}>Manage theme files</Button></Modal>
    <Modal title="Layout" open={layoutOpen} onCancel={() => setLayoutOpen(false)} onOk={() => setLayoutOpen(false)}><Space direction="vertical" className="full-width" size="large"><Space>Header <Switch checked={layout.header} onChange={(header) => changeLayout((c) => ({ ...c, header }))} /></Space><Space>Footer <Switch checked={layout.footer} onChange={(footer) => changeLayout((c) => ({ ...c, footer }))} /></Space><Space>Sidebar <Select value={layout.sidebar} options={[{ value: 'NONE' }, { value: 'LEFT' }, { value: 'RIGHT' }]} onChange={(sidebar) => changeLayout((c) => ({ ...c, sidebar }))} /></Space>{layout.sidebar !== 'NONE' && <Space>Sidebar width <Select value={layout.sidebarWidth} options={[20, 30, 40].map((value) => ({ value, label: `${value}%` }))} onChange={(sidebarWidth) => changeLayout((c) => ({ ...c, sidebarWidth }))} /></Space>}</Space></Modal>
    <Modal title="Template API" width={900} open={apiOpen} onCancel={() => setApiOpen(false)} footer={null}><Editor height="520px" language="json" value={apiJson} options={{ readOnly: true, minimap: { enabled: false } }} /></Modal>
  </div>;
}

export default function TemplateDesignerPage() { return <RequireSite><DesignerInner /></RequireSite>; }
