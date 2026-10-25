import Editor from '@monaco-editor/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Breadcrumb, Button, Checkbox, Descriptions, Dropdown, Empty, Form, Input, InputNumber, List, MenuProps, Modal, Select, Space, Steps,  Table, Tabs, Tag,
  Tree, Typography, Upload, message,
} from 'antd';
import {
  FileImageOutlined, FileOutlined, FileTextOutlined, FolderAddOutlined, FolderOpenOutlined, GlobalOutlined,
  LinkOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined,
} from '@ant-design/icons';
import { contentsApi, foldersApi, mediaApi, modelsApi, pageCompositionApi, pagesApi, sharedComponentsApi, templatesApi, visualLayoutApi } from '../api';
import type { ContentType, FieldDef, MediaAsset, PageInfo, SharedComponent, SiteFolder, TemplateFile, TemplateProject, ThemeBrowserFile, VisualContainer, VisualTemplate, VisualTheme } from '../api/types';
import { FieldControl } from '../components/ContentFieldControl';
import { RequireSite, useSite } from '../context/SiteContext';
import './SiteBrowser.css';
import { t } from '../i18n/locale';
import { clearControllerScriptCache } from '../form/formController';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';
import { formatDateTime } from '../utils/datetime';

type Kind = 'folder' | 'page' | 'media' | 'template-file' | 'theme-file' | 'shared-component' | 'embedded-component-template';
type Resource = {
  key: string; parent: string; name: string; kind: Kind; path: string; status?: string; modified?: string;
  size?: number; mime?: string; sortOrder?: number; page?: PageInfo; media?: MediaAsset; project?: TemplateProject; theme?: VisualTheme;
  templateFile?: TemplateFile; themeFile?: ThemeBrowserFile; folder?: SiteFolder; sharedComponent?: SharedComponent; container?: VisualContainer; content?: string; readOnly?: boolean;
};
type Dir = { key: string; title: string; path: string; sortOrder?: number; folder?: SiteFolder; children?: Dir[] };
type EditDoc = { resource: Resource; content: string; saved: string };

function isPageType(type: ContentType) { return (type.objectType || type.templateType) === 'PAGE' && type.status !== 'DEPRECATED'; }
function fieldsOf(type?: ContentType) {
  if (!type) return [];
  if (type.fields?.length) return type.fields.filter((field) => !['FORM_SECTION', 'REPEAT_GROUP', 'TAB'].includes(field.fieldType)).sort((a, b) => a.sortOrder - b.sortOrder);
  const fields: FieldDef[] = [];
  const walk = (items = type.layout || []) => items.forEach((item) => { if (item.elementType === 'FIELD' && item.field) fields.push(item.field); else if (item.children) walk(item.children); });
  walk(); return fields.sort((a, b) => a.sortOrder - b.sortOrder);
}
const ROOT_KEY = 'folder:site-root';
const ROOT_PATH = '/';

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
const basename = (path: string) => path.split('/').filter(Boolean).at(-1) || '/';
const languageFor = (path: string) => ({ js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', css: 'css', scss: 'scss', json: 'json', html: 'html', ftl: 'html', md: 'markdown', yaml: 'yaml', yml: 'yaml' }[path.split('.').pop()?.toLowerCase() || ''] || 'plaintext');
const formatSize = (size?: number) => size == null ? '?' : size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
async function sha256(file: File) { const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join(''); }

function addPath(resources: Resource[], dirs: Map<string, Resource>, path: string, rootTitle?: string) {
  const parts = path.split('/').filter(Boolean); let current = '';
  parts.forEach((part, index) => {
    const next = `${current}/${part}`; if (!dirs.has(next)) {
      const dir: Resource = { key: `folder:${next}`, parent: current || '/', name: index === 0 && rootTitle ? rootTitle : part, kind: 'folder', path: next };
      dirs.set(next, dir); resources.push(dir);
    } current = next;
  });
}
function treeFrom(resources: Resource[]): Dir[] {
  const folders = resources.filter((r) => r.kind === 'folder');
  const nodes = new Map(folders.map((r) => [r.path, { key: r.key, title: r.name, path: r.path, sortOrder: r.sortOrder, folder: r.folder, children: [] } as Dir]));
  const roots: Dir[] = [];
  folders.forEach((r) => { const node = nodes.get(r.path)!; const parent = nodes.get(r.parent); if (parent) parent.children!.push(node); else roots.push(node); });
  const sort = (items: Dir[]): Dir[] => items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title)).map((n) => ({ ...n, children: sort(n.children || []) }));
  return sort(roots);
}

