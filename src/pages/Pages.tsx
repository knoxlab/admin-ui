import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Button, Card, Checkbox, Descriptions, Dropdown, Empty, Form, Input, List, Modal, Select, Space, Table, Tag, Tooltip, Tree, TreeSelect, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { DownOutlined, EditOutlined, EllipsisOutlined, EyeOutlined, FolderOutlined, GlobalOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { contentsApi, foldersApi, modelsApi, pageCompositionApi, pagesApi, visualLayoutApi } from '../api';
import type { ContentType, PageComposition, PageInfo, SiteFolder, VisualTemplate } from '../api/types';
import ModelFormRenderer, { BINDING_CONTROL_KINDS, folderTreeDataForSelect } from '../components/ModelFormRenderer';
import ContentPreviewImage from '../components/ContentPreviewImage';
import ViewModeDropdown, { useListViewMode } from '../components/ViewModeDropdown';
import { buildModelFormNodes, modelFormItems, type ModelFormItem } from '../utils/modelFormLayout';
import { RequireSite, useSite } from '../context/SiteContext';
import { formatDateTimeSeconds } from '../utils/datetime';
import './Content.css';
import { t } from '../i18n/locale';

const SIDER_WIDTH_KEY = 'powercms.pages.siderWidth';
const SIDER_COLLAPSED_KEY = 'powercms.pages.siderCollapsed';
/** 常用页面折叠状态记忆键；默认（无记录时）收起。 */
const QUICK_COLLAPSED_KEY = 'powercms.pages.quickCollapsed';
const SIDER_MIN = 180;
const SIDER_MAX = 400;
const SIDER_DEFAULT = 240;
const ROOT_KEY = '__all__';

function readSiderWidth() {
  const raw = Number(localStorage.getItem(SIDER_WIDTH_KEY));
  if (!Number.isFinite(raw)) return SIDER_DEFAULT;
  return Math.min(SIDER_MAX, Math.max(SIDER_MIN, raw));
}
function readSiderCollapsed() {
  return localStorage.getItem(SIDER_COLLAPSED_KEY) === '1';
}
/** 常用页面默认收起（需求 2026-09-21）：仅当用户显式展开过（存 '0'）时才默认展开。 */
function readQuickCollapsed() {
  return localStorage.getItem(QUICK_COLLAPSED_KEY) !== '0';
}

function isPageType(type: ContentType) { return (type.objectType || type.templateType) === 'PAGE' && type.status !== 'DEPRECATED'; }
function parseValues(raw?: string) { try { return JSON.parse(raw || '{}') as Record<string, unknown>; } catch { return {}; } }
function toTreeData(folders: SiteFolder[]): DataNode[] {
  return folders.map((f) => ({
    key: f.id,
    title: f.title,
    children: f.children?.length ? toTreeData(f.children) : undefined,
  }));
}

function collectFolderIds(folder: SiteFolder): string[] {
  const ids = [folder.id];
  if (folder.children) folder.children.forEach((c) => ids.push(...collectFolderIds(c)));
  return ids;
}

function findFolderById(folders: SiteFolder[], id: string): SiteFolder | undefined {
  for (const f of folders) {
    if (f.id === id) return f;
    if (f.children) {
      const found = findFolderById(f.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function PagesInner() {
  const { siteId, site } = useSite();
  const navigate = useNavigate();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [templates, setTemplates] = useState<VisualTemplate[]>([]);
  const [folders, setFolders] = useState<SiteFolder[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  /** 列表显示方式：缩略图 / 列表 / 表格，下拉切换并记忆（默认表格，保持既有交互）。 */
  const [viewMode, setViewMode] = useListViewMode('powercms.pages.viewMode');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>();
  const [editPage, setEditPage] = useState<PageInfo>();
  const [saving, setSaving] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const pageTypes = useMemo(() => types.filter(isPageType), [types]);
  const selectedType = pageTypes.find((type) => type.id === selectedTypeId);
  /** 全屏新建表单的渲染树（分区/页签/行列，由模型布局驱动；需求 2026-09-21）。 */
  const createNodes = useMemo(() => buildModelFormNodes(selectedType), [selectedType]);
  const createItems = useMemo(() => modelFormItems(createNodes), [createNodes]);
  /** 编辑弹窗所用模型的渲染树（编辑页可能尚未在 pageTypes 缓存，从编辑表单按需查询）。 */
  const editType = editPage ? pageTypes.find((type) => type.id === editPage.contentTypeId) : undefined;
  const editNodes = useMemo(() => buildModelFormNodes(editType), [editType]);
  const editItems = useMemo(() => modelFormItems(editNodes), [editNodes]);
  /** 2026-09-22：布局驱动优先 —— 模型布局已含某输入项（title_s / 页面属性绑定）时内置输入退场，避免重复。 */
  const hasCode = (items: ModelFormItem[] | undefined, code: string) =>
    (items ?? []).some((i) => i.kind === 'field' && i.field.code === code);
  /** 页面属性绑定控件值入条目级实体列（folderId/routePath/templatePath/可视化绑定），不入 fieldValues（title_s 为契约码例外）。 */
  const skipBinding = (f: { systemFieldType?: string }) =>
    Boolean(f.systemFieldType && BINDING_CONTROL_KINDS.has(f.systemFieldType));
  const createHasTitleField = hasCode(createItems, 'title_s');
  const editHasTitleField = hasCode(editItems, 'title_s');
  /** 编辑弹窗当前页面组成（可视化模板绑定回填与变更判定）。 */
  const [editComposition, setEditComposition] = useState<PageComposition | null>(null);
  const [quickCollapsed, setQuickCollapsed] = useState(readQuickCollapsed);
  const [filterModelId, setFilterModelId] = useState<string | null>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [siderWidth, setSiderWidth] = useState(readSiderWidth);
  const [siderCollapsed, setSiderCollapsed] = useState(readSiderCollapsed);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(SIDER_DEFAULT);

  const load = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [pageList, modelList, templateList, folderList] = await Promise.all([pagesApi.list(siteId), modelsApi.list(siteId), visualLayoutApi.templates(siteId), foldersApi.tree(siteId)]);
      setPages(pageList); setTypes(modelList); setTemplates(templateList); setFolders(folderList);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [siteId]);

  const filtered = useMemo(() => pages.filter((page) => {
    const q = keyword.trim().toLowerCase();
    const matchKeyword = !q || `${page.title} ${page.routePath || ''}`.toLowerCase().includes(q);
    const matchStatus = (!status || page.status === status) && (showArchived || page.status !== 'ARCHIVED');
    const matchModel = !filterModelId || page.contentTypeId === filterModelId;
    let matchFolder = true;
    if (selectedFolderId && selectedFolderId !== ROOT_KEY) {
      const folder = findFolderById(folders, selectedFolderId);
      if (folder) {
        const folderIds = new Set(collectFolderIds(folder));
        matchFolder = page.folderId ? folderIds.has(page.folderId) : false;
      }
    }
    return matchKeyword && matchStatus && matchModel && matchFolder;
  }), [pages, keyword, status, showArchived, filterModelId, selectedFolderId, folders]);

  const toggleSiderCollapsed = useCallback(() => {
    setSiderCollapsed((v) => {
      localStorage.setItem(SIDER_COLLAPSED_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  /** 常用页面折叠/展开，状态持久化（默认收起，见 readQuickCollapsed）。 */
  const toggleQuickCollapsed = useCallback(() => {
    setQuickCollapsed((v) => {
      localStorage.setItem(QUICK_COLLAPSED_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.classList.add('content-resizing');
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = siderWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(SIDER_MAX, Math.max(SIDER_MIN, startWidthRef.current + (ev.clientX - startXRef.current)));
      setSiderWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.classList.remove('content-resizing');
      localStorage.setItem(SIDER_WIDTH_KEY, String(siderWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [siderWidth]);

  /**
   * 需求 2026-09-21：「添加页面」收敛为下拉选择 PAGE 模型，选中后直接弹出
   * 全屏编辑表单（跳过原两步向导的模型列表步骤）。
   */
  const createMenuItems: MenuProps['items'] = pageTypes.length
    ? pageTypes.map((type) => ({ key: type.id, label: `${type.name} (${type.code})` }))
    : [{ key: '__empty__', label: t('尚未配置 PAGE 内容模型'), disabled: true }];
  const onCreateMenuClick: MenuProps['onClick'] = ({ key }) => {
    const type = pageTypes.find((item) => item.id === key);
    if (type) chooseType(type);
  };
  const chooseType = (type: ContentType) => {
    setSelectedTypeId(type.id);
    const folderPath = selectedFolderId ? findFolderById(folders, selectedFolderId)?.path || '/' : type.destinationPattern || '/';
    createForm.resetFields();
    // 回填两键均设（内置输入与布局绑定字段谁渲染谁生效）：页面属性默认值（栏目/路径/显示模板）
    createForm.setFieldsValue({
      contentTypeId: type.id,
      folderId: selectedFolderId || undefined,
      folder_id_s: selectedFolderId || undefined,
      routePath: folderPath + '/',
      route_path_s: folderPath + '/',
      templatePath: type.displayTemplate,
      template_path_s: type.displayTemplate,
    });
    // 布局默认值（需求 2026-09-21：表单布局参照设计器，字段默认值随之带入）
    for (const item of modelFormItems(buildModelFormNodes(type))) {
      if (item.kind === 'field' && item.field.defaultValue != null && item.field.defaultValue !== '') {
        createForm.setFieldValue(item.field.code, item.field.fieldType === 'BOOLEAN' ? item.field.defaultValue === 'true' : item.field.defaultValue);
      }
      if (item.kind === 'repeat') {
        createForm.setFieldValue(item.code, Array.from({ length: Math.max(item.minItems, 1) }, () => ({})));
      }
    }
    setCreateOpen(true);
  };
  const createPage = async (values: Record<string, unknown>) => {
    if (!siteId || !selectedTypeId) return;
    // 标题/页面属性绑定：内置输入退场时取布局绑定字段（按实际渲染的输入取值，回填两键均设）
    const pick = (code: string, builtin: string) => values[hasCode(createItems, code) ? code : builtin];
    const title = String(pick('title_s', 'title') ?? '').trim();
    if (!title) {
      message.error(t('请填写标题'));
      return;
    }
    setSaving(true);
    try {
      const fieldValues: Record<string, unknown> = {};
      for (const item of createItems) {
        if (item.kind !== 'field' || values[item.field.code] === undefined) continue;
        if (skipBinding(item.field)) continue;
        fieldValues[item.field.code] = item.field.fieldType === 'BOOLEAN'
          ? values[item.field.code] === true || values[item.field.code] === 'true'
          : values[item.field.code];
      }
      // 页面属性绑定：值映射条目级实体列；可视化模板走页面组成绑定（与内置输入同一后端语义）
      const folderId = pick('folder_id_s', 'folderId');
      const visualTemplateId = pick('visual_template_s', 'visualTemplateId');
      const created = await contentsApi.create(siteId, {
        title,
        contentTypeId: selectedTypeId,
        folderId: folderId ? String(folderId) : undefined,
        routePath: String(pick('route_path_s', 'routePath') ?? ''),
        templatePath: String(pick('template_path_s', 'templatePath') ?? ''),
        fieldValues: JSON.stringify(fieldValues),
      });
      if (visualTemplateId) await pageCompositionApi.save(siteId, created.id, String(visualTemplateId), {}, 0);
      setCreateOpen(false); await load(); message.success(t('页面已创建'));
    } finally { setSaving(false); }
  };
  const openEdit = async (page: PageInfo) => {
    setEditPage(page); setSaving(true);
    try {
      const [item, versions, composition] = await Promise.all([
        contentsApi.get(page.id),
        contentsApi.versions(page.id),
        pageCompositionApi.get(siteId!, page.id).catch(() => null),
      ]);
      setEditComposition(composition);
      const parsed = parseValues(versions[0]?.fieldValues);
      // 布局驱动的取值水合（日期等控件值归一）
      const type = pageTypes.find((model) => model.id === page.contentTypeId);
      for (const f of modelFormItems(buildModelFormNodes(type))) {
        if (f.kind !== 'field' || parsed[f.field.code] === undefined) continue;
        if (f.field.fieldType === 'BOOLEAN') parsed[f.field.code] = parsed[f.field.code] === true || parsed[f.field.code] === 'true';
        if (f.field.fieldType === 'DATE_TIME') parsed[f.field.code] = dayjs(String(parsed[f.field.code]));
      }
      // 回填两键均设（内置输入与布局绑定字段谁渲染谁生效，避免闭包期类型状态陈旧）：
      // 页面属性绑定值取条目级实体列 / 页面组成绑定（不入 fieldValues，无镜像）
      editForm.setFieldsValue({
        title: item.title,
        title_s: parsed.title_s ?? item.title,
        routePath: item.routePath,
        route_path_s: item.routePath,
        templatePath: item.templatePath,
        template_path_s: item.templatePath,
        folderId: item.folderId,
        folder_id_s: item.folderId,
        visualTemplateId: composition?.templateId,
        visual_template_s: composition?.templateId,
        ...parsed,
      });
    } finally { setSaving(false); }
  };
  const saveEdit = async (values: Record<string, unknown>) => {
    if (!editPage) return;
    // 标题/页面属性绑定：内置输入退场时取布局绑定字段（按实际渲染的输入取值，回填两键均设）
    const pick = (code: string, builtin: string) => values[hasCode(editItems, code) ? code : builtin];
    const title = String(pick('title_s', 'title') ?? '').trim();
    if (!title) {
      message.error(t('请填写标题'));
      return;
    }
    const fieldValues: Record<string, unknown> = {};
    for (const item of editItems) {
      if (item.kind !== 'field' || values[item.field.code] === undefined) continue;
      if (skipBinding(item.field)) continue;
      fieldValues[item.field.code] = item.field.fieldType === 'BOOLEAN'
        ? values[item.field.code] === true || values[item.field.code] === 'true'
        : values[item.field.code];
    }
    setSaving(true);
    try {
      if (editPage.status === 'PUBLISHED') await contentsApi.setStatus(editPage.id, 'DRAFT');
      // 页面属性绑定：值映射条目级实体列（folderId 随版本保存应用，null=不变更）
      const folderId = pick('folder_id_s', 'folderId');
      await contentsApi.saveVersion(editPage.id, {
        title,
        routePath: String(pick('route_path_s', 'routePath') ?? ''),
        templatePath: String(pick('template_path_s', 'templatePath') ?? ''),
        folderId: folderId ? String(folderId) : undefined,
        fieldValues: JSON.stringify(fieldValues),
        note: t('页面管理编辑'),
      });
      // 可视化模板绑定（页面组成）：变化时应用（与新建同一后端语义）
      const visualTemplateId = pick('visual_template_s', 'visualTemplateId');
      const nextVisual = visualTemplateId ? String(visualTemplateId) : undefined;
      const prevVisual = editComposition?.templateId || undefined;
      if (nextVisual !== prevVisual) {
        if (nextVisual) {
          await pageCompositionApi.save(siteId!, editPage.id, nextVisual, editComposition?.zones || {}, editComposition?.version ?? 0);
        } else if (editComposition) {
          await pageCompositionApi.unbind(siteId!, editPage.id, editComposition.version);
        }
      }
      setEditPage(undefined); await load(); message.success(t('页面已保存为新版本'));
    } finally { setSaving(false); }
  };
  const openPreview = (page: PageInfo) => navigate(`/pages/editor?pageId=${encodeURIComponent(page.id)}`);
  const actions = (page: PageInfo): MenuProps['items'] => [
    { key: 'edit', icon: <EditOutlined />, label: t('编辑'), onClick: () => void openEdit(page) },
    { key: 'preview', icon: <EyeOutlined />, label: t('编辑预览'), onClick: () => openPreview(page) },
    { key: 'content', label: t('在内容编辑器中打开'), onClick: () => navigate(`/content?type=${page.contentTypeId}&item=${page.id}`) },
  ];
  /** 三种列表视图共用的行内操作下拉。 */
  const pageActionButton = (page: PageInfo) => (
    <Dropdown trigger={['click']} menu={{ items: actions(page) }}>
      <Button
        type="text"
        icon={<EllipsisOutlined />}
        aria-label={t('更多操作')}
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );
  const pageTypeName = (page: PageInfo) =>
    pageTypes.find((type) => type.id === page.contentTypeId)?.name || page.contentTypeId;

  const treeData = useMemo<DataNode[]>(() => [
    { key: ROOT_KEY, title: site?.name || t('站点'), children: toTreeData(folders) },
  ], [folders, site?.name]);

  const selectedFolderLabel = selectedFolderId === ROOT_KEY ? (site?.name || t('站点'))
    : selectedFolderId ? findFolderById(folders, selectedFolderId)?.title : null;

  return <>
    {pages.length > 0 && (
      <Card
        size="small"
        title={t('常用页面')}
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="text"
            size="small"
            icon={quickCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={toggleQuickCollapsed}
          />
        }
      >
        {!quickCollapsed && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {pages.slice(0, 3).map((page) => (
              <Card key={page.id} hoverable size="small" onDoubleClick={() => openPreview(page)}>
                <Typography.Title level={5} ellipsis>{page.title}</Typography.Title>
                <Typography.Text type="secondary" ellipsis>{page.routePath}</Typography.Text>
                <div style={{ marginTop: 8 }}><Tag>{page.status}</Tag></div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    )}

    <div
      className={`content-browse${siderCollapsed ? ' is-sider-collapsed' : ''}`}
      style={{ gridTemplateColumns: siderCollapsed ? '48px 1fr' : `${siderWidth}px 12px 1fr` }}
    >
      {/* 栏目树侧边栏 */}
      <aside className="content-browse-sider content-search-sider">
        <div className="content-sider-collapsed" hidden={!siderCollapsed}>
          <Tooltip title={t('展开栏目树')} placement="right">
            <Button type="text" icon={<MenuUnfoldOutlined />} aria-label={t('展开栏目树')} onClick={toggleSiderCollapsed} />
          </Tooltip>
          <Tooltip title={t('栏目')} placement="right">
            <Button type="text" icon={<FolderOutlined />} aria-label={t('栏目')} className="is-active"
              onClick={() => { setSiderCollapsed(false); localStorage.setItem(SIDER_COLLAPSED_KEY, '0'); }} />
          </Tooltip>
        </div>
        <div className="content-sider-body" hidden={siderCollapsed}>
          <div style={{ padding: '8px 12px 0' }}>
            <Select
              allowClear
              placeholder={t('全部模型')}
              value={filterModelId}
              onChange={(value) => setFilterModelId(value || null)}
              options={pageTypes.map((t) => ({ value: t.id, label: t.name }))}
              style={{ width: '100%' }}
              size="small"
            />
          </div>
          <div className="content-search-header">
            <Typography.Title level={5}>{t('栏目')}</Typography.Title>
            <Tooltip title={t('收起栏目树')}>
              <Button type="text" size="small" icon={<MenuFoldOutlined />} aria-label={t('收起栏目树')} onClick={toggleSiderCollapsed} />
            </Tooltip>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
            <Tree
              defaultExpandAll
              selectedKeys={selectedFolderId ? [selectedFolderId] : []}
              treeData={treeData}
              titleRender={(node) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {node.key === ROOT_KEY ? <GlobalOutlined style={{ color: '#1677ff' }} /> : <FolderOutlined />}
                  <span>{node.title as string}</span>
                </span>
              )}
              onSelect={(keys) => {
                const key = keys[0] as string | undefined;
                setSelectedFolderId(key || null);
              }}
            />
          </div>
        </div>
      </aside>

      {/* 拖拽调整宽度 */}
      {!siderCollapsed && (
        <div className="content-browse-resizer" onMouseDown={onResizeStart}>
          <span className="content-browse-resizer-grip">⋮⋮</span>
        </div>
      )}

      {/* 主内容区 */}
      <div className="content-browse-main">
        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Input prefix={<SearchOutlined />} allowClear placeholder={t('搜索标题或 URL')} value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 280 }} />
          <Select allowClear placeholder={t('全部状态')} value={status} onChange={setStatus} style={{ width: 140 }} options={Array.from(new Set(pages.map((page) => page.status))).map((value) => ({ value }))} />
          <Checkbox checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)}>{t('显示已归档')}</Checkbox>
          {selectedFolderLabel && <Tag closable onClose={() => setSelectedFolderId(null)}>{selectedFolderLabel}</Tag>}
          {filterModelId && <Tag closable onClose={() => setFilterModelId(null)}>{pageTypes.find((t) => t.id === filterModelId)?.name}</Tag>}
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t('刷新')}</Button>
          <ViewModeDropdown value={viewMode} onChange={setViewMode} />
          {/* 需求 2026-09-21：添加页面 → 下拉选择 PAGE 模型，选中后进入全屏编辑表单 */}
          <Dropdown trigger={['click']} menu={{ items: createMenuItems, onClick: onCreateMenuClick }}>
            <Button type="primary" icon={<PlusOutlined />}>{t('添加页面')}</Button>
          </Dropdown>
        </Space>
        <div className="content-browse-table">
          {viewMode === 'table' ? (
          <Table<PageInfo> rowKey="id" loading={loading} dataSource={filtered} pagination={{ pageSize: 20 }} onRow={(page) => ({ onDoubleClick: () => openPreview(page) })} columns={[
            { title: t('标题'), dataIndex: 'title', sorter: (a, b) => a.title.localeCompare(b.title) },
            { title: 'URL', dataIndex: 'routePath', sorter: (a, b) => (a.routePath || '').localeCompare(b.routePath || '') },
            { title: t('栏目'), dataIndex: 'folderId', width: 120, render: (id: string) => id ? (findFolderById(folders, id)?.title || id) : '—' },
            { title: t('页面模型'), dataIndex: 'contentTypeId', render: (id: string) => pageTypes.find((type) => type.id === id)?.name || id },
            { title: t('状态'), dataIndex: 'status', width: 130, render: (value: string) => <Tag color={value === 'PUBLISHED' ? 'green' : 'default'}>{value}</Tag> },
            { title: t('最后编辑'), dataIndex: 'updatedAt', width: 190, render: (value: string) => formatDateTimeSeconds(value) },
            { title: '', width: 56, render: (_: unknown, page) => <Dropdown trigger={['click']} menu={{ items: actions(page) }}><Button type="text" icon={<EllipsisOutlined />} onClick={(event) => event.stopPropagation()} /></Dropdown> },
          ]} />
          ) : viewMode === 'thumbnail' ? (
            filtered.length === 0 ? (
              <Empty description={t('没有符合条件的页面')} />
            ) : (
              <div className="content-thumb-grid">
                {filtered.map((page) => (
                  <Card
                    key={page.id}
                    hoverable
                    size="small"
                    className="content-thumb-card"
                    onDoubleClick={() => openPreview(page)}
                    cover={
                      <div className="content-thumb-cover">
                        <ContentPreviewImage
                          siteId={siteId ?? undefined}
                          value={page.previewImage}
                          alt={page.title}
                          height={150}
                        />
                      </div>
                    }
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text strong ellipsis={{ tooltip: page.title }} style={{ display: 'block' }}>
                          {page.title}
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          ellipsis
                          style={{ display: 'block', marginTop: 4, fontSize: 12 }}
                        >
                          {page.routePath || '—'}
                        </Typography.Text>
                        <Space size={4} wrap style={{ marginTop: 6 }}>
                          <Tag color={page.status === 'PUBLISHED' ? 'green' : 'default'}>{page.status}</Tag>
                          <Tag color="blue">{pageTypeName(page)}</Tag>
                          <Tag>v{page.currentVersion}</Tag>
                        </Space>
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                          {formatDateTimeSeconds(page.updatedAt)}
                        </Typography.Text>
                      </div>
                      {pageActionButton(page)}
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <List
              className="content-list-view"
              bordered
              dataSource={filtered}
              locale={{ emptyText: t('没有符合条件的页面') }}
              renderItem={(page) => (
                <List.Item actions={[pageActionButton(page)]} onDoubleClick={() => openPreview(page)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
                    <ContentPreviewImage
                      siteId={siteId ?? undefined}
                      value={page.previewImage}
                      alt={page.title}
                      width={64}
                      height={64}
                      style={{ borderRadius: 6, flex: '0 0 auto' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space wrap size={6}>
                        <Button type="link" style={{ padding: 0 }} onClick={() => void openEdit(page)}>
                          {page.title}
                        </Button>
                        <Tag color={page.status === 'PUBLISHED' ? 'green' : 'default'}>{page.status}</Tag>
                        <Tag color="blue">{pageTypeName(page)}</Tag>
                      </Space>
                      <div style={{ marginTop: 4 }}>
                        <Space wrap size={12}>
                          <Typography.Text type="secondary">{page.routePath || '—'}</Typography.Text>
                          <Typography.Text type="secondary">v{page.currentVersion}</Typography.Text>
                          <Typography.Text type="secondary">{formatDateTimeSeconds(page.updatedAt)}</Typography.Text>
                        </Space>
                      </div>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
    </div>

    {/* 需求 2026-09-21：选型后直接进入全屏编辑表单（复用内容编辑器全屏样式） */}
    <Modal
      className="content-editor-modal"
      wrapClassName="content-editor-modal-wrap"
      title={
        <div className="content-editor-header">
          <Space wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {t('添加页面')}{selectedType ? ` · ${selectedType.name}` : ''}
            </Typography.Title>
            {selectedType && <Tag color="blue">{selectedType.code}</Tag>}
          </Space>
        </div>
      }
      open={createOpen}
      onCancel={() => setCreateOpen(false)}
      onOk={() => createForm.submit()}
      confirmLoading={saving}
      okText={t('创建页面')}
      destroyOnClose
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={() => setCreateOpen(false)}>{t('取消')}</Button>
          <Button type="primary" loading={saving} onClick={() => createForm.submit()}>{t('创建页面')}</Button>
        </Space>
      }
    >
      {selectedType && (
        <Form form={createForm} layout="vertical" onFinish={createPage}>
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}><Descriptions.Item label={t('页面模型')}>{selectedType.name}</Descriptions.Item></Descriptions>
          {/* 2026-09-22：模型布局含 title_s 时内置「标题」退场，标题由模型表单按设计器排版位置承载 */}
          {!createHasTitleField && (
            <Form.Item name="title" label={t('标题')} rules={[{ required: true }]}><Input /></Form.Item>
          )}
          {/* 内置页面属性输入项退场（2026-09-22）：模型布局含对应绑定字段时由 ModelFormRenderer 按布局位置渲染 */}
          {!hasCode(createItems, 'folder_id_s') && (
            <Form.Item name="folderId" label={t('所属栏目')} extra={t('选择栏目后路径自动推导')}>
              <TreeSelect allowClear placeholder={t('选择栏目（可选）')} treeData={folderTreeDataForSelect(folders)} treeLine showSearch treeNodeFilterProp="title" />
            </Form.Item>
          )}
          {!hasCode(createItems, 'route_path_s') && <Form.Item name="routePath" label="URL" rules={[{ required: true }]}><Input placeholder="/news/example" /></Form.Item>}
          {!hasCode(createItems, 'template_path_s') && <Form.Item name="templatePath" label={t('页面模板')}><Input /></Form.Item>}
          {!hasCode(createItems, 'visual_template_s') && <Form.Item name="visualTemplateId" label={t('可视化模板')}><Select allowClear options={templates.map((template) => ({ value: template.id, label: template.name }))} /></Form.Item>}
          {/* 需求 2026-09-21：模型字段表单完全参照设计器布局（分区/页签/行列结构控件驱动） */}
          <ModelFormRenderer type={selectedType} siteId={siteId || ''} />
        </Form>
      )}
    </Modal>
    <Modal title={editPage ? `编辑页面：${editPage.title}` : t('编辑页面')} width={900} open={Boolean(editPage)} onCancel={() => setEditPage(undefined)} onOk={() => editForm.submit()} confirmLoading={saving} okText={t('保存新版本')} destroyOnClose>
      {editPage ? <>{editPage.status === 'PUBLISHED' && <Alert type="warning" showIcon message={t('保存将先撤回已发布页面为 DRAFT；修改完成后需要重新审核并发布。')} style={{ marginBottom: 12 }} />}<Form form={editForm} layout="vertical" onFinish={saveEdit}><Space align="start" style={{ width: '100%' }} size="large"><div style={{ flex: 1 }}>{!editHasTitleField && <Form.Item name="title" label={t('标题')} rules={[{ required: true }]}><Input /></Form.Item>}{!hasCode(editItems, 'folder_id_s') && <Form.Item name="folderId" label={t('所属栏目')} extra={t('选择栏目后路径自动推导')}><TreeSelect allowClear={false} placeholder={t('选择栏目（可选）')} treeData={folderTreeDataForSelect(folders)} treeLine showSearch treeNodeFilterProp="title" /></Form.Item>}{!hasCode(editItems, 'route_path_s') && <Form.Item name="routePath" label="URL" rules={[{ required: true }]}><Input /></Form.Item>}{!hasCode(editItems, 'template_path_s') && <Form.Item name="templatePath" label={t('页面模板')}><Input /></Form.Item>}{!hasCode(editItems, 'visual_template_s') && <Form.Item name="visualTemplateId" label={t('可视化模板')}><Select allowClear options={templates.map((template) => ({ value: template.id, label: template.name }))} /></Form.Item>}{editType && <ModelFormRenderer type={editType} siteId={siteId || ''} contentId={editPage.id} />}</div><Card size="small" title={t('工作流')} style={{ width: 250 }}><Descriptions size="small" column={1}><Descriptions.Item label={t('页面模型')}>{pageTypes.find((type) => type.id === editPage.contentTypeId)?.name}</Descriptions.Item><Descriptions.Item label={t('状态')}>{editPage.status}</Descriptions.Item><Descriptions.Item label={t('版本')}>v{editPage.currentVersion}</Descriptions.Item></Descriptions><Button block style={{ marginTop: 12 }} onClick={() => navigate(`/content?type=${editPage.contentTypeId}&item=${editPage.id}`)}>{t('完整内容编辑器')}</Button></Card></Space></Form></> : <Empty />}
    </Modal>
  </>;
}
export default function PagesPage() { return <RequireSite><PagesInner /></RequireSite>; }
