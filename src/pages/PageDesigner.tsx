import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import {
  Alert, Button, Empty, Form, Input,  Modal, Select, Space,  Tabs, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  AppstoreOutlined, ArrowLeftOutlined, CodeOutlined, DeleteOutlined, DesktopOutlined, EditOutlined,
  EyeOutlined, FileTextOutlined, HolderOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MobileOutlined,
  PlusOutlined, RollbackOutlined, SaveOutlined, SearchOutlined, SendOutlined, SettingOutlined, TabletOutlined,
} from '@ant-design/icons';
import { contentsApi, modelsApi, pageCompositionApi, pagesApi, previewApi, previewOrigin, sharedComponentsApi, visualLayoutApi, widgetsApi } from '../api';
import type { ContentItem, ContentType, FieldDef, PageComponentSpec, PageComposition, PageInfo, SharedComponent, VisualContainer, VisualTemplate, WidgetDefinition } from '../api/types';
import { FieldControl } from '../components/ContentFieldControl';
import { RequireSite, useSite } from '../context/SiteContext';
import { useIframeBridge } from './uve/useIframeBridge';
import { useDragAutoScroll } from './uve/useDragAutoScroll';
import { UveCanvas } from './uve/UveCanvas';
import type { UveDropHint } from './uve/UveOverlay';
import { computeDropHint } from './uve/dropHint';
import { UVE, type UveComponentArea, type UveInlineEdit, type UveZoneArea } from './uve/protocol';
import './PageDesigner.css';
import { t } from '../i18n/locale';
import { openInNewTab } from '../openInNewTab';

type Device = 'desktop' | 'tablet' | 'mobile';
type Selection = { zoneKey: string; index: number } | null;
type DragState =
  | { source: 'palette'; typeId: string; label: string }
  | { source: 'content'; contentId: string; typeId: string; label: string }
  | { source: 'zone'; zoneKey: string; label: string }
  | { source: 'canvas'; typeId?: string; kind: string; from: { zoneKey: string; index: number }; label: string };

function isComponentType(type: ContentType) { return (type.objectType || type.templateType) === 'COMPONENT' && type.status !== 'DEPRECATED'; }
function fieldsOf(type?: ContentType): FieldDef[] {
  if (!type) return [];
  if (type.fields?.length) return type.fields.filter((f) => !['FORM_SECTION', 'REPEAT_GROUP', 'TAB'].includes(f.fieldType)).sort((a, b) => a.sortOrder - b.sortOrder);
  const fields: FieldDef[] = [];
  const walk = (items = type.layout || []) => items.forEach((item) => { if (item.elementType === 'FIELD' && item.field) fields.push(item.field); else if (item.children) walk(item.children); });
  walk();
  return fields.sort((a, b) => a.sortOrder - b.sortOrder);
}
function zoneKeysOf(template?: VisualTemplate) { return new Set((template?.zones || []).map((z) => z.zoneKey)); }
function deviceWidth(device: Device) { return device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1100; }

function PaletteCard({ type }: { type: ContentType }) {
  const drag = useDraggable({ id: `palette:${type.id}`, data: { source: 'palette', componentTypeId: type.id } });
  const style = drag.transform ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` } : undefined;
  return (
    <button type="button" ref={drag.setNodeRef} style={style} className={`uve-palette-card${drag.isDragging ? ' is-dragging' : ''}`} {...drag.listeners} {...drag.attributes}>
      <AppstoreOutlined className="uve-palette-card-icon" />
      <span className="uve-palette-card-title">{type.name}</span>
      <span className="uve-palette-card-code">{type.code}</span>
    </button>
  );
}

function DropZone({ zoneKey, disabled, children }: { zoneKey: string; disabled: boolean; children: React.ReactNode }) {
  const drop = useDroppable({ id: `zone:${zoneKey}`, data: { zoneKey }, disabled });
  return <div ref={drop.setNodeRef} className={`uve-zone-list${drop.isOver ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}>{children}</div>;
}

function ContentPaletteItem({ item, type }: { item: ContentItem; type?: ContentType }) {
  const drag = useDraggable({ id: `content:${item.id}`, data: { source: 'content', contentId: item.id, componentTypeId: item.contentTypeId, label: item.title } });
  return <button ref={drag.setNodeRef} type="button" className="uve-shared-item" {...drag.listeners} {...drag.attributes}>
    <FileTextOutlined /><span>{item.title}</span><Typography.Text type="secondary">{type?.name || item.contentTypeId}</Typography.Text>
  </button>;
}

