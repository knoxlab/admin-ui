import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Col, Form, Input, List, Modal, Row, Select, Space, Tabs, Tag, Tree, Typography, message } from 'antd';
import { CloudUploadOutlined, FormatPainterOutlined, PlusOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { buildsApi, previewApi, templatesApi } from '../api';
import type { BuildJob, BuildLog, DependencyReport, TemplateFile, TemplateProject } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n/locale';
import { clearControllerScriptCache } from '../form/formController';
import { openInNewTab } from '../openInNewTab';

type OpenDocument = { content: string; saved: string };
type TreeNode = { key: string; title: string; children?: TreeNode[]; isLeaf?: boolean };

const BUILD_TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);
const BUILD_POLL_INTERVAL_MS = 1000;
const BUILD_POLL_TIMEOUT_MS = 16 * 60 * 1000;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const languageFor = (path: string) => ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', css: 'css', scss: 'scss', html: 'html', vue: 'html', md: 'markdown', yaml: 'yaml', yml: 'yaml' }[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext');

function fileTree(files: TemplateFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    let level = root;
    file.path.split('/').forEach((part, index, parts) => {
      let node = level.find((item) => item.title === part);
      if (!node) { node = { key: parts.slice(0, index + 1).join('/'), title: part, isLeaf: index === parts.length - 1, children: index === parts.length - 1 ? undefined : [] }; level.push(node); }
      level = node.children ?? [];
    });
  }
  return root;
}