function SiteBrowserInner() {
  const { siteId, site } = useSite(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]); const [loading, setLoading] = useState(false); const [keyword, setKeyword] = useState('');
  /** 页面提示层（目录投影说明）：可关闭，「?」恢复。 */
  const hint = usePageHint();
  const [edit, setEdit] = useState<EditDoc>(); const [saving, setSaving] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [createForm] = Form.useForm(); const [pageCreateOpen, setPageCreateOpen] = useState(false); const [pageCreateStep, setPageCreateStep] = useState(0); const [pageTypes, setPageTypes] = useState<ContentType[]>([]); const [visualTemplates, setVisualTemplates] = useState<VisualTemplate[]>([]); const [selectedPageTypeId, setSelectedPageTypeId] = useState<string>(); const [pageModelKeyword, setPageModelKeyword] = useState(''); const [pageCreating, setPageCreating] = useState(false); const [pageCreateForm] = Form.useForm();
  const [uploadOpen, setUploadOpen] = useState(false); const [folderOpen, setFolderOpen] = useState(false); const [editingFolder, setEditingFolder] = useState<SiteFolder>(); const [folderForm] = Form.useForm(); const [multiple, setMultiple] = useState(false); const [uploading, setUploading] = useState(false);
  const selectedPath = params.get('path') || '/';

  const load = async () => {
    if (!siteId) return; setLoading(true);
    try {
      const requests = [
        [t('页面'), pagesApi.list(siteId)], [t('媒体'), mediaApi.list(siteId)], [t('模板工程'), templatesApi.list(siteId)],
        [t('主题'), visualLayoutApi.themes(siteId, { includeUnrecognized: true })], [t('站点目录'), foldersApi.tree(siteId)],
        [t('共享组件'), sharedComponentsApi.list(siteId)], [t('可视化容器'), visualLayoutApi.containers(siteId)],
      ] as const;
      const results = await Promise.allSettled(requests.map(([, request]) => request));
      const failed: string[] = [];
      results.forEach((result, index) => { if (result.status === 'rejected') failed.push(requests[index][0]); });
      if (failed.length === requests.length) throw new Error(t('所有目录资源均加载失败'));
      const value = <T,>(index: number, fallback: T): T => results[index].status === 'fulfilled' ? results[index].value as T : fallback;
      const pages = value<Awaited<ReturnType<typeof pagesApi.list>>>(0, []);
      const media = value<Awaited<ReturnType<typeof mediaApi.list>>>(1, []);
      const projects = value<TemplateProject[]>(2, []);
      const themes = value<VisualTheme[]>(3, []);
      const siteFolders = value<SiteFolder[]>(4, []);
      const sharedComponents = value<SharedComponent[]>(5, []);
      const containers = value<VisualContainer[]>(6, []);
      const projectResults = await Promise.allSettled(projects.map((project) => templatesApi.listFiles(project.id)));
      const projectFiles: ReadonlyArray<readonly [TemplateProject, TemplateFile[]]> = projects.map((project, index) => {
        const result = projectResults[index];
        if (result.status === 'rejected') { failed.push(`模板工程“${project.name}”文件`); return [project, []] as const; }
        return [project, result.value] as const;
      });
      const themeResults = await Promise.allSettled(themes.map((theme) => visualLayoutApi.themeFiles(siteId, theme.id)));
      const themeFiles: ReadonlyArray<readonly [VisualTheme, ThemeBrowserFile[]]> = themes.map((theme, index) => {
        const result = themeResults[index];
        if (result.status === 'rejected') { failed.push(`主题“${theme.name}”文件`); return [theme, []] as const; }
        return [theme, result.value] as const;
      });
      const list: Resource[] = []; const dirs = new Map<string, Resource>();
      const addSiteFolders = (items: SiteFolder[]) => items.forEach((folder) => { addPath(list, dirs, folder.path); const node = dirs.get(folder.path); if (node) { node.name = folder.title; node.folder = folder; node.sortOrder = folder.sortOrder; node.key = `folder-id:${folder.id}`; } addSiteFolders(folder.children || []); });
      addSiteFolders(siteFolders);
      addPath(list, dirs, '/site/components'); addPath(list, dirs, '/application', 'application'); addPath(list, dirs, '/application/templates', 'templates'); addPath(list, dirs, '/application/themes', 'themes'); addPath(list, dirs, '/application/components', 'components'); addPath(list, dirs, '/images', 'images');
      pages.forEach((page) => { const route = page.routePath || '/'; const folder = parentOf(route); if (folder !== '/') addPath(list, dirs, folder); list.push({ key: `page:${page.id}`, parent: folder, name: page.title || basename(route), kind: 'page', path: route, status: page.status, modified: page.updatedAt, page }); });
      media.forEach((asset) => list.push({ key: `media:${asset.id}`, parent: '/images', name: asset.filename, kind: 'media', path: `/images/${asset.filename}`, mime: asset.mimeType, size: asset.fileSize, media: asset }));
      sharedComponents.forEach((component) => { const path = component.path.startsWith('/') && component.path !== '/' ? component.path : `/site/components/${component.id}`; addPath(list, dirs, parentOf(path)); list.push({ key: `shared-component:${component.id}`, parent: parentOf(path), name: component.title || basename(path), kind: 'shared-component', path, status: component.status, modified: component.updatedAt, sharedComponent: component, readOnly: true }); });
      projectFiles.forEach(([project, files]) => { const root = `/application/templates/${project.id}`; addPath(list, dirs, root); const rootDir = dirs.get(root); if (rootDir) { rootDir.name = project.name; rootDir.project = project; } files.forEach((file) => { const full = `${root}/${file.path}`; addPath(list, dirs, parentOf(full)); list.push({ key: `template-file:${project.id}:${file.path}`, parent: parentOf(full), name: basename(file.path), kind: 'template-file', path: full, modified: file.updatedAt, size: new Blob([file.content || '']).size, project, templateFile: file }); }); });
      themeFiles.forEach(([theme, files]) => { const root = `/application/themes/${theme.name}`; addPath(list, dirs, root); const rootDir = dirs.get(root); if (rootDir) { rootDir.name = `${theme.name}${theme.readOnly ? t('（共享·只读）') : ''}`; rootDir.theme = theme; } files.forEach((file) => { const prefix = `themes/${theme.name}/`; const relative = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path; const full = `${root}/${relative}`; addPath(list, dirs, parentOf(full)); list.push({ key: `theme-file:${theme.id}:${file.path}`, parent: parentOf(full), name: basename(file.path), kind: 'theme-file', path: full, mime: file.mediaType, size: file.size, status: `v${file.version}`, theme, themeFile: file, readOnly: !file.editable }); }); });
      containers.forEach((container) => {
        const root = `/application/components/${container.id}`; addPath(list, dirs, root); const rootDir = dirs.get(root); if (rootDir) { rootDir.name = container.name; rootDir.container = container; }
        (container.containerStructures || []).forEach((link) => {
          const variable = link.contentTypeVar || link.structureId;
          const name = `${encodeURIComponent(variable)}.ftl`; const path = `${root}/${name}`;
          list.push({ key: `embedded-component-template:${container.id}:${link.structureId}`, parent: root, name, kind: 'embedded-component-template', path, mime: 'text/x-freemarker', size: new Blob([link.code || '']).size, status: `v${container.currentVersion}`, modified: container.updatedAt, container, content: link.code || '', readOnly: true });
        });
      });
      setResources(list);
      if (failed.length) message.warning(`部分资源加载或解析失败：${failed.join('、')}`);
    } catch (error) { message.error(error instanceof Error ? `目录资源加载失败：${error.message}` : t('目录资源加载失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [siteId]);
  useEffect(() => { if (selectedPath !== ROOT_PATH && !loading && resources.length > 0 && !resources.some((r) => r.kind === 'folder' && r.path === selectedPath)) setParams({ path: ROOT_PATH }, { replace: true }); }, [selectedPath, resources, loading]);

  const siteTitle = site?.name || site?.siteKey || t('站点');
  const tree = useMemo(() => [{ key: ROOT_KEY, title: siteTitle, path: ROOT_PATH, children: treeFrom(resources) } as Dir], [resources, siteTitle]);
  const selectedFolder = resources.find((r) => r.kind === 'folder' && r.path === selectedPath);
  const selectedKey = selectedPath === ROOT_PATH ? ROOT_KEY : (selectedFolder?.key || '');
  const rows = useMemo(() => resources.filter((r) => r.parent === selectedPath && (!keyword.trim() || `${r.name} ${r.path} ${r.mime || ''}`.toLowerCase().includes(keyword.trim().toLowerCase()))).sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)), [resources, selectedPath, keyword]);
  const project = resources.find((r) => r.project && selectedPath.startsWith(`/application/templates/${r.project.id}`))?.project;
  const theme = resources.find((r) => r.theme && selectedPath.startsWith(`/application/themes/${r.theme.name}`))?.theme;
  const enter = (path: string) => setParams(path === ROOT_PATH ? { path: ROOT_PATH } : { path });
  const openResource = async (r: Resource) => {
    if (r.kind === 'folder') return enter(r.path);
    if (r.kind === 'page') return navigate(`/pages/editor?pageId=${encodeURIComponent(r.page!.id)}`);
    if (r.kind === 'media') return navigate(`/media?item=${encodeURIComponent(r.media!.id)}`);
    if (r.kind === 'template-file') { const file = await templatesApi.getFile(r.project!.id, r.templateFile!.path); return setEdit({ resource: r, content: file.content, saved: file.content }); }
    if (r.kind === 'theme-file') return setEdit({ resource: r, content: r.themeFile?.content || '', saved: r.themeFile?.content || '' });
    if (r.kind === 'shared-component') { const component = r.sharedComponent!; const content = JSON.stringify({ path: component.path, title: component.title, contentTypeId: component.contentTypeId, data: component.data, templatePath: component.templatePath, status: component.status, version: component.currentVersion }, null, 2); return setEdit({ resource: r, content, saved: content }); }
    if (r.kind === 'embedded-component-template') return setEdit({ resource: r, content: r.content || '', saved: r.content || '' });
  };
  const saveEdit = async () => {
    if (!siteId || !edit || edit.resource.readOnly) return; setSaving(true);
    try {
      const r = edit.resource;
      if (r.kind === 'template-file') {
        await templatesApi.saveFile(r.project!.id, r.templateFile!.path, edit.content);
        // 模板工程里可能放着客户端表单控制器脚本：保存后让内容编辑器立即重新拉取
        clearControllerScriptCache();
      } else if (r.kind === 'theme-file') await visualLayoutApi.saveThemeFile(siteId, r.theme!.id, { path: r.themeFile!.path, content: edit.content, expectedVersion: r.themeFile!.version });
      message.success(r.kind === 'theme-file' ? t('已保存并创建新的主题 revision') : t('文件已保存')); setEdit(undefined); await load();
    } finally { setSaving(false); }
  };
  const createFile = async (v: { name: string; content?: string }) => {
    if (!siteId) return; const relativeDir = project ? selectedPath.slice(`/application/templates/${project.id}`.length).replace(/^\//, '') : theme ? selectedPath.slice(`/application/themes/${theme.name}`.length).replace(/^\//, '') : '';
    const relative = [relativeDir, v.name].filter(Boolean).join('/');
    if (project) {
      await templatesApi.saveFile(project.id, relative, v.content || '');
      // 模板工程改动（可能含客户端表单控制器脚本）→ 内容编辑器下次打开时重新拉取
      clearControllerScriptCache();
    } else if (theme) await visualLayoutApi.saveThemeFile(siteId, theme.id, { path: `themes/${theme.name}/${relative}`, content: v.content || '', expectedVersion: theme.currentVersion });
    setCreateOpen(false); message.success(theme ? t('文件已创建并生成新的主题 revision') : t('文件已创建')); await load();
  };
  const registerFiles = async (files: File[]) => {
    if (!siteId) return; setUploading(true);
    if (selectedPath === '/application/themes') {
      try {
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith('.zip')) throw new Error(t('主题根目录只接受 ZIP 主题包'));
          await visualLayoutApi.importTheme(siteId, file);
        }
        message.success(`已导入 ${files.length} 个主题包`); setUploadOpen(false); await load();
      } finally { setUploading(false); }
      return;
    }
    try { for (const file of files) { const hash = await sha256(file); await mediaApi.register(siteId, { filename: file.name, contentHash: hash, mimeType: file.type || 'application/octet-stream', fileSize: file.size, storageKey: `local/${hash.slice(0, 16)}/${file.name}` }); } message.success(`已登记 ${files.length} 个媒体元数据记录`); setUploadOpen(false); await load(); } finally { setUploading(false); }
  };
  const openFolderEditor = (folder?: SiteFolder, parentPath = selectedPath) => {
    setEditingFolder(folder);
    const parentFolder = resources.find((r) => r.folder?.path === parentPath)?.folder;
    folderForm.setFieldsValue(folder || { parentId: parentFolder?.id, title: '', name: '', sortOrder: 0, showOnMenu: true, allowedFileExtensions: '', defaultFileAssetType: 'FILE' });
    setFolderOpen(true);
  };
  const ensurePersistentParent = async (path: string) => {
    if (!siteId || path === '/') return undefined;
    let parentId: string | undefined;
    let current = '';
    for (const segment of path.split('/').filter(Boolean)) {
      current += `/${segment}`;
      const existing = resources.find((r) => r.folder?.path === current)?.folder;
      if (existing) { parentId = existing.id; continue; }
      const created = await foldersApi.create(siteId, { parentId, title: resources.find((r) => r.path === current)?.name || segment, name: segment, sortOrder: 0, showOnMenu: false, defaultFileAssetType: 'FILE' });
      parentId = created.id;
    }
    return parentId;
  };
  const saveFolder = async (values: { parentId?: string; title: string; name: string; sortOrder?: number; showOnMenu?: boolean; allowedFileExtensions?: string; defaultFileAssetType?: string }) => {
    if (!siteId) return;
    if (!editingFolder && selectedPath === '/application/themes') {
      await visualLayoutApi.createTheme(siteId, { name: values.name, description: values.title, status: 'DRAFT', config: '{}' });
      setFolderOpen(false); folderForm.resetFields(); await load();
      enter(`/application/themes/${values.name}`);
      message.success(t('主题文件夹已创建；添加非空 template.ftl 后会自动发布并出现在主题列表中'));
      return;
    }
    if (editingFolder) await foldersApi.update(siteId, editingFolder.id, { ...values, parentId: editingFolder.parentId });
    else await foldersApi.create(siteId, { ...values, parentId: values.parentId || await ensurePersistentParent(selectedPath) });
    setFolderOpen(false); setEditingFolder(undefined); folderForm.resetFields(); await load(); message.success(t('文件夹已保存'));
  };
  const deleteFolder = (folder: SiteFolder) => Modal.confirm({ title: `删除文件夹“${folder.title}”？`, content: t('包含子目录或页面时不能删除。'), okButtonProps: { danger: true }, onOk: async () => { if (!siteId) return; await foldersApi.remove(siteId, folder.id); await load(); message.success(t('文件夹已删除')); } });
  const siteRootMenu = (): MenuProps => ({ items: [
    { key: 'edit-site', label: 'Edit Site' },
    { key: 'bundle', label: 'Add To Bundle', disabled: true },
    { key: 'folder', label: 'Add Folder' },
    { key: 'page', label: 'Page' },
    { key: 'file', label: 'Image or File' },
    { key: 'multiple', label: 'Multiple Files' },
    { type: 'divider' },
    { key: 'close', label: 'Close' },
  ], onClick: ({ key, domEvent }) => {
    domEvent.stopPropagation();
    enter(ROOT_PATH);
    if (key === 'edit-site') navigate('/sites');
    else if (key === 'folder') openFolderEditor(undefined, ROOT_PATH);
    else if (key === 'page') void openPageCreate();
    else if (key === 'file' || key === 'multiple') { setMultiple(key === 'multiple'); setUploadOpen(true); }
  } });
  const folderMenu = (folder?: SiteFolder, path = selectedPath): MenuProps => ({ items: [
    { key: 'edit', label: t('编辑文件夹'), disabled: !folder }, { key: 'delete', label: t('删除'), danger: true, disabled: !folder },
    { type: 'divider' }, { key: 'new', label: t('新建子目录') }, { key: 'publish', label: t('发布（全部）'), disabled: true },
    { key: 'bundle', label: t('添加到 Bundle'), disabled: true }, { key: 'copy', label: t('标记为复制'), disabled: true }, { key: 'cut', label: t('剪切'), disabled: true },
  ], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === 'edit' && folder) openFolderEditor(folder); else if (key === 'delete' && folder) deleteFolder(folder); else if (key === 'new') openFolderEditor(undefined, path); } });
  const resourceMenu = (resource: Resource): MenuProps => ({ items: resource.kind === 'page' ? [
    { key: 'preview', label: t('打开（预览）') }, { key: 'properties', label: t('页面属性') }, { key: 'copy', label: t('复制'), disabled: true },
    { key: 'publish', label: resource.page?.status === 'PUBLISHED' ? t('撤回') : t('发布') }, { key: 'move', label: t('移动'), disabled: resource.page?.status === 'PUBLISHED' },
    { key: 'bundle', label: t('添加到 Bundle'), disabled: true }, { key: 'cut', label: t('剪切'), disabled: true },
  ] : [
    { key: 'open', label: resource.kind === 'media' ? t('打开属性') : resource.readOnly ? t('查看文件') : t('编辑文件') }, { key: 'preview', label: t('预览'), disabled: resource.kind !== 'media' },
    { key: 'copy', label: t('复制'), disabled: true }, { key: 'move', label: t('移动'), disabled: true },
  ], onClick: async ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === 'preview' && resource.kind === 'page') navigate(`/pages/editor?pageId=${resource.page!.id}`); else if (key === 'properties' && resource.page) navigate(`/pages?item=${resource.page.id}`); else if (key === 'publish' && resource.page) navigate(`/content?type=${resource.page.contentTypeId}&item=${resource.page.id}`); else if (key === 'move' && resource.page) navigate(`/browser?path=${encodeURIComponent(parentOf(resource.page.routePath || '/'))}`); else if (key === 'open' || key === 'preview') await openResource(resource); } });


  const selectedPageType = pageTypes.find((type) => type.id === selectedPageTypeId);
  const defaultRouteForCreate = () => {
    if (selectedPath === ROOT_PATH) return '/';
    return selectedPath.endsWith('/') ? selectedPath : `${selectedPath}/`;
  };
  const openPageCreate = async () => {
    if (!siteId) return;
    setPageCreateStep(0); setSelectedPageTypeId(undefined); setPageModelKeyword(''); pageCreateForm.resetFields(); setPageCreateOpen(true);
    const [models, templates] = await Promise.all([modelsApi.list(siteId), visualLayoutApi.templates(siteId)]);
    setPageTypes(models.filter(isPageType)); setVisualTemplates(templates);
  };
  const choosePageType = (type: ContentType) => {
    setSelectedPageTypeId(type.id);
    const pattern = type.destinationPattern || defaultRouteForCreate();
    pageCreateForm.setFieldsValue({ contentTypeId: type.id, routePath: pattern.startsWith(selectedPath) || selectedPath === ROOT_PATH ? pattern : defaultRouteForCreate(), templatePath: type.displayTemplate, fieldValues: {} });
    setPageCreateStep(1);
  };
  const createPage = async (values: Record<string, unknown>) => {
    if (!siteId || !selectedPageTypeId) return;
    setPageCreating(true);
    try {
      const fieldValues: Record<string, unknown> = {}; fieldsOf(selectedPageType).forEach((field) => { if (values[field.code] !== undefined) fieldValues[field.code] = values[field.code]; });
      const folderId = selectedFolder?.kind === 'folder' && selectedFolder.folder ? selectedFolder.folder.id : undefined;
      const created = await contentsApi.create(siteId, { title: String(values.title), contentTypeId: selectedPageTypeId, folderId, routePath: String(values.routePath), templatePath: String(values.templatePath || ''), fieldValues: JSON.stringify(fieldValues) });
      if (values.visualTemplateId) await pageCompositionApi.save(siteId, created.id, String(values.visualTemplateId), {}, 0);
      setPageCreateOpen(false); message.success(t('页面已创建')); await load();
    } finally { setPageCreating(false); }
  };

  const addItems: MenuProps['items'] = [
    { key: 'folder', icon: <FolderAddOutlined />, label: 'Folder' },
    { key: 'page', icon: <FileTextOutlined />, label: 'Page' },
    { key: 'file', icon: <FileImageOutlined />, label: selectedPath === '/application/themes' ? 'Import Theme ZIP' : 'Image or File' },
    { key: 'multiple', icon: <UploadOutlined />, label: selectedPath === '/application/themes' ? 'Import Multiple Theme ZIPs' : 'Multiple Files' },
    { key: 'link', icon: <LinkOutlined />, label: t('Menu Link（尚未支持）'), disabled: true },
  ];
  const canCreateTextFile = Boolean(project || (theme && !theme.readOnly));
  const addAction = ({ key }: { key: string }) => {
    if (key === 'page') void openPageCreate();
    else if (key === 'file' || key === 'multiple') {
      if (canCreateTextFile && key === 'file') { createForm.resetFields(); setCreateOpen(true); return; }
      setMultiple(key === 'multiple'); setUploadOpen(true);
    }
    else if (key === 'folder') openFolderEditor(undefined, selectedPath);
  };
  const crumbs = selectedPath === '/' ? [] : selectedPath.split('/').filter(Boolean).map((_, i, all) => ({ title: <a onClick={() => enter(`/${all.slice(0, i + 1).join('/')}`)}>{resources.find((r) => r.kind === 'folder' && r.path === `/${all.slice(0, i + 1).join('/')}`)?.name || all[i]}</a> }));

  return <div className="site-browser-page">
    <div className="site-browser-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder={t('搜索当前目录')} value={keyword} onChange={(e) => setKeyword(e.target.value)} /><Space><PageHintRestore hint={hint} /><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t('刷新')}</Button><Dropdown menu={{ items: addItems, onClick: addAction }} trigger={['click']}><Button className="site-browser-add" type="primary" shape="circle" size="large" icon={<PlusOutlined />} aria-label={t('添加资源')} /></Dropdown></Space></div>
    <PageHintAlert hint={hint} message={t('目录是各资源域的安全投影')} description={t('页面目录来自 URL 路径，模板与主题目录来自文件路径；共享组件、容器内嵌组件模板及共享主题文件为只读投影。媒体目前仅登记元数据，尚未上传二进制内容或提供逻辑目录。')} />
    <div className="site-browser-layout">
      <div className="site-browser-tree"><Tree blockNode defaultExpandedKeys={[ROOT_KEY]} selectedKeys={selectedKey ? [selectedKey] : []} treeData={tree} onSelect={(keys, info) => { if (!keys.length) return; enter((info.node as Dir).path || ROOT_PATH); }} titleRender={(node) => { const dir = node as Dir; const isRoot = dir.path === ROOT_PATH; return <Dropdown menu={isRoot ? siteRootMenu() : folderMenu(dir.folder, dir.path)} trigger={['contextMenu']}><Space size={6} className={isRoot ? 'site-browser-tree-root' : 'site-browser-tree-node'}>{isRoot ? <GlobalOutlined /> : <FolderOpenOutlined />}{node.title}{dir.folder?.showOnMenu && <Tag color="blue">{t('菜单')}</Tag>}</Space></Dropdown>; }} /></div>
      <div className="site-browser-list"><Breadcrumb items={[{ title: <a onClick={() => enter(ROOT_PATH)}>{siteTitle}</a> }, ...crumbs]} /><Table<Resource> className="site-browser-table" rowKey="key" loading={loading} dataSource={rows} locale={{ emptyText: <Empty description={t('当前目录为空')} /> }} onRow={(r) => ({ onDoubleClick: () => void openResource(r) })} pagination={false} scroll={{ y: 540 }} columns={[
        { title: t('名称'), dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (name, r) => <Dropdown menu={r.kind === 'folder' ? folderMenu(r.folder, r.path) : resourceMenu(r)} trigger={['contextMenu']}><Space className="site-browser-resource-name">{r.kind === 'folder' ? <FolderOpenOutlined /> : r.kind === 'media' ? <FileImageOutlined /> : r.kind === 'page' ? <FileTextOutlined /> : <FileOutlined />}<a onClick={() => void openResource(r)}>{name}</a>{r.folder?.showOnMenu && <Tag color="blue">{t('菜单')}</Tag>}{r.readOnly && <Tag>{t('只读')}</Tag>}</Space></Dropdown> },
        { title: t('类型'), render: (_, r) => ({ folder: 'Folder', page: 'Page', media: 'Media', 'template-file': 'Template File', 'theme-file': 'Theme File', 'shared-component': 'Shared Component', 'embedded-component-template': 'Embedded Component Template' }[r.kind]) },
        { title: t('状态'), dataIndex: 'status', render: (v) => v ? <Tag>{v}</Tag> : '—' },
        { title: 'MIME', dataIndex: 'mime', render: (v) => v || '—' },
        { title: t('大小'), dataIndex: 'size', render: formatSize },
        { title: t('修改时间'), dataIndex: 'modified', render: (v) => formatDateTime(v) },
      ]} />
      {<Typography.Text type="secondary">{t('已选中：')}{selectedPath === ROOT_PATH ? siteTitle : (selectedFolder?.name || selectedPath)}{t('。可在此目录新建文件夹；根目录下可添加页面或登记媒体文件。')}</Typography.Text>}
      </div>
    </div>
    <Modal title={edit?.resource.name || t('文件')} width="min(1120px, 94vw)" open={Boolean(edit)} onCancel={() => setEdit(undefined)} onOk={() => void saveEdit()} okText={edit?.resource.readOnly ? t('只读') : t('保存')} okButtonProps={{ disabled: edit?.resource.readOnly || edit?.content === edit?.saved }} confirmLoading={saving} destroyOnClose>
      {edit && <Tabs items={[{ key: 'content', label: t('内容'), children: <Editor height="520px" language={languageFor(edit.resource.name)} value={edit.content} onChange={(v) => setEdit({ ...edit, content: v || '' })} options={{ automaticLayout: true, readOnly: edit.resource.readOnly, minimap: { enabled: true } }} /> }, { key: 'metadata', label: t('元数据'), children: <Space direction="vertical"><Typography.Text>{t('路径：')}{edit.resource.path}</Typography.Text><Typography.Text>MIME：{edit.resource.mime || 'text/plain'}</Typography.Text><Typography.Text>{t('版本：')}{edit.resource.themeFile?.version || edit.resource.sharedComponent?.currentVersion || edit.resource.container?.currentVersion || edit.resource.project?.currentRevision || t('工作副本')}</Typography.Text>{edit.resource.readOnly && <Alert type="warning" showIcon message={t('此资源是目录中的只读投影，不可在此编辑')} />}</Space> }, { key: 'history', label: t('历史'), children: <Alert type="info" showIcon message={edit.resource.kind === 'theme-file' ? t('保存会创建新的不可变主题 revision；完整历史请在主题管理中查看。') : t('模板工程历史在提交 revision 后可于在线 IDE 中查看。')} /> }]} />}
    </Modal>
    <Modal title={editingFolder ? t('编辑文件夹') : t('新建文件夹')} open={folderOpen} onCancel={() => { setFolderOpen(false); setEditingFolder(undefined); }} onOk={() => folderForm.submit()} okText={t('保存')} width={760} destroyOnClose>
      <Tabs items={[{ key: 'properties', label: t('属性'), children: <Form form={folderForm} layout="vertical" onFinish={saveFolder}>
        {editingFolder && <Form.Item label={t('标识符')}><Input value={editingFolder.id} readOnly /></Form.Item>}
        <Form.Item label={t('父目录路径')}><Input value={editingFolder ? (parentOf(editingFolder.path) === ROOT_PATH ? siteTitle : parentOf(editingFolder.path)) : (selectedPath === ROOT_PATH ? siteTitle : selectedPath)} readOnly /></Form.Item>
        <Form.Item name="title" label={t('标题')} rules={[{ required: true }, { max: 200 }]}><Input /></Form.Item>
        <Form.Item name="name" label={t('名称（URL）')} rules={[{ required: true }, { pattern: /^[A-Za-z0-9_-]+$/, message: t('仅允许字母、数字、下划线和连字符') }]}><Input /></Form.Item>
        <Form.Item name="sortOrder" label={t('排序')}><InputNumber min={0} /></Form.Item>
        <Form.Item name="showOnMenu" valuePropName="checked"><Checkbox>{t('显示在导航栏/菜单')}</Checkbox></Form.Item>
        <Form.Item name="allowedFileExtensions" label={t('允许的文件扩展名')} extra={t('逗号分隔，例如 jpg,gif,bmp,png')}><Input /></Form.Item>
        <Form.Item name="defaultFileAssetType" label={t('默认文件资源类型')}><Select options={[{ value: 'FILE', label: t('文件') }, { value: 'IMAGE', label: t('图片') }, { value: 'PAGE', label: t('页面') }]} /></Form.Item>
      </Form> }, { key: 'history', label: t('发布历史'), children: <Alert type="info" showIcon message={t('文件夹属性会审计记录；发布历史由 Release 管理。')} /> }]} />
    </Modal>
    <Modal title={t('新建文本文件')} open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose><Form form={createForm} layout="vertical" onFinish={createFile}><Form.Item name="name" label={t('相对文件名')} extra={t('可包含目录，例如 css/site.css；不允许绝对路径、反斜杠和 ..')} rules={[{ required: true }, { pattern: /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/, message: t('请输入安全的相对路径') }]}><Input /></Form.Item><Form.Item name="content" label={t('初始内容')}><Input.TextArea rows={10} /></Form.Item></Form></Modal>

    <Modal title={t('添加页面')} width={760} open={pageCreateOpen} onCancel={() => setPageCreateOpen(false)} footer={pageCreateStep === 0 ? null : undefined} onOk={() => pageCreateForm.submit()} confirmLoading={pageCreating} okText={t('创建页面')} destroyOnClose>
      <Steps size="small" current={pageCreateStep} items={[{ title: t('选择页面模型') }, { title: t('填写页面信息') }]} style={{ marginBottom: 20 }} />
      {pageCreateStep === 0 ? <><Input.Search placeholder={t('搜索页面模型')} value={pageModelKeyword} onChange={(event) => setPageModelKeyword(event.target.value)} style={{ marginBottom: 12 }} /><List dataSource={pageTypes.filter((type) => `${type.name} ${type.code} ${type.description || ''}`.toLowerCase().includes(pageModelKeyword.trim().toLowerCase()))} locale={{ emptyText: t('尚未配置 PAGE 内容模型') }} renderItem={(type) => <List.Item onClick={() => choosePageType(type)} style={{ cursor: 'pointer' }}><List.Item.Meta title={type.name} description={`${type.code}${type.description ? ` · ${type.description}` : ''}`} /></List.Item>} /></> : <Form form={pageCreateForm} layout="vertical" onFinish={createPage}>
        <Descriptions size="small" column={1} style={{ marginBottom: 12 }}><Descriptions.Item label={t('页面模型')}>{selectedPageType?.name}</Descriptions.Item></Descriptions>
        <Form.Item name="title" label={t('标题')} rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="routePath" label="URL" rules={[{ required: true }]} extra={selectedPath === ROOT_PATH ? t('将创建在站点根目录') : `当前目录：${selectedPath}`}><Input placeholder="/news/example" /></Form.Item>
        <Form.Item name="templatePath" label={t('显示模板')}><Input /></Form.Item>
        <Form.Item name="visualTemplateId" label={t('可视化模板')}><Select allowClear options={visualTemplates.map((template) => ({ value: template.id, label: template.name }))} /></Form.Item>
        {fieldsOf(selectedPageType).map((field) => <Form.Item key={field.code} name={field.code} label={field.name} extra={field.helpText} rules={[{ required: field.required }]} initialValue={field.defaultValue} valuePropName={field.fieldType === 'BOOLEAN' ? 'checked' : 'value'}><FieldControl field={field} siteId={siteId} contentTypeId={selectedPageType?.id} /></Form.Item>)}
      </Form>}
    </Modal>
    <Modal title={selectedPath === '/application/themes' ? t('导入主题 ZIP') : multiple ? t('登记多个文件') : t('登记图片或文件')} open={uploadOpen} footer={null} onCancel={() => setUploadOpen(false)} destroyOnClose>{selectedPath === '/application/themes' ? <Alert type="info" showIcon message={t('上传主题 ZIP')} description={t('ZIP 必须包含 theme.yaml 和非空 template.ftl；导入后会创建已发布的不可变主题 revision。')} style={{ marginBottom: 12 }} /> : <Alert type="warning" showIcon message={t('当前仅登记媒体元数据')} description={t('现有后端尚未接收和保存二进制文件，登记记录不能替代真实上传。')} style={{ marginBottom: 12 }} />}<Upload.Dragger multiple={multiple} showUploadList={false} disabled={uploading} customRequest={async ({ file, onSuccess, onError }) => { try { await registerFiles([file as File]); onSuccess?.(null); } catch (e) { onError?.(e as Error); } }}><p className="ant-upload-drag-icon"><UploadOutlined /></p><p>{t('点击或拖动')}{multiple ? t('多个') : t('一个')}{t('文件到此处')}</p></Upload.Dragger></Modal>
  </div>;
}
export default function SiteBrowserPage() { return <RequireSite><SiteBrowserInner /></RequireSite>; }