function PageDesignerInner() {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHint, setDropHint] = useState<UveDropHint | null>(null);
  const dropHintRef = useRef<UveDropHint | null>(null);
  const allowedZoneKeysRef = useRef<Set<string>>(new Set());
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [templates, setTemplates] = useState<VisualTemplate[]>([]);
  const [containers, setContainers] = useState<VisualContainer[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [allTypes, setAllTypes] = useState<ContentType[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [shared, setShared] = useState<SharedComponent[]>([]);
  const [widgets, setWidgets] = useState<WidgetDefinition[]>([]);
  const [pageId, setPageId] = useState<string>();
  const [templateId, setTemplateId] = useState<string>();
  const [composition, setComposition] = useState<PageComposition>();
  const [compositionLoaded, setCompositionLoaded] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [zoom, setZoom] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const bridgeRetryRef = useRef(false);
  const [propsForm] = Form.useForm();
  const [pageForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [rightTab, setRightTab] = useState<'props' | 'page' | 'layout'>('props');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [forceFallback, setForceFallback] = useState(false);
  const [canvasUrl, setCanvasUrl] = useState<string>();
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);
  const compositionRef = useRef<PageComposition>();
  compositionRef.current = composition;

  const openRightTab = (tab: 'props' | 'page' | 'layout') => {
    if (rightOpen && rightTab === tab) {
      setRightOpen(false);
      return;
    }
    setRightTab(tab);
    setRightOpen(true);
  };

  const template = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const templateOptions = useMemo(() => {
    const opts = templates.filter((t) => !t.anonymous).map((t) => ({ value: t.id, label: t.name }));
    const current = templates.find((t) => t.id === templateId);
    if (current?.anonymous) opts.push({ value: current.id, label: t('定制页面布局') });
    return opts;
  }, [templates, templateId]);
  const page = pages.find((p) => p.id === pageId);
  const zones = composition?.zones || {};
  const selectedItem = selection ? zones[selection.zoneKey]?.[selection.index] : undefined;
  const selectedType = allTypes.find((t) => t.id === selectedItem?.componentTypeId);

  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const nonce = useMemo(() => crypto.randomUUID(), [pageId]);
  const visualEligible = Boolean(pageId && page?.routePath && composition?.templateId);
  const visualMode = visualEligible && !forceFallback;

  const selectArea = (area: UveComponentArea | null) => {
    if (!area) { setSelection(null); setSelectedZoneKey(null); return; }
    setSelectedZoneKey(null);
    const list = zonesRef.current[area.zoneKey] || [];
    const byId = list.findIndex((x) => x.id === area.componentId);
    const index = byId >= 0 ? byId : area.index;
    if (!list[index]) return;
    setSelection({ zoneKey: area.zoneKey, index });
    setRightTab('props');
    setRightOpen(true);
  };

  const saveInlineEdit = async (edit: UveInlineEdit) => {
    if (!siteId || !pageId || !edit?.componentId || !edit.fieldName) return;
    if (edit.contentItemId) {
      try {
        await contentsApi.updateInlineField(siteId, edit.contentItemId, {
          fieldCode: edit.fieldName, value: edit.value, expectedVersion: edit.contentVersion || 0, format: edit.format,
        });
        bridge.reload();
        message.success(t('内容已保存为新版本'));
      } catch (err) {
        if (isVersionConflict(err)) promptConflict();
        else { message.error(t('内容内联保存失败')); bridge.reload(); }
      }
      return;
    }
    const snapshot = zonesRef.current;
    let location: { zoneKey: string; index: number } | undefined;
    for (const [zoneKey, list] of Object.entries(snapshot)) {
      const index = list.findIndex((item) => item.id === edit.componentId);
      if (index >= 0) { location = { zoneKey, index }; break; }
    }
    if (!location) return;
    const current = snapshot[location.zoneKey][location.index];
    if (current.kind !== 'EMBEDDED') { message.warning(t('共享组件暂不支持页面内联编辑')); return; }
    const type = allTypes.find((item) => item.id === current.componentTypeId);
    const field = fieldsOf(type).find((item) => item.code === edit.fieldName);
    if (!field || !['STRING', 'LONG_TEXT', 'RICH_TEXT'].includes(field.fieldType) || field.readOnly) {
      message.error(t('该字段不允许内联编辑'));
      bridge.reload();
      return;
    }
    const list = [...snapshot[location.zoneKey]];
    const updated: PageComponentSpec = { ...current, data: { ...current.data, [edit.fieldName]: edit.value } };
    list[location.index] = updated;
    const next = { ...snapshot, [location.zoneKey]: list };
    try {
      const saved = await pageCompositionApi.save(siteId, pageId, compositionRef.current?.templateId || templateId!, next, compositionRef.current?.version || 0);
      setComposition(saved);
      await refreshComponent(updated, location.zoneKey, location.index);
      message.success(`“${field.name}”已保存`);
    } catch (err) {
      if (isVersionConflict(err)) promptConflict();
      else { message.error(t('内联字段保存失败')); bridge.reload(); }
    }
  };

  const bridge = useIframeBridge({
    enabled: visualMode,
    apiOrigin: previewOrigin,
    nonce,
    onComponentClicked: selectArea,
    onZoneClicked: (area: UveZoneArea) => {
      setSelection(null); setSelectedZoneKey(area.zoneKey); setRightTab('layout'); setRightOpen(true);
    },
    onInlineEditStarted: (edit) => setInlineEditingId(edit.componentId),
    onInlineEditSave: (edit) => void saveInlineEdit(edit),
    onInlineEditEnded: () => setInlineEditingId(null),
  });
  useDragAutoScroll({ active: visualMode && !!drag, iframeRef: bridge.iframeRef, send: bridge.send });

  // 拖拽命中测试：指针 → 画布坐标 → 目标投放区 + 插入索引（组件中线上下），产出插入指示线几何。
  useEffect(() => {
    if (!visualMode || !drag) {
      dropHintRef.current = null;
      setDropHint(null);
      return;
    }
    const zonesSnapshot = bridge.zones;
    const onMove = (event: PointerEvent) => {
      const frame = bridge.iframeRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      // 画布缩放时 rect 为缩放后的视觉尺寸，除以 zoom 换算回 iframe 内容坐标
      const px = (event.clientX - rect.left) / zoom;
      const py = (event.clientY - rect.top) / zoom;
      const hint = (px >= 0 && py >= 0 && px <= rect.width / zoom && py <= rect.height / zoom)
        ? computeDropHint(zonesSnapshot, { x: px, y: py }, allowedZoneKeysRef.current)
        : null;
      dropHintRef.current = hint;
      setDropHint(hint);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [visualMode, drag, bridge.zones, bridge.iframeRef, zoom]);

  const load = async () => {
    if (!siteId) return;
    const [p, t, c, m, w] = await Promise.all([
      pagesApi.list(siteId), visualLayoutApi.templates(siteId), visualLayoutApi.containers(siteId), modelsApi.list(siteId),
      widgetsApi.list(siteId).catch(() => [] as WidgetDefinition[]),
    ]);
    setPages(p); setTemplates(t); setContainers(c); setAllTypes(m); setTypes(m.filter(isComponentType)); setWidgets(w);
    const placeable = m.filter((type) => !['PAGE', 'COMPONENT'].includes(type.objectType || type.templateType));
    setContentItems((await Promise.all(placeable.map((type) => contentsApi.listByType(siteId, type.id).catch(() => [] as ContentItem[])))).flat());
    setShared(await sharedComponentsApi.list(siteId).catch(() => []));
    const requested = searchParams.get('pageId');
    setPageId(requested && p.some((x) => x.id === requested) ? requested : undefined);
  };
  useEffect(() => { void load(); }, [siteId]);
  useEffect(() => {
    const requested = searchParams.get('pageId');
    if (!pages.length) return;
    setPageId(requested && pages.some((x) => x.id === requested) ? requested : undefined);
  }, [searchParams, pages]);
  useEffect(() => {
    if (!siteId || !pageId) { setComposition(undefined); setCompositionLoaded(false); setSelection(null); return; }
    setCompositionLoaded(false);
    void pageCompositionApi.get(siteId, pageId).then((c) => {
      // 不再回退 templates[0]：未绑定的页面保持未选中，避免「预览/保存」顺手为页面创建绑定（缺陷 ⑤）。
      setComposition(c); setTemplateId(c.templateId); setCompositionLoaded(true);
    }).catch(() => { setCompositionLoaded(false); message.error(t('页面布局加载失败')); });
  }, [siteId, pageId, templates.length]);
  // 当前绑定模板若是页面专属匿名布局（不在常规模板列表），单独拉取以保证渲染与下拉展示完整
  useEffect(() => {
    if (!siteId || !templateId || templates.some((t) => t.id === templateId)) return;
    let cancelled = false;
    visualLayoutApi.getTemplate(siteId, templateId)
      .then((cur) => { if (!cancelled) setTemplates((list) => list.some((x) => x.id === cur.id) ? list : [...list, cur]); })
      .catch(() => { /* 模板详情拉取失败时保持最佳努力渲染 */ });
    return () => { cancelled = true; };
  }, [siteId, templateId, templates]);
  useEffect(() => {
    if (!selectedItem) { propsForm.resetFields(); return; }
    propsForm.setFieldsValue({ title: selectedItem.title, templatePath: selectedItem.templatePath, ...selectedItem.data });
  }, [selectedItem?.id, selection?.zoneKey, selection?.index]);

  // 进入可视化模式时获取预览令牌并构造 editMode 画布地址；到期前 60 秒自动续签并重载画布
  useEffect(() => {
    let cancelled = false;
    let renewTimer: number | undefined;
    setCanvasUrl(undefined);
    setForceFallback(false);
    bridgeRetryRef.current = false;
    if (!siteId || !pageId || !page?.routePath || !composition?.templateId) return;
    const fetchToken = async () => {
      try {
        const t = await previewApi.token(siteId);
        if (cancelled) return;
        setCanvasUrl(previewApi.editPageUrl(t.token, page.routePath!, nonce));
        const expiresIn = new Date(t.expiresAt).getTime() - Date.now();
        if (Number.isFinite(expiresIn) && expiresIn > 90_000) {
          renewTimer = window.setTimeout(() => { void fetchToken(); }, expiresIn - 60_000);
        }
      } catch {
        if (!cancelled) { setForceFallback(true); message.error(t('获取预览令牌失败，已切换到结构画布')); }
      }
    };
    void fetchToken();
    return () => { cancelled = true; if (renewTimer) window.clearTimeout(renewTimer); };
  }, [siteId, pageId, page?.routePath, composition?.templateId, nonce]);

  // 桥接超时：先重取令牌重试一次（令牌可能已失效），再失败才回退到结构画布
  useEffect(() => {
    if (!visualMode || !canvasUrl || bridge.ready) return;
    const timer = setTimeout(() => {
      if (!bridgeRetryRef.current && siteId && page?.routePath) {
        bridgeRetryRef.current = true;
        previewApi.token(siteId)
          .then((t) => setCanvasUrl(`${previewApi.editPageUrl(t.token, page.routePath!, nonce)}&_ts=${Date.now()}`))
          .catch(() => setForceFallback(true));
        return;
      }
      setForceFallback(true);
      message.warning(t('可视化画布未就绪，已切换到结构画布（请检查 powercms.preview.admin-frame-ancestor 配置）'));
    }, 10000);
    return () => clearTimeout(timer);
  }, [visualMode, canvasUrl, bridge.ready, siteId, page?.routePath, nonce]);
  useEffect(() => {
    if (!visualMode || !bridge.ready || !bridge.hasBounds) return;
    if (bridge.zones.length === 0) {
      setForceFallback(true);
      message.warning(t('页面模板未输出可视化投放区（renderedZones），已切换到结构画布'));
    }
  }, [visualMode, bridge.ready, bridge.hasBounds, bridge.zones.length]);

  const setZones = (next: Record<string, PageComponentSpec[]>) => setComposition((c) => ({ id: c?.id, pageId: pageId!, templateId, version: c?.version || 0, zones: next }));

  const isVersionConflict = (err: unknown) =>
    (err as { response?: { data?: { code?: string } } })?.response?.data?.code === 'CONTENT_VERSION_CONFLICT';

  /** 版本冲突：提示他人已修改，确认后拉取最新布局并重载画布（本地未保存改动丢弃）。 */
  const promptConflict = () => {
    Modal.confirm({
      title: t('他人已修改此页面布局'),
      content: t('服务器上的布局版本比当前编辑的新。点击“刷新合并”加载最新布局后继续编辑，本次未保存的改动将丢失。'),
      okText: t('刷新合并'),
      cancelText: t('稍后处理'),
      onOk: async () => {
        if (!siteId || !pageId) return;
        const c = await pageCompositionApi.get(siteId, pageId);
        setComposition(c);
        if (c.templateId) setTemplateId(c.templateId);
        setSelection(null);
        if (visualMode) bridge.reload();
      },
    });
  };

  /** 可视化模式下修改需立即持久化；reload=false 时由调用方负责局部刷新。 */
  const persistZones = async (next: Record<string, PageComponentSpec[]>, reload = true) => {
    if (!siteId || !pageId || !templateId || !compositionLoaded || !composition) {
      message.warning(t('页面布局尚未加载完成，不能保存'));
      return false;
    }
    try {
      const saved = await pageCompositionApi.save(siteId, pageId, templateId, next, composition?.version || 0);
      setComposition(saved);
      if (visualMode && reload) bridge.reload();
      return true;
    } catch (err) {
      if (isVersionConflict(err)) promptConflict();
      else message.error(t('保存布局失败'));
      return false;
    }
  };

  /** 单组件局部刷新：服务端渲染该组件 HTML 后原位替换，失败回退整页 reload。 */
  const refreshComponent = async (spec: PageComponentSpec, zoneKey: string, index: number) => {
    if (!siteId || !pageId) return;
    try {
      const res = await pageCompositionApi.renderComponent(siteId, pageId, { zoneKey, index, component: spec });
      bridge.send(UVE.replaceComponent, { componentId: spec.id, html: res.html });
    } catch {
      bridge.reload();
    }
  };
  const allowed = (key: string) => {
    const z = template?.zones.find((x) => x.zoneKey === key);
    const c = containers.find((x) => x.id === z?.containerId);
    if (!c) return types;
    const maxContents = (() => { try { return Number(JSON.parse(c.config || '{}').maxContents || 0); } catch { return 0; } })();
    // 系统 COMPONENT 类型（如统计采集）不受 allowlist 限制，可投放任意投放区（与后端规则一致）
    const systemTypes = types.filter((t) => t.isSystem);
    if (maxContents === 0) return systemTypes;
    const ids = (c.containerStructures || []).map((link) => link.structureId);
    const normal = types.filter((t) => ids.includes(t.id));
    return [...normal, ...systemTypes.filter((s) => !normal.some((n) => n.id === s.id))];
  };
  const filteredTypes = types.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(paletteQuery.trim().toLowerCase()));
  const filteredShared = shared.filter((x) => `${x.path} ${x.title}`.toLowerCase().includes(paletteQuery.trim().toLowerCase()));
  const filteredWidgets = widgets.filter((w) => `${w.name} ${w.code}`.toLowerCase().includes(paletteQuery.trim().toLowerCase()));

  const dragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.source === 'canvas') {
      setDrag({
        source: 'canvas',
        typeId: data.componentTypeId as string | undefined,
        kind: String(data.kind || 'EMBEDDED'),
        from: { zoneKey: String(data.zoneKey), index: Number(data.index) },
        label: String(data.label || t('组件')),
      });
    } else if (data.source === 'zone') {
      const zoneKey = String(data.zoneKey || ''); if (!zoneKey) return;
      setDrag({ source: 'zone', zoneKey, label: `Container · ${zoneKey}` });
    } else if (data.source === 'content') {
      const contentId = String(data.contentId || ''); const typeId = String(data.componentTypeId || '');
      if (!contentId || !typeId) return; setDrag({ source: 'content', contentId, typeId, label: String(data.label || t('内容')) });
    } else {
      const typeId = data.componentTypeId as string | undefined; if (!typeId) return;
      setDrag({ source: 'palette', typeId, label: types.find((t) => t.id === typeId)?.name || t('组件') });
    }
    if (visualMode) bridge.flushBounds();
  };

  const clearDrag = () => {
    setDrag(null);
    setDropHint(null);
    dropHintRef.current = null;
  };

  /** 在指定投放区的指定位置插入新组件并选中。 */
  const insertAt = (typeId: string, zoneKey: string, index: number) => {
    const type = types.find((t) => t.id === typeId);
    if (!type) return;
    if (!allowed(zoneKey).some((t) => t.id === typeId)) { message.warning(t('该组件不能放入此投放区')); return; }
    const item: PageComponentSpec = { id: crypto.randomUUID(), kind: 'EMBEDDED', componentTypeId: typeId, title: type.name, data: {}, additionalModel: {}, order: index };
    const list = [...(zones[zoneKey] || [])];
    const at = Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, item);
    const next = { ...zones, [zoneKey]: list };
    setZones(next);
    setSelection({ zoneKey, index: at });
    setSelectedZoneKey(null);
    setRightTab('props');
    setRightOpen(true);
    if (visualMode) void persistZones(next);
    message.success(`已插入“${type.name}”`);
  };

  /** 画布内组件换位 / 跨投放区移动。 */
  const insertContentAt = (contentId: string, typeId: string, zoneKey: string, index: number) => {
    const content = contentItems.find((item) => item.id === contentId);
    if (!content || !allowed(zoneKey).some((type) => type.id === typeId)) return;
    const item: PageComponentSpec = { id: crypto.randomUUID(), kind: 'CONTENT', contentItemId: contentId,
      componentTypeId: typeId, title: content.title, data: {}, additionalModel: {}, order: index };
    const list = [...(zones[zoneKey] || [])]; const at = Math.max(0, Math.min(index, list.length)); list.splice(at, 0, item);
    const next = { ...zones, [zoneKey]: list }; setZones(next); setSelection({ zoneKey, index: at });
    if (visualMode) void persistZones(next);
  };

  const moveTo = (from: { zoneKey: string; index: number }, zoneKey: string, index: number) => {
    const sourceList = [...(zones[from.zoneKey] || [])];
    const [item] = sourceList.splice(from.index, 1);
    if (!item) return;
    const sameZone = from.zoneKey === zoneKey;
    let at = index;
    if (sameZone && at > from.index) at -= 1;
    const targetList = sameZone ? sourceList : [...(zones[zoneKey] || [])];
    at = Math.max(0, Math.min(at, targetList.length));
    if (sameZone && at === from.index) return;
    targetList.splice(at, 0, item);
    const next = { ...zones, [from.zoneKey]: sourceList, [zoneKey]: targetList };
    setZones(next);
    setSelection({ zoneKey, index: at });
    if (visualMode) void persistZones(next);
  };

  const layoutZoneKeys = () => { try { const root = JSON.parse(template?.layoutJson || '{}') as { rows?: { boxes?: { zoneKeys?: string[]; zoneKey?: string }[] }[] }; const keys: string[]=[]; root.rows?.forEach(r=>r.boxes?.forEach(b=>(b.zoneKeys||(b.zoneKey?[b.zoneKey]:[])).forEach(k=>{if(!keys.includes(k))keys.push(k)}))); return keys; } catch { return []; } };
  const saveLayoutZoneKeys = async (keys: string[], success: string) => {
    if (!siteId || !pageId || !template) return;
    try {
      const root = JSON.parse(template.layoutJson || '{}') as { rows?: { boxes?: { zoneKeys?: string[]; zoneKey?: string }[] }[] };
      let set = false;
      root.rows?.forEach((r) => r.boxes?.forEach((b) => { if (!set && (b.zoneKeys || b.zoneKey)) { b.zoneKeys = keys; delete b.zoneKey; set = true; } }));
      const saved = await pageCompositionApi.saveLayout(siteId, pageId, JSON.stringify(root), composition?.version || 0);
      setComposition(saved);
      setTemplateId(saved.templateId);
      try {
        if (saved.templateId) {
          const cur = await visualLayoutApi.getTemplate(siteId, saved.templateId);
          setTemplates((list) => list.some((x) => x.id === cur.id) ? list.map((x) => (x.id === cur.id ? cur : x)) : [...list, cur]);
        }
      } catch { /* 布局元数据刷新为最佳努力，失败不影响已保存结果 */ }
      setSelectedZoneKey(null);
      bridge.reload();
      message.success(success);
    } catch (err) {
      if (isVersionConflict(err)) promptConflict();
      else message.error(t('区块布局更新失败'));
    }
  };
  const moveSelectedZone=(delta:number)=>{if(!selectedZoneKey)return;const keys=layoutZoneKeys(),from=keys.indexOf(selectedZoneKey),to=from+delta;if(from<0||to<0||to>=keys.length)return;[keys[from],keys[to]]=[keys[to],keys[from]];void saveLayoutZoneKeys(keys,t('区块顺序已更新'))};
  const moveZoneTo=(key:string,target:string)=>{const keys=layoutZoneKeys(),from=keys.indexOf(key),to=keys.indexOf(target);if(from<0||to<0||from===to)return;keys.splice(to,0,keys.splice(from,1)[0]);void saveLayoutZoneKeys(keys,t('区块顺序已更新'))};
  const hideSelectedZone=()=>{if(!selectedZoneKey)return;const key=selectedZoneKey,count=zones[key]?.length||0;Modal.confirm({title:`从当前模板隐藏 ${key}？`,content:count?`其中 ${count} 条内容投放会保留，重新加入投放区后可恢复显示。`:t('Container 定义不会被删除。'),okText:t('隐藏区块'),okButtonProps:{danger:true},onOk:()=>saveLayoutZoneKeys(layoutZoneKeys().filter(x=>x!==key),t('区块已从模板隐藏'))})};
  const editSelectedZone=()=>{const zone=template?.zones.find(x=>x.zoneKey===selectedZoneKey);if(zone?.containerId)navigate(`/containers?containerId=${zone.containerId}`)};

  const dragEnd = (e: DragEndEvent) => {
    const state = drag;
    const hint = dropHintRef.current;
    clearDrag();
    if (!state) return;
    if (visualMode) {
      if (!hint) return;
      if (state.source === 'palette') insertAt(state.typeId, hint.zoneKey, hint.index);
      else if (state.source === 'content') insertContentAt(state.contentId, state.typeId, hint.zoneKey, hint.index);
      else if (state.source === 'zone') moveZoneTo(state.zoneKey, hint.zoneKey);
      else moveTo(state.from, hint.zoneKey, hint.index);
      return;
    }
    if (state.source !== 'palette') return;
    const key = e.over?.data.current?.zoneKey as string | undefined;
    if (!key) return;
    insertAt(state.typeId, key, (zones[key] || []).length);
  };

  const insertShared = (item: SharedComponent, zoneKey: string) => {
    const spec: PageComponentSpec = { id: crypto.randomUUID(), kind: 'SHARED', sharedComponentId: item.id, title: item.title, data: {}, additionalModel: {}, order: (zones[zoneKey] || []).length };
    const list = [...(zones[zoneKey] || []), spec];
    const next = { ...zones, [zoneKey]: list };
    setZones(next);
    setSelection({ zoneKey, index: list.length - 1 });
    setRightTab('props');
    setRightOpen(true);
    if (visualMode) void persistZones(next);
  };

  const removeSelected = () => {
    if (!selection) return;
    const list = [...(zones[selection.zoneKey] || [])];
    list.splice(selection.index, 1);
    const next = { ...zones, [selection.zoneKey]: list };
    setZones(next);
    setSelection(null);
    if (visualMode) void persistZones(next);
  };

  const moveSelected = (delta: number) => {
    if (!selection) return;
    const list = [...(zones[selection.zoneKey] || [])];
    const target = selection.index + delta;
    if (target < 0 || target >= list.length) return;
    [list[selection.index], list[target]] = [list[target], list[selection.index]];
    const next = { ...zones, [selection.zoneKey]: list };
    setZones(next);
    setSelection({ zoneKey: selection.zoneKey, index: target });
    if (visualMode) void persistZones(next);
  };

  const saveProps = async (values: Record<string, unknown>) => {
    if (!selection || !selectedItem) return;
    const list = [...(zones[selection.zoneKey] || [])];
    const data: Record<string, unknown> = { ...selectedItem.data };
    fieldsOf(selectedType).forEach((f) => { if (values[f.code] !== undefined) data[f.code] = values[f.code]; });
    const updated: PageComponentSpec = { ...selectedItem, title: String(values.title || selectedItem.title || ''), templatePath: values.templatePath ? String(values.templatePath) : selectedItem.templatePath, data };
    list[selection.index] = updated;
    const next = { ...zones, [selection.zoneKey]: list };
    setZones(next);
    if (visualMode) {
      const ok = await persistZones(next, false);
      if (!ok) return;
      await refreshComponent(updated, selection.zoneKey, selection.index);
      message.success(t('组件属性已保存'));
    } else {
      message.success(t('组件属性已更新（请保存布局）'));
    }
  };

  const openJsonEditor = () => {
    if (selectedItem) setJsonDraft(JSON.stringify(selectedItem.data || {}, null, 2));
  };
  const applyJson = async () => {
    if (!selection || !selectedItem || jsonDraft == null) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(jsonDraft || '{}') as Record<string, unknown>; } catch { message.error(t('JSON 无效')); return; }
    const updated: PageComponentSpec = { ...selectedItem, data };
    const list = [...(zones[selection.zoneKey] || [])];
    list[selection.index] = updated;
    const next = { ...zones, [selection.zoneKey]: list };
    setZones(next);
    setJsonDraft(null);
    if (visualMode) {
      const ok = await persistZones(next, false);
      if (!ok) return;
      await refreshComponent(updated, selection.zoneKey, selection.index);
      message.success(t('组件数据已保存'));
    }
  };

  const save = async () => {
    if (!siteId || !pageId || !compositionLoaded || !composition) {
      message.warning(t('页面布局尚未加载完成，不能保存'));
      return;
    }
    if (!templateId) {
      message.warning(t('请先选择可视化模板；绑定后页面将由「模板直出」切换为「站点外壳 + 可视化布局」'));
      return;
    }
    setSaving(true);
    try {
      const result = await pageCompositionApi.save(siteId, pageId, templateId, zones, composition?.version || 0);
      setComposition(result);
      if (visualMode) bridge.reload();
      message.success(t('页面布局已保存'));
    } catch (err) {
      if (isVersionConflict(err)) promptConflict();
      else message.error(t('保存布局失败'));
    } finally { setSaving(false); }
  };

  /** 发布：先保存布局，再跑发布检查，通过后置为 PUBLISHED。 */
  const publishPage = async () => {
    if (!siteId || !pageId) return;
    setPublishing(true);
    try {
      // 发布只保存既有绑定，不为未绑定页面新建组合（缺陷 ⑤）。
      if (composition?.templateId && templateId) {
        const ok = await persistZones(zones, false);
        if (!ok) return;
      }
      const checklist = await contentsApi.publishChecklist(pageId);
      if (!checklist.pass) {
        Modal.warning({
          title: t('发布检查未通过'),
          content: (
            <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
              {checklist.items.map((item, i) => <li key={i}>[{item.level}] {item.message}</li>)}
            </ul>
          ),
        });
        return;
      }
      await contentsApi.setStatus(pageId, 'PUBLISHED');
      message.success(t('页面已发布'));
      await load();
    } catch { /* 具体错误已由全局拦截器提示 */ }
    finally { setPublishing(false); }
  };

  const unpublishPage = async () => {
    if (!pageId) return;
    try {
      await contentsApi.setStatus(pageId, 'DRAFT');
      message.success(t('页面已转为草稿'));
      await load();
    } catch { /* 具体错误已由全局拦截器提示 */ }
  };

  const openPreview = async () => {
    if (!siteId || !pageId || !page?.routePath) return message.warning(t('页面没有路由'));
    const routePath = page.routePath; // 捕获窄化类型，供异步回调内使用
    try {
      // 仅在页面「已有绑定」时才落库：未绑定页面的预览不得顺带创建组合绑定（缺陷 ⑤）。
      if (composition?.templateId && templateId) {
        const saved = await pageCompositionApi.save(siteId, pageId, templateId, zones, composition?.version || 0);
        setComposition(saved);
      }
      // 回归缺陷 ④：window.open 必须在用户手势内同步发生，否则被弹窗拦截器静默吃掉
      openInNewTab(
        async () => {
          const token = await previewApi.token(siteId);
          return previewApi.pageUrl(token.token, routePath);
        },
        () => message.error(t('预览被浏览器拦截，请允许弹出窗口后重试')),
        () => message.error(t('预览打开失败')),
      );
    } catch {
      message.error(t('预览打开失败'));
    }
  };

  /** 解绑：删除页面组合绑定，渲染回到「模板直出」（缺陷 ⑥，需先有绑定）。 */
  const clearLayout = () => {
    if (!siteId || !pageId || !composition?.templateId) return;
    Modal.confirm({
      title: t('清除页面布局（解绑可视化模板）？'),
      content: t('页面将回到「模板直出」形态：不再套站点外壳与可视化布局，正文须由代码模板(.ftl)单独完整输出。'),
      okText: t('清除'),
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const cleared = await pageCompositionApi.unbind(siteId, pageId, composition?.version || 0);
          setComposition(cleared);
          setTemplateId(undefined);
          setSelection(null);
          setSelectedZoneKey(null);
          message.success(t('页面布局已清除'));
        } catch (err) {
          if (isVersionConflict(err)) promptConflict();
          else message.error(t('清除页面布局失败'));
        }
      },
    });
  };

  const onTemplateChange = (nextId: string) => {
    if (nextId === templateId) return;
    const nextKeys = zoneKeysOf(templates.find((t) => t.id === nextId));
    const nextZones: Record<string, PageComponentSpec[]> = {};
    Object.entries(zones).forEach(([key, list]) => { if (nextKeys.has(key)) nextZones[key] = list; });
    const apply = () => { setTemplateId(nextId); setZones(nextZones); setSelection(null); };
    if (composition?.templateId) { apply(); return; }
    // 未绑定页面：选择模板即等于「为该页面新建绑定」，必须显式确认并说明渲染形态会改变（缺陷 ⑤）。
    Modal.confirm({
      title: t('为该页面绑定可视化模板？'),
      content: t('绑定并保存后，页面将由「模板直出」切换为「站点外壳 + 可视化布局 + 模板正文」，页面渲染形态会改变。'),
      okText: t('绑定'),
      cancelText: t('取消'),
      onOk: apply,
    });
  };

  if (!pageId) {
    return (
      <div className="uve-shell uve-empty">
        <Empty description={t('请从页面列表双击进入可视化编辑')}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/pages')}>{t('返回页面列表')}</Button>
        </Empty>
      </div>
    );
  }

  const defaultZone = template?.zones?.[0]?.zoneKey;

  const titleOf = (area: UveComponentArea) => {
    const spec = (zones[area.zoneKey] || []).find((x) => x.id === area.componentId);
    if (!spec) return area.zoneKey;
    if (spec.kind === 'CONTENT') return spec.title || contentItems.find((item) => item.id === spec.contentItemId)?.title || 'Contentlet';
    if (spec.kind === 'SHARED') return spec.title || shared.find((s) => s.id === spec.sharedComponentId)?.title || 'Shared';
    return spec.title || types.find((t) => t.id === spec.componentTypeId)?.name || 'Component';
  };
  const allowedZoneKeys = (() => {
    if (!drag || !template) return new Set<string>();
    const everyZone = new Set(template.zones.map((z) => z.zoneKey));
    if (drag.source === 'zone') return everyZone;
    if (drag.source === 'canvas' && drag.kind !== 'EMBEDDED') return everyZone;
    const typeId = drag.typeId;
    if (!typeId) return everyZone;
    return new Set(template.zones.filter((z) => allowed(z.zoneKey).some((t) => t.id === typeId)).map((z) => z.zoneKey));
  })();
  allowedZoneKeysRef.current = allowedZoneKeys;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={clearDrag}>
      <div className="uve-shell">
        <header className="uve-topbar">
          <Space wrap>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/pages')}>{t('页面')}</Button>
            <Tag color={page?.status === 'PUBLISHED' ? 'green' : 'default'}>{page?.status || 'DRAFT'}</Tag>
            <Typography.Text strong>{page?.title}</Typography.Text>
            <Typography.Text type="secondary" copyable={page?.routePath ? { text: page.routePath } : false}>{page?.routePath}</Typography.Text>
          </Space>
          <Space wrap>
            <Select style={{ width: 200 }} value={templateId} placeholder={t('可视化模板')} options={templateOptions} onChange={onTemplateChange} />
            <Button icon={<EyeOutlined />} onClick={() => void openPreview()}>{t('预览')}</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!templateId} onClick={() => void save()}>{t('保存')}</Button>
            {composition?.templateId && (
              <Button danger icon={<DeleteOutlined />} onClick={clearLayout}>{t('清除布局')}</Button>
            )}
            {page?.status === 'PUBLISHED'
              ? <Button icon={<RollbackOutlined />} onClick={() => void unpublishPage()}>{t('转草稿')}</Button>
              : <Button icon={<SendOutlined />} loading={publishing} onClick={() => void publishPage()}>{t('发布')}</Button>}
          </Space>
        </header>

        <div className={`uve-body${leftOpen ? '' : ' is-left-collapsed'}${rightOpen ? '' : ' is-right-collapsed'}`}>
          <aside className={`uve-left${leftOpen ? '' : ' is-collapsed'}`} aria-hidden={!leftOpen}>
            {leftOpen && (
              <>
                <Input allowClear prefix={<SearchOutlined />} placeholder={t('搜索内容模型 / 插件')} value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} />
                <Tabs
                  size="small"
                  className="uve-left-tabs"
                  items={[
                    {
                      key: 'models', label: t('组件'),
                      children: <div className="uve-palette-grid">{filteredTypes.map((t) => <PaletteCard key={t.id} type={t} />)}{!filteredTypes.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无组件模型')} />}</div>,
                    },
                    {
                      key: 'contentlets', label: t('内容'),
                      children: <div className="uve-shared-list">{contentItems.map((item) => (
                        <ContentPaletteItem key={item.id} item={item} type={allTypes.find((type) => type.id === item.contentTypeId)} />
                      ))}{!contentItems.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无可投放内容')} />}</div>,
                    },
                    {
                      key: 'shared', label: t('共享'),
                      children: <div className="uve-shared-list">{filteredShared.map((item) => (
                        <button key={item.id} type="button" className="uve-shared-item" onClick={() => defaultZone && insertShared(item, defaultZone)}>
                          <FileTextOutlined /><span>{item.title}</span><Typography.Text type="secondary">{item.path}</Typography.Text>
                        </button>
                      ))}{!filteredShared.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无共享组件')} />}</div>,
                    },
                    {
                      key: 'plugins', label: t('插件'),
                      children: <div className="uve-shared-list">{filteredWidgets.map((w) => (
                        <div key={w.id} className="uve-shared-item uve-plugin-item"><AppstoreOutlined /><span>{w.name}</span><Tag>{w.status}</Tag></div>
                      ))}{!filteredWidgets.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无已发布插件/Widget；可在后续拖入投放区')} />}</div>,
                    },
                  ]}
                />
              </>
            )}
          </aside>

          <main className="uve-center">
            <div className="uve-center-toolbar">
              <div className="uve-center-toolbar-left">
                <Tooltip title={leftOpen ? t('收起组件栏') : t('展开组件栏')}>
                  <Button
                    size="small"
                    type="text"
                    icon={leftOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                    onClick={() => setLeftOpen((open) => !open)}
                    aria-label={leftOpen ? t('收起组件栏') : t('展开组件栏')}
                  />
                </Tooltip>
                {!visualMode && <Tag>{t('结构画布')}</Tag>}
              </div>
              <div className="uve-center-toolbar-mid">
                <Typography.Text type="secondary" className="uve-url">{page?.routePath || '/'}</Typography.Text>
                <Space size={4}>
                  <Tooltip title={t('桌面')}><Button type={device === 'desktop' ? 'link' : 'text'} icon={<DesktopOutlined />} onClick={() => setDevice('desktop')} /></Tooltip>
                  <Tooltip title={t('平板')}><Button type={device === 'tablet' ? 'link' : 'text'} icon={<TabletOutlined />} onClick={() => setDevice('tablet')} /></Tooltip>
                  <Tooltip title={t('手机')}><Button type={device === 'mobile' ? 'link' : 'text'} icon={<MobileOutlined />} onClick={() => setDevice('mobile')} /></Tooltip>
                </Space>
                <Select
                  size="small"
                  value={zoom}
                  style={{ width: 86 }}
                  options={[{ value: 0.75, label: '75%' }, { value: 1, label: '100%' }, { value: 1.25, label: '125%' }]}
                  onChange={setZoom}
                  disabled={!visualMode}
                />
              </div>
              <div className="uve-center-toolbar-right">
                <Tooltip title={rightOpen ? t('收起属性栏') : t('展开属性栏')}>
                  <Button
                    size="small"
                    type="text"
                    className="uve-right-collapse-btn"
                    icon={rightOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => setRightOpen((open) => !open)}
                    aria-label={rightOpen ? t('收起属性栏') : t('展开属性栏')}
                  />
                </Tooltip>
              </div>
            </div>

            <div className="uve-canvas-wrap">
              {visualMode ? (
                <UveCanvas
                  url={canvasUrl}
                  width={Math.min(deviceWidth(device), 1100)}
                  zoom={zoom}
                  bridge={bridge}
                  overlay={{
                    selectedId: selectedItem?.id,
                    selectedZoneKey,
                    inlineEditingId,
                    titleOf,
                    dragActive: !!drag,
                    allowedZoneKeys,
                    dropHint,
                    dragHandle: selectedItem && selection ? {
                      id: `canvas:${selectedItem.id}`,
                      data: {
                        source: 'canvas',
                        zoneKey: selection.zoneKey,
                        index: selection.index,
                        componentTypeId: selectedItem.componentTypeId,
                        kind: selectedItem.kind,
                        label: selectedItem.title || types.find((t) => t.id === selectedItem.componentTypeId)?.name || t('组件'),
                      },
                    } : undefined,
                    canMoveUp: !!selection && selection.index > 0,
                    canMoveDown: !!selection && selection.index < (zones[selection.zoneKey]?.length || 0) - 1,
                    onMove: moveSelected,
                    onEditJson: openJsonEditor,
                    onDelete: removeSelected,
                    zoneDragHandle: selectedZoneKey ? { id: `zone:${selectedZoneKey}`, data: { source: 'zone', zoneKey: selectedZoneKey } } : undefined,
                    zoneCanMoveUp: !!selectedZoneKey && layoutZoneKeys().indexOf(selectedZoneKey) > 0,
                    zoneCanMoveDown: !!selectedZoneKey && layoutZoneKeys().indexOf(selectedZoneKey) < layoutZoneKeys().length - 1,
                    onZoneMove: moveSelectedZone, onZoneEdit: editSelectedZone, onZoneDelete: hideSelectedZone,
                  }}
                />
              ) : (
              <div className="uve-device-frame" style={{ width: Math.min(deviceWidth(device), 1100) }}>
                {!template ? (
                  <Empty description={t('请选择可视化模板')} />
                ) : (
                  <div className="uve-structure">
                    {[...template.zones].sort((a, b) => a.sortOrder - b.sortOrder).map((zone) => (
                      <section key={zone.id} className="uve-zone">
                        <div className="uve-zone-head">
                          <Space>
                            <strong>{zone.zoneKey}</strong>
                            <Tag>{containers.find((c) => c.id === zone.containerId)?.name || t('容器')}</Tag>
                          </Space>
                          <Button type="primary" shape="circle" size="small" icon={<PlusOutlined />} onClick={() => {
                            const candidates = allowed(zone.zoneKey);
                            if (!candidates[0]) return message.warning(t('没有可添加的组件类型'));
                            const item: PageComponentSpec = { id: crypto.randomUUID(), kind: 'EMBEDDED', componentTypeId: candidates[0].id, title: candidates[0].name, data: {}, additionalModel: {}, order: (zones[zone.zoneKey] || []).length };
                            const list = [...(zones[zone.zoneKey] || []), item];
                            setZones({ ...zones, [zone.zoneKey]: list });
                            setSelection({ zoneKey: zone.zoneKey, index: list.length - 1 });
                            setRightTab('props');
                            setRightOpen(true);
                          }} />
                        </div>
                        <DropZone zoneKey={zone.zoneKey} disabled={drag?.source === 'palette' && !allowed(zone.zoneKey).some((t) => t.id === drag.typeId)}>
                          {(zones[zone.zoneKey] || []).map((item, index) => {
                            const active = selection?.zoneKey === zone.zoneKey && selection.index === index;
                            return (
                              <article key={item.id} className={`uve-contentlet${active ? ' is-selected' : ''}`} onClick={() => { setSelection({ zoneKey: zone.zoneKey, index }); setRightTab('props'); setRightOpen(true); }}>
                                <span className="uve-contentlet-badge">{item.kind === 'SHARED' ? 'Shared' : (types.find((t) => t.id === item.componentTypeId)?.name || 'Component')}</span>
                                <div className="uve-contentlet-body">
                                  <HolderOutlined className="uve-contentlet-handle" />
                                  <div>
                                    <div className="uve-contentlet-title">{item.title || t('未命名组件')}</div>
                                    <Typography.Text type="secondary">{item.kind === 'SHARED' ? shared.find((x) => x.id === item.sharedComponentId)?.path : types.find((t) => t.id === item.componentTypeId)?.code}</Typography.Text>
                                  </div>
                                </div>
                                {active && (
                                  <div className="uve-contentlet-tools">
                                    <Tooltip title={t('编辑属性')}><Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); setRightTab('props'); setRightOpen(true); }} /></Tooltip>
                                    <Tooltip title={t('高级 JSON')}><Button size="small" type="text" icon={<CodeOutlined />} onClick={(e) => {
                                      e.stopPropagation();
                                      const raw = window.prompt(t('字段 JSON'), JSON.stringify(item.data || {}, null, 2));
                                      if (raw == null) return;
                                      try {
                                        const data = JSON.parse(raw) as Record<string, unknown>;
                                        const list = [...(zones[zone.zoneKey] || [])];
                                        list[index] = { ...item, data };
                                        setZones({ ...zones, [zone.zoneKey]: list });
                                      } catch { message.error(t('JSON 无效')); }
                                    }} /></Tooltip>
                                    <Tooltip title={t('删除')}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); removeSelected(); }} /></Tooltip>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                          {!(zones[zone.zoneKey] || []).length && <div className="uve-zone-empty">{t('拖入左侧内容模型，或点击 + 添加')}</div>}
                        </DropZone>
                      </section>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          </main>

          <aside className={`uve-right${rightOpen ? '' : ' is-collapsed'}`}>
            <div className="uve-right-panel" aria-hidden={!rightOpen}>
              {rightOpen && (
                <>
                  {rightTab === 'props' && (
                    selectedItem ? (
                      <>
                        <div className="uve-right-header">
                          <Typography.Title level={5} style={{ margin: 0 }}>{t('属性')}</Typography.Title>
                          <Button type="link" size="small" onClick={() => navigate(`/content?type=${selectedItem.componentTypeId || ''}`)}>{t('在完整编辑器中打开')}</Button>
                        </div>
                        <Form form={propsForm} layout="vertical" onFinish={saveProps} className="uve-props-form">
                          <Form.Item name="title" label={t('标题')} rules={[{ required: true }]}><Input /></Form.Item>
                          <Form.Item name="templatePath" label={t('组件模板路径')}><Input placeholder="/components/banner.ftl" /></Form.Item>
                          {fieldsOf(selectedType).map((field) => (
                            <Form.Item key={field.code} name={field.code} label={field.name} extra={field.helpText} rules={[{ required: field.required }]} valuePropName={field.fieldType === 'BOOLEAN' ? 'checked' : 'value'}>
                              <FieldControl field={field} siteId={siteId} contentTypeId={selectedType?.id} />
                            </Form.Item>
                          ))}
                          {!fieldsOf(selectedType).length && <Alert type="info" showIcon message={t('该组件模型暂无字段定义，可使用工具栏中的高级 JSON 编辑数据。')} />}
                          <Space>
                            <Button onClick={() => setSelection(null)}>{t('取消')}</Button>
                            <Button type="primary" htmlType="submit">{t('应用')}</Button>
                          </Space>
                        </Form>
                      </>
                    ) : <Empty description={t('选中中间画布中的组件以编辑属性')} />
                  )}
                  {rightTab === 'page' && (
                    <Form form={pageForm} layout="vertical" onFinish={async (values) => {
                      if (!pageId) return;
                      await contentsApi.saveVersion(pageId, { title: values.title, routePath: values.routePath, templatePath: values.templatePath, fieldValues: '{}', note: t('可视化编辑器页面属性') });
                      await load();
                      message.success(t('页面属性已保存'));
                    }}>
                      <Typography.Title level={5}>{t('页面属性')}</Typography.Title>
                      <Form.Item name="title" label={t('标题')} rules={[{ required: true }]}><Input /></Form.Item>
                      <Form.Item name="routePath" label="URL" rules={[{ required: true }]}><Input /></Form.Item>
                      <Form.Item name="templatePath" label={t('显示模板')}><Input /></Form.Item>
                      <Button type="primary" htmlType="submit">{t('保存页面属性')}</Button>
                    </Form>
                  )}
                  {rightTab === 'layout' && (
                    <div>
                      <Typography.Title level={5}>{t('布局')}</Typography.Title>
                      <Form.Item label={t('可视化模板')}>
                        <Select value={templateId} options={templateOptions} onChange={onTemplateChange} style={{ width: '100%' }} />
                      </Form.Item>
                      <Alert type="info" showIcon message={t('切换模板时，仅保留同名投放区中的组件。')} />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="uve-right-rail">
              <Tooltip title={rightOpen && rightTab === 'props' ? t('收起属性栏') : t('组件属性')} placement="left">
                <Button type={rightOpen && rightTab === 'props' ? 'primary' : 'text'} icon={<EditOutlined />} onClick={() => openRightTab('props')} />
              </Tooltip>
              <Tooltip title={rightOpen && rightTab === 'page' ? t('收起属性栏') : t('页面属性')} placement="left">
                <Button type={rightOpen && rightTab === 'page' ? 'primary' : 'text'} icon={<FileTextOutlined />} onClick={() => { pageForm.setFieldsValue({ title: page?.title, routePath: page?.routePath, templatePath: page?.templatePath }); openRightTab('page'); }} />
              </Tooltip>
              <Tooltip title={rightOpen && rightTab === 'layout' ? t('收起属性栏') : t('布局模板')} placement="left">
                <Button type={rightOpen && rightTab === 'layout' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => openRightTab('layout')} />
              </Tooltip>
              <Tooltip title={t('设置')} placement="left"><Button type="text" icon={<SettingOutlined />} onClick={() => navigate(`/content?type=${page?.contentTypeId}&item=${pageId}`)} /></Tooltip>
            </div>
          </aside>
        </div>
      </div>
      <DragOverlay>{drag ? <div className="uve-drag-overlay">{drag.label}</div> : null}</DragOverlay>
      <Modal
        title={t('高级 JSON')}
        open={jsonDraft != null}
        onCancel={() => setJsonDraft(null)}
        onOk={() => void applyJson()}
        okText={t('应用')}
        cancelText={t('取消')}
        width={560}
      >
        <Input.TextArea rows={12} value={jsonDraft ?? ''} onChange={(e) => setJsonDraft(e.target.value)} style={{ fontFamily: 'monospace' }} />
      </Modal>
    </DndContext>
  );
}

export default function PageDesignerPage() {
  return <RequireSite><PageDesignerInner /></RequireSite>;
}