function IdeInner() {
  const { siteId } = useSite(); const { username } = useAuth();
  const [projects, setProjects] = useState<TemplateProject[]>([]); const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<TemplateFile[]>([]); const [documents, setDocuments] = useState<Record<string, OpenDocument>>({}); const [activePath, setActivePath] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BuildJob[]>([]); const [logs, setLogs] = useState<BuildLog[]>([]); const [audit, setAudit] = useState<DependencyReport | null>(null); const [lockStatus, setLockStatus] = useState('');
  const [projOpen, setProjOpen] = useState(false); const [fileOpen, setFileOpen] = useState(false); const [search, setSearch] = useState(''); const [replace, setReplace] = useState('');
  const [previewRoute, setPreviewRoute] = useState('/'); const [device, setDevice] = useState('desktop');
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null); const monacoRef = useRef<Monaco | null>(null);
  const project = useMemo(() => projects.find((p) => p.id === projectId) ?? null, [projects, projectId]);
  const dirty = activePath ? documents[activePath]?.content !== documents[activePath]?.saved : false;

  const loadProjects = async () => { if (!siteId) return; const list = await templatesApi.list(siteId); setProjects(list); if (list.length && !projectId) setProjectId(list[0].id); };
  const loadFiles = async (pid: string) => { setFiles(await templatesApi.listFiles(pid)); const ls = await templatesApi.lockfileStatus(pid); setLockStatus(ls.hasLockfile ? (ls.matchValid ? 'lockfile OK' : 'lockfile mismatch') : 'no lockfile'); setJobs(await buildsApi.list(pid)); try { setAudit(await templatesApi.audit(pid)); } catch { setAudit(null); } };
  useEffect(() => { void loadProjects(); }, [siteId]);
  useEffect(() => { if (projectId) { setDocuments({}); setActivePath(null); void loadFiles(projectId); } }, [projectId]);

  const openFile = async (path: string) => { if (!projectId) return; if (!documents[path]) { const f = await templatesApi.getFile(projectId, path); setDocuments((current) => ({ ...current, [path]: { content: f.content, saved: f.content } })); } setActivePath(path); };
  const closeFile = (path: string) => { const doc = documents[path]; if (doc && doc.content !== doc.saved && !window.confirm(`${path} 尚未保存，关闭？`)) return; setDocuments((current) => { const next = { ...current }; delete next[path]; return next; }); if (activePath === path) setActivePath(Object.keys(documents).filter((key) => key !== path)[0] ?? null); };
  const save = async () => { if (!projectId || !activePath) return; const content = documents[activePath].content; await templatesApi.saveFile(projectId, activePath, content); clearControllerScriptCache(); setDocuments((current) => ({ ...current, [activePath]: { content, saved: content } })); message.success(t('已保存')); void loadFiles(projectId); };
  const commit = async () => { if (!projectId) return; await templatesApi.commit(projectId, username || 'admin', 'IDE commit'); message.success(t('已生成 TemplateRevision')); void loadProjects(); };
  const startBuild = async () => {
    if (!projectId || !project) return;
    const job = await buildsApi.create({ projectId, revision: project.currentRevision, jobType: 'PREVIEW' });
    await buildsApi.start(job.id);
    const deadline = Date.now() + BUILD_POLL_TIMEOUT_MS;
    let current = await buildsApi.get(job.id);
    while (!BUILD_TERMINAL_STATUSES.has(current.status) && Date.now() < deadline) {
      setLogs(await buildsApi.logs(job.id));
      await delay(BUILD_POLL_INTERVAL_MS);
      current = await buildsApi.get(job.id);
    }
    setLogs(await buildsApi.logs(job.id));
    setJobs(await buildsApi.list(projectId));
    if (!BUILD_TERMINAL_STATUSES.has(current.status)) {
      message.error('Build status polling timed out; the job may still be running');
    } else if (current.status === 'SUCCESS') {
      message.success('Preview build completed');
    } else if (current.status === 'CANCELLED') {
      message.warning('Preview build cancelled');
    } else {
      message.error('Preview build failed; check the build logs');
    }
  };
  // 回归缺陷 ④：window.open 需在用户手势内同步发生，token 改为开窗后异步填充
  const openPreview = () => { if (!siteId) return; openInNewTab(async () => { const token = await previewApi.token(siteId); return previewApi.url(token.token, previewRoute, device); }, () => message.error(t('预览被浏览器拦截，请允许弹出窗口后重试')), () => message.error(t('预览打开失败'))); };
  const findReplace = (replaceAll = false) => { const editor = editorRef.current; const monaco = monacoRef.current; const model = editor?.getModel(); if (!editor || !monaco || !model || !search) return; const matches = model.findMatches(search, false, false, false, null, true); if (!matches.length) return void message.info(t('未找到')); if (replaceAll) editor.executeEdits('replace-all', matches.map((m) => ({ range: m.range, text: replace, forceMoveMarkers: true }))); else { const position = editor.getPosition(); const match = matches.find((m) => !position || m.range.startLineNumber > position.lineNumber || (m.range.startLineNumber === position.lineNumber && m.range.startColumn > position.column)) ?? matches[0]; editor.setSelection(match.range); editor.revealRangeInCenter(match.range); if (replace) editor.executeEdits('replace', [{ range: match.range, text: replace, forceMoveMarkers: true }]); } };
  const mount: OnMount = (editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false }); editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save()); };

  return <div>
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap><Typography.Title level={4} style={{ margin: 0 }}>{t('在线 IDE')}</Typography.Title><Space wrap>
      <Select style={{ width: 220 }} value={projectId ?? undefined} placeholder={t('选择工程')} options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.projectType})` }))} onChange={setProjectId} />
      <Button icon={<PlusOutlined />} onClick={() => setProjOpen(true)}>{t('新建工程')}</Button><Button icon={<PlusOutlined />} disabled={!projectId} onClick={() => setFileOpen(true)}>{t('新建文件')}</Button>
      <Button icon={<SaveOutlined />} type="primary" disabled={!dirty} onClick={() => void save()}>{t('保存')}</Button><Button icon={<CloudUploadOutlined />} disabled={!projectId} onClick={() => void commit()}>{t('提交版本')}</Button><Button icon={<PlayCircleOutlined />} disabled={!projectId} onClick={() => void startBuild()}>{t('预览构建')}</Button>
    </Space></Space>
    {lockStatus && <Alert style={{ marginBottom: 12 }} type={lockStatus.includes('OK') ? 'success' : 'warning'} message={`Lockfile: ${lockStatus}${project ? ` · revision ${project.currentRevision} · ${project.runtimeImage}` : ''}`} showIcon />}
    <Row gutter={12} style={{ minHeight: 560 }}><Col span={5}><Typography.Text strong>{t('文件树')}</Typography.Text><Tree blockNode style={{ marginTop: 8 }} treeData={fileTree(files)} onSelect={(keys, info) => { if (info.node.isLeaf && keys[0]) void openFile(String(keys[0])); }} />
      <Typography.Text strong>{t('依赖审计')}</Typography.Text><List size="small" bordered dataSource={audit?.dependencies ?? []} locale={{ emptyText: t('后端无审计数据') }} renderItem={(d) => <List.Item><span>{d.name}@{d.version}</span><Tag>{d.license}</Tag></List.Item>} />
    </Col><Col span={14}>
      <Tabs type="editable-card" hideAdd activeKey={activePath ?? undefined} items={Object.keys(documents).map((path) => ({ key: path, label: `${path}${documents[path].content !== documents[path].saved ? ' •' : ''}` }))} onChange={setActivePath} onEdit={(key) => closeFile(String(key))} />
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}><Input placeholder={t('搜索')} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => findReplace()} /><Input placeholder={t('替换为')} value={replace} onChange={(e) => setReplace(e.target.value)} /><Button onClick={() => findReplace()}>{t('查找/替换')}</Button><Button onClick={() => findReplace(true)}>{t('全部')}</Button><Button icon={<FormatPainterOutlined />} onClick={() => editorRef.current?.getAction('editor.action.formatDocument')?.run()}>{t('格式化')}</Button></Space.Compact>
      <Editor height="460px" theme="vs-dark" path={activePath ?? undefined} language={activePath ? languageFor(activePath) : 'plaintext'} value={activePath ? documents[activePath]?.content ?? '' : ''} onMount={mount} onChange={(value) => activePath && setDocuments((current) => ({ ...current, [activePath]: { ...current[activePath], content: value ?? '' } }))} options={{ automaticLayout: true, minimap: { enabled: true }, readOnly: !activePath, formatOnPaste: true, formatOnType: true, tabSize: 2 }} />
    </Col><Col span={5}><Typography.Text strong>{t('签名预览')}</Typography.Text><Input value={previewRoute} onChange={(e) => setPreviewRoute(e.target.value)} addonBefore={t('路由')} /><Select style={{ width: '100%', marginTop: 8 }} value={device} onChange={setDevice} options={[{ value: 'mobile', label: t('手机 390px') }, { value: 'tablet', label: t('平板 768px') }, { value: 'desktop', label: t('桌面 1440px') }]} /><Button block type="primary" style={{ marginTop: 8 }} onClick={() => void openPreview()}>{t('打开隔离预览')}</Button>
      <Typography.Text strong style={{ display: 'block', marginTop: 16 }}>{t('构建任务与资源')}</Typography.Text><List size="small" bordered dataSource={jobs} renderItem={(j) => <List.Item onClick={async () => setLogs(await buildsApi.logs(j.id))} style={{ cursor: 'pointer' }}><Space direction="vertical" size={0}><span><Tag>{j.status}</Tag>{j.jobType}</span><Typography.Text type="secondary">rev {j.revision}{j.artifactUrl ? ` · ${j.artifactUrl}` : ''}</Typography.Text></Space></List.Item>} />
      <div style={{ marginTop: 8, maxHeight: 210, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 8, fontSize: 12, fontFamily: 'Consolas, monospace' }}>{logs.map((l) => <div key={l.id}>[{l.level}] {l.line}</div>)}</div>
    </Col></Row>
    <Modal title={t('新建模板工程')} open={projOpen} onCancel={() => setProjOpen(false)} onOk={() => (document.getElementById('proj-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose><Form id="proj-form" layout="vertical" initialValues={{ projectType: 'REACT' }} onFinish={async (v) => { const p = await templatesApi.create(siteId!, v); setProjOpen(false); await loadProjects(); setProjectId(p.id); }}><Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="projectType" label={t('类型')}><Select options={[{ value: 'REACT' }, { value: 'VUE' }]} /></Form.Item></Form></Modal>
    <Modal title={t('新建文件')} open={fileOpen} onCancel={() => setFileOpen(false)} onOk={() => (document.getElementById('file-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose><Form id="file-form" layout="vertical" initialValues={{ content: '' }} onFinish={async (v) => { await templatesApi.saveFile(projectId!, v.path, v.content || ''); clearControllerScriptCache(); setFileOpen(false); await loadFiles(projectId!); setDocuments((c) => ({ ...c, [v.path]: { content: v.content || '', saved: v.content || '' } })); setActivePath(v.path); }}><Form.Item name="path" label={t('相对路径')} rules={[{ required: true }]} extra={t('禁止 ../ 与绝对路径')}><Input placeholder="src/App.tsx" /></Form.Item><Form.Item name="content" label={t('初始内容')}><Input.TextArea rows={6} /></Form.Item></Form></Modal>
  </div>;
}
export default function IdePage() { return <RequireSite><IdeInner /></RequireSite>; }
