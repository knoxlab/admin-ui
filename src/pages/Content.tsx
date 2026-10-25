import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  TreeSelect,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  EllipsisOutlined,
  HistoryOutlined,
  HolderOutlined,
  LayoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
  StopOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { categoriesApi, contentsApi, foldersApi, modelsApi, pageCompositionApi, previewApi, sitesApi, usersApi, workflowApi, type ContentBatchResult } from '../api';
import ContentPreviewImage from '../components/ContentPreviewImage';
import ViewModeDropdown, { useListViewMode } from '../components/ViewModeDropdown';
import { QUIET } from '../api/client';
import { openInNewTab } from '../openInNewTab';
import type { Category, ContentVersionDiff, ContentItem, ContentType, ContentVersion, FieldDef, MediaAsset, PageComposition, SiteFolder, SiteMember, User, Workflow, WorkflowActionInfo } from '../api/types';
import { formatDateTime } from '../utils/datetime';
import { versionFieldLabel, versionSnapshotRows, defaultDiffRange, diffRangeWithSource, diffRangeFromVersion, diffRangeWithPrevious, diffRangeWithCurrent, modelVersionChange, resolveRevertedFrom, sliceVersionPage, VERSION_PAGE_SIZE } from '../utils/contentVersion';
// FR-CV-VER-009：字段口径与时间机器共用同一实现（collectFields 从 ../utils/contentFields 引入，
// 并以 buildModelFormNodes 渲染树口径驱动编辑器布局，见下方 ModelFormRenderer 集成）
import { assigneeCandidates, contentActionAccess, pickDefaultSubmitAction, pickOwningWorkflow } from '../utils/contentWorkflow';
import ModelFormRenderer, { BINDING_CONTROL_KINDS } from '../components/ModelFormRenderer';
import {
  buildModelFormNodes,
  modelFormItems,
  repeatSpecsOf,
} from '../utils/modelFormLayout';
import { collectFields } from '../utils/contentFields';
import { applyMediaAutofill, type MediaFillContext } from '../utils/mediaAutofill';
// 客户端表单控制器（2026-10-25）：字段联动的脚本在模板工程里，改联动不用改本文件。
import { buildSandboxCatalog } from '../form/formController';
import { useFormController } from '../form/useFormController';
import type { SandboxCatalog } from '../utils/formSandbox';
import { RequireSite, useSite } from '../context/SiteContext';
import { hasCapability, useAuth } from '../auth/AuthContext';
import './Content.css';
import { t } from '../i18n/locale';

const CONTENT_SIDER_WIDTH_KEY = 'powercms.content.siderWidth';
const CONTENT_SIDER_COLLAPSED_KEY = 'powercms.content.siderCollapsed';
/** 「页面与模板」区块显示开关：2026-09-23 起暂不显示（输入隐藏，保存取值回退表单回填值）；恢复展示置为 true。 */
const SHOW_PAGE_BLOCK: boolean = false;
const CONTENT_SIDER_MIN = 200;
const CONTENT_SIDER_MAX = 560;
const CONTENT_SIDER_DEFAULT = 280;

function folderTreeData(folders: SiteFolder[]): { title: string; value: string; children?: any[] }[] {
  return folders.map((f) => ({
    title: f.title,
    value: f.id,
    children: f.children?.length ? folderTreeData(f.children) : undefined,
  }));
}

function readContentSiderWidth() {
  const raw = Number(localStorage.getItem(CONTENT_SIDER_WIDTH_KEY));
  if (!Number.isFinite(raw)) return CONTENT_SIDER_DEFAULT;
  return Math.min(CONTENT_SIDER_MAX, Math.max(CONTENT_SIDER_MIN, raw));
}

function readContentSiderCollapsed() {
  return localStorage.getItem(CONTENT_SIDER_COLLAPSED_KEY) === '1';
}

type EditorMode = 'create' | 'edit';

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

function catPath(cats: Category[], id: string): string {
  const map = new Map(flattenCats(cats).map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = map.get(id);
  while (cur) {
    parts.unshift(cur.pathAlias || cur.name);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return parts.length ? `/${parts.join('/')}` : '/';
}
function categoryNamePath(cats: Category[], id: string): string {
  const map = new Map(flattenCats(cats).map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = map.get(id);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return parts.join(' / ');
}
/**
 * 编辑器表单渲染树（需求 2026-09-21）：分区/页签/行列结构统一由
 * `utils/modelFormLayout.buildModelFormNodes` 从模型布局还原 —— 页签下的字段渲染在其
 * 页签页面内，行列与列宽完全参照模型设计器；无布局模型按 groupName 分组兜底。
 * 字段口径（校验/保存/版本快照）仍走 `collectFields`，与时间机器保持一致（FR-CV-VER-009）。
 */
function buildEditorNodes(type?: ContentType | null) {
  return buildModelFormNodes(type);
}

/** Convert dayjs in nested field values for save. */
function normalizeFieldValue(field: FieldDef, val: unknown): unknown {
  if (field.fieldType === 'BOOLEAN') return val === true || val === 'true';
  if (field.fieldType === 'DATE_TIME' && val && dayjs.isDayjs(val)) {
    return val.toISOString();
  }
  return val;
}

function hydrateDateFields(field: FieldDef, val: unknown): unknown {
  if (field.fieldType === 'BOOLEAN') return val === true || val === 'true';
  if (field.fieldType === 'DATE_TIME' && val) {
    return dayjs(String(val));
  }
  return val;
}

/**
 * 提取后端统一错误体的 `message`（如恢复版本时的 400「版本含当前模型未定义的字段」），
 * 取不到时回退到调用方给的兜底文案，避免出现静默失败或 `undefined` 提示。
 */
function errorMessage(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return detail || fallback;
}

/** FR-CV-VER-008 摘要：按变更类型统计条数（新增 / 修改 / 删除）。 */
function diffCount(diff: ContentVersionDiff, changeType: 'ADDED' | 'MODIFIED' | 'REMOVED'): number {
  return diff.changes.filter((c) => c.changeType === changeType).length;
}

function statusColor(status: string) {
  switch (status) {
    case 'PUBLISHED':
      return 'success';
    case 'IN_REVIEW':
      return 'processing';
    case 'SCHEDULED':
      return 'cyan';
    case 'WITHDRAWN':
    case 'ARCHIVED':
      return 'default';
    default:
      return 'warning';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'PUBLISHED':
      return { icon: <CheckCircleOutlined />, color: '#52c41a' };
    case 'APPROVED':
      return { icon: <CheckOutlined />, color: '#13c2c2' };
    case 'IN_REVIEW':
      return { icon: <ClockCircleOutlined />, color: '#1677ff' };
    case 'SCHEDULED':
      return { icon: <ClockCircleOutlined />, color: '#13c2c2' };
    case 'WITHDRAWN':
      return { icon: <StopOutlined />, color: '#8c8c8c' };
    case 'ARCHIVED':
      return { icon: <InboxOutlined />, color: '#8c8c8c' };
    case 'DRAFT':
    default:
      return { icon: <EditOutlined />, color: '#faad14' };
  }
}

function ContentStatusIcon({ status }: { status: string }) {
  const { icon, color } = statusIcon(status);
  return (
    <Tooltip title={status}>
      <span className="content-status-icon" style={{ color }} aria-label={status}>
        {icon}
      </span>
    </Tooltip>
  );
}

function ContentInner() {
  const { siteId } = useSite();
  const { me } = useAuth();
  /**
   * DEF-UI-01：行内操作按站点能力裁剪，与后端 @PreAuthorize 同源。
   * 无 write 的角色看不到编辑/新建/提交审核，无 review 的角色看不到发布/设为草稿；
   * 版本历史与「权限」面板走 read，保持可见（服务端仍做最终校验）。
   */
  const canWrite = hasCapability(me, siteId, 'write');
  const canReview = hasCapability(me, siteId, 'review');
  const access = useMemo(() => contentActionAccess(canWrite, canReview), [canWrite, canReview]);
  const writeDeniedReason = t('当前角色在该站点没有编辑权限');
  const reviewDeniedReason = t('当前角色在该站点没有审核权限');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shortcutTypeId = searchParams.get('type');
  const shortcutItemId = searchParams.get('item');
  const openedShortcutItemRef = useRef<string>();
  const [cats, setCats] = useState<Category[]>([]);
  const [folders, setFolders] = useState<SiteFolder[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>();
  const [loadingList, setLoadingList] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  /** 列表显示方式：缩略图 / 列表 / 表格，下拉切换并记忆（默认表格，保持既有交互）。 */
  const [viewMode, setViewMode] = useListViewMode('powercms.content.viewMode');
  // EDIT-006：批量 AI 处理多选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [editorType, setEditorType] = useState<ContentType | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [editorForm] = Form.useForm();
  /** 模型属性折叠面板（内容类型选择器所在）：默认收起，校验失败或点击提示时展开。 */
  const [metaKeys, setMetaKeys] = useState<string[]>([]);
  /** 页面与模板折叠面板：默认展开，校验失败时定位展开。 */
  const [pageKeys, setPageKeys] = useState<string[]>(['page']);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  /** 版本历史当前操作的内容条目（查看/对比/恢复都以它为目标，避免与编辑中的内容串台）。 */
  const [historyTarget, setHistoryTarget] = useState<ContentItem | null>(null);
  /** FR-CV-VER-001/003：只读查看某历史版本快照。 */
  const [viewVersion, setViewVersion] = useState<ContentVersion | null>(null);
  /**
   * 规范 §15.1：版本历史弹窗左侧时间线的选中行（右侧详情面板与 5 种版本操作都作用于它）。
   *
   * <p>打开弹窗时默认选中最新版本，而不是留空——空白详情会让用户以为「没有版本」或
   * 必须自己先点一下才能看到任何信息。</p>
   */
  const [historySelected, setHistorySelected] = useState<ContentVersion | null>(null);
  /** FR-CV-VER-006：时间线已展开的行数（「加载更多」每次 + {@link VERSION_PAGE_SIZE}）。 */
  const [historyShown, setHistoryShown] = useState(VERSION_PAGE_SIZE);
  /** 规范 §15.1 右侧「字段变更」：选中版本与其前一版本的字段级 diff。 */
  const [selectedDiff, setSelectedDiff] = useState<ContentVersionDiff | null>(null);
  const [selectedDiffLoading, setSelectedDiffLoading] = useState(false);
  /** 连点时间线时的竞态防护：只接受最后一次请求的结果。 */
  const diffRequestRef = useRef(0);
  /** FR-CV-VER-008：版本对比（选择 from/to 后按需拉取 diff）。 */
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<ContentVersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  /** 规范 §15.4：对比区间两端的内容模型版本不一致时的提示（否则模型改版产生的字段增删会被误读成内容变更）。 */
  const modelChange = modelVersionChange(versions, diffFrom, diffTo);
  /** FR-CV-VER-006：版本时间线当前页（已展开行数由「加载更多」按 {@link VERSION_PAGE_SIZE} 递增）。 */
  const timePage = sliceVersionPage(versions, historyShown);
  /** FR-CV-VER-004：恢复历史版本。 */
  const [revertTarget, setRevertTarget] = useState<ContentVersion | null>(null);
  const [revertNote, setRevertNote] = useState('');
  const [revertLoading, setRevertLoading] = useState(false);
  // DEF-WF-01：内容列表发起工作流（提交审核 / 提交发布），受理人与工作流从站点配置载入。
  const [submitTarget, setSubmitTarget] = useState<ContentItem | null>(null);
  const [submitActions, setSubmitActions] = useState<WorkflowActionInfo[]>([]);
  const [submitWorkflows, setSubmitWorkflows] = useState<Workflow[]>([]);
  /** 受理人候选：站点成员 + 用户目录（两项均需更高权限，取不到时退化为自由输入）。 */
  const [submitAssignees, setSubmitAssignees] = useState<{ value: string; label: string }[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSaving, setSubmitSaving] = useState(false);
  const [submitForm] = Form.useForm();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [seasons, setSeasons] = useState<ContentItem[]>([]);
  const [batchForm] = Form.useForm();
  const [siderWidth, setSiderWidth] = useState(readContentSiderWidth);
  const [siderCollapsed, setSiderCollapsed] = useState(readContentSiderCollapsed);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(CONTENT_SIDER_DEFAULT);

  const loadCats = useCallback(async () => {
    if (!siteId) return;
    const [list, typeList, folderList] = await Promise.all([categoriesApi.tree(siteId), modelsApi.list(siteId), foldersApi.tree(siteId)]);
    setCats(list);
    // MEDIA 仅在媒体库展示，系统预置类型（用户/会员资料）仅在用户与权限展示
    setTypes(typeList.filter((t) => (t.status === 'PUBLISHED' || t.status === 'DRAFT')
      && t.objectType !== 'MEDIA' && !t.isSystem));
    setFolders(folderList);
  }, [siteId]);

  const runSearch = useCallback(async (overrides?: {
    contentTypeId?: string | null;
    categoryIds?: string[];
    status?: string;
    keyword?: string;
  }) => {
    if (!siteId) return;
    setLoadingList(true);
    try {
      const contentTypeId = overrides?.contentTypeId !== undefined ? overrides.contentTypeId : selectedType;
      const categoryIds = overrides?.categoryIds !== undefined ? overrides.categoryIds : selectedCats;
      const status = overrides?.status !== undefined ? overrides.status : statusFilter;
      const query = overrides?.keyword !== undefined ? overrides.keyword : keyword;
      setItems(await contentsApi.search(siteId, {
        contentTypeId: contentTypeId || undefined,
        categoryIds: categoryIds.length ? categoryIds : undefined,
        status: status || undefined,
        keyword: query.trim() || undefined,
      }));
      setHasSearched(true);
    } catch {
      // DEF-11-08：加载失败必须显式反馈，避免静默显示「找到 0 条内容」空态与未处理的 Promise 拒绝
      setItems([]);
      setHasSearched(true);
      message.error(t('加载内容失败'));
    } finally {
      setLoadingList(false);
    }
  }, [siteId, selectedType, selectedCats, statusFilter, keyword]);

  const reloadList = useCallback(async () => {
    if (hasSearched) await runSearch();
  }, [hasSearched, runSearch]);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  useEffect(() => {
    setSelectedType(shortcutTypeId);
    if (shortcutTypeId) {
      void runSearch({ contentTypeId: shortcutTypeId });
      return;
    }
    setSelectedCats([]);
    setStatusFilter(undefined);
    setKeyword('');
    void runSearch({ contentTypeId: null, categoryIds: [], status: '', keyword: '' });
  }, [shortcutTypeId, siteId]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(
        CONTENT_SIDER_MAX,
        Math.max(CONTENT_SIDER_MIN, startWidthRef.current + (e.clientX - startXRef.current)),
      );
      setSiderWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.classList.remove('content-resizing');
      setSiderWidth((w) => {
        localStorage.setItem(CONTENT_SIDER_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('content-resizing');
    };
  }, []);

  const startResize = (e: ReactMouseEvent) => {
    if (siderCollapsed) return;
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = siderWidth;
    document.body.classList.add('content-resizing');
  };

  const toggleSiderCollapsed = () => {
    setSiderCollapsed((v) => {
      const next = !v;
      localStorage.setItem(CONTENT_SIDER_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const publishWithChecklist = useCallback(async (row: ContentItem) => {
    // DEF-UI-01：`/contents/{id}/status` 需要站点 review 能力，菜单已禁用，这里兜住旁路。
    if (!access.publish) {
      message.warning(reviewDeniedReason);
      return;
    }
    const type = typeMap.get(row.contentTypeId);
    const isPage = (row.objectType || type?.objectType || type?.templateType) === 'PAGE';
    if (!isPage) {
      await contentsApi.setStatus(row.id, 'PUBLISHED');
      message.success(t('已发布'));
      await reloadList();
      return;
    }
    const checklist = await contentsApi.publishChecklist(row.id);
    const errors = checklist.items.filter((i) => i.level === 'ERROR');
    const warns = checklist.items.filter((i) => i.level === 'WARN');
    const passes = checklist.items.filter((i) => i.level === 'PASS');
    Modal.confirm({
      title: `发布检查：${row.title}`,
      width: 560,
      okText: checklist.pass ? t('确认发布') : t('关闭'),
      okButtonProps: { danger: !checklist.pass, disabled: !checklist.pass },
      cancelText: checklist.pass ? t('取消') : undefined,
      content: (
        <div>
          {!checklist.pass && <Typography.Paragraph type="danger">{t('存在阻断项，请先修复后再发布。')}</Typography.Paragraph>}
          <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
            {errors.map((i) => (
              <li key={`e-${i.code}`}><Typography.Text type="danger">{t('[阻断]')} {i.message}</Typography.Text></li>
            ))}
            {warns.map((i) => (
              <li key={`w-${i.code}`}><Typography.Text type="warning">{t('[警告]')} {i.message}</Typography.Text></li>
            ))}
            {passes.map((i) => (
              <li key={`p-${i.code}`}><Typography.Text type="secondary">{t('[通过]')} {i.message}</Typography.Text></li>
            ))}
          </ul>
        </div>
      ),
      onOk: async () => {
        if (!checklist.pass) return;
        await contentsApi.setStatus(row.id, 'PUBLISHED');
        message.success(t('已发布'));
        await reloadList();
      },
    });
  }, [reloadList, typeMap, access, reviewDeniedReason]);

  /**
   * DEF-WF-01：打开「提交审核」对话框。可用转换来自后端 `available-actions`（与工作流定义同源），
   * 因此入口只在当前状态确有出边时可提交，且不会出现 UI 与定义漂移。
   * 处于终态（无出边）时直接提示而不弹窗，避免出现「确定键永远灰着」的死胡同对话框。
   */
  const openSubmitReview = useCallback(async (row: ContentItem) => {
    if (!siteId) return;
    // DEF-UI-01：`/contents/{id}/submit` 需要站点 write 能力，菜单已禁用，这里兜住旁路。
    if (!access.submitReview) {
      message.warning(writeDeniedReason);
      return;
    }
    setSubmitLoading(true);
    submitForm.resetFields();
    try {
      const actions = await workflowApi.availableActions(row.id, QUIET).catch(() => [] as WorkflowActionInfo[]);
      if (actions.length === 0) {
        message.info(t('当前状态没有可用的工作流转换'));
        return;
      }
      // 受理人/工作流候选是「尽力而为」的辅助数据：低权限角色取不到时退化为自由输入，
      // 不应因此弹全局「没有权限」（可见转换本身已由后端授权把关）。
      const [workflows, users, members] = await Promise.all([
        workflowApi.list(siteId, QUIET).catch(() => [] as Workflow[]),
        usersApi.list(QUIET).catch(() => [] as User[]),
        sitesApi.members(siteId, QUIET).catch(() => [] as SiteMember[]),
      ]);
      const action = pickDefaultSubmitAction(actions);
      setSubmitActions(actions);
      setSubmitWorkflows(workflows.filter((w) => w.status === 'PUBLISHED'));
      setSubmitAssignees(assigneeCandidates(members, users));
      submitForm.setFieldsValue({
        targetStatus: action?.targetStatus,
        workflowId: pickOwningWorkflow(workflows, action)?.id,
      });
      setSubmitTarget(row);
    } finally {
      setSubmitLoading(false);
    }
  }, [siteId, submitForm, access, writeDeniedReason]);

  const submitForReview = useCallback(async () => {
    if (!submitTarget) return;
    const values = await submitForm.validateFields();
    setSubmitSaving(true);
    try {
      await workflowApi.submit(submitTarget.id, values.workflowId, values.targetStatus, values.assignee);
      message.success(t('已提交，等待审核'));
      setSubmitTarget(null);
      await reloadList();
    } finally {
      setSubmitSaving(false);
    }
  }, [submitTarget, submitForm, reloadList]);

  /** 批量结果汇总提示：成功计数 + 首个失败原因（不逐条弹窗刷屏）。 */
  const reportBatchResult = useCallback((result: ContentBatchResult, action: string) => {
    if (result.failed.length === 0) {
      message.success(`${action}：${t('成功 {n} 条', { n: result.succeeded.length })}`);
    } else {
      message.warning(
        `${action}：${t('成功 {ok} 条，失败 {fail} 条', { ok: result.succeeded.length, fail: result.failed.length })}`
          + `（${result.failed[0].message}）`,
      );
    }
  }, []);

  /**
   * 批量状态流转（提交审核/发布/设为草稿/归档共用）：一次请求，后端逐条独立成败。
   * 提交审核走批量状态而非工作流 submit——批量场景不指定受理人，
   * 由 updateStatus 的 IN_REVIEW 分支补建系统工作流待办（口径与单条一致）。
   */
  const runBatchStatus = useCallback(async (status: string, label: string) => {
    if (!siteId || selectedRowKeys.length === 0) return;
    const result = await contentsApi.batchStatus(siteId, selectedRowKeys.map(String), status);
    reportBatchResult(result, label);
    await reloadList();
  }, [siteId, selectedRowKeys, reloadList, reportBatchResult]);

  /** 批量/单条删除：未归档条目由后端拒绝并返回原因，其余照删。 */
  const runBatchDelete = useCallback(async (ids: string[]) => {
    if (!siteId || ids.length === 0) return;
    const result = await contentsApi.batchDelete(siteId, ids);
    reportBatchResult(result, t('删除'));
    // 已删除条目移出勾选，避免残留在批量条上
    setSelectedRowKeys((prev) => prev.filter((k) => !result.succeeded.includes(String(k))));
    await reloadList();
  }, [siteId, reloadList, reportBatchResult]);

  /** 删除确认（单条与批量共用）：删除不可恢复，必须显式确认。 */
  const confirmDeleteRows = useCallback((ids: string[], single: boolean) => {
    Modal.confirm({
      title: single ? t('删除内容') : t('批量删除 {n} 条内容', { n: ids.length }),
      content: t('删除后不可恢复：版本历史、关系、统计等关联数据将一并删除；未归档条目会失败并列出原因。'),
      okText: t('删除'),
      okButtonProps: { danger: true },
      cancelText: t('取消'),
      onOk: () => runBatchDelete(ids),
    });
  }, [runBatchDelete]);

  const fields = useMemo(() => collectFields(editorType || undefined), [editorType]);
  /** 表单渲染树（分区/页签/行列）——布局由模型设计器驱动（需求 2026-09-21）。 */
  const formNodes = useMemo(() => buildEditorNodes(editorType), [editorType]);
  const repeatSpecs = useMemo(() => repeatSpecsOf(formNodes), [formNodes]);

  /**
   * 客户端表单控制器（需求 2026-10-25）：模型只配一个脚本路径（`ContentType.formController`），
   * 表单初始化 / 媒体选择 / 字段变更 / 保存前四个事件交给模板工程里的脚本处理 ——
   * 以后新建模型、调整字段联动都只改脚本，不改后端与 admin-ui 源码。
   */
  const controllerCatalog = useMemo(
    () => buildSandboxCatalog(fields, repeatSpecs),
    [fields, repeatSpecs],
  );
  const controllerCatalogRef = useRef<SandboxCatalog>(controllerCatalog);
  controllerCatalogRef.current = controllerCatalog;
  /**
   * 切换编辑中的模型：**同步**把控制器字段目录换成新模型的。
   *
   * <p>`onInit` 在 `setEditorType(full)` 的同一个 tick 内就跑（新建/编辑两条路径都是先回填
   * 再跑脚本），此时还没重新渲染 —— 只靠渲染期同步 ref，脚本拿到的是上一个模型（关闭编辑器后
   * 是空目录）的字段目录：于是 `hide('xxx')` 报「控制器：未知字段：xxx」，`setValue` 也被静默丢弃。</p>
   */
  const applyEditorType = useCallback((type: ContentType | null) => {
    setEditorType(type);
    controllerCatalogRef.current = buildSandboxCatalog(
      collectFields(type || undefined),
      repeatSpecsOf(buildEditorNodes(type)),
    );
  }, []);
  /** 控制器隐藏的字段码（条件显示，FR-CM-FORMCTRL-003）：脚本每次事件返回整集，这里整体替换。 */
  const [hiddenFields, setHiddenFields] = useState<ReadonlySet<string>>(() => new Set<string>());
  const { run: runFormController, busy: formControllerBusy } = useFormController({
    siteId,
    form: editorForm,
    getCatalog: () => controllerCatalogRef.current,
    onNotice: (text) => message.info(text),
    onWarn: (text) => message.warning(text),
    onApplied: () => setDirty(true),
    onVisibility: (hidden) => {
      setHiddenFields((prev) => {
        // 同一批字段码不重建 Set：避免每次事件都触发整棵树重渲染
        if (prev.size === hidden.length && hidden.every((code) => prev.has(code))) return prev;
        return new Set(hidden);
      });
    },
  });

  /** 字段联动（onFieldChange）：防抖 400ms；脚本执行期间不再触发，避免「脚本写值→再跑脚本」自激。 */
  const fieldChangeTimer = useRef<number | undefined>(undefined);
  const scheduleFieldChange = useCallback(
    (changed: Record<string, unknown>) => {
      const codes = Object.keys(changed || {});
      if (!codes.length || !editorType?.formController) return;
      if (fieldChangeTimer.current) window.clearTimeout(fieldChangeTimer.current);
      fieldChangeTimer.current = window.setTimeout(() => {
        if (formControllerBusy()) return;
        void runFormController(editorType, 'onFieldChange', { field: codes[0], changed });
      }, 400);
    },
    [editorType, formControllerBusy, runFormController],
  );

  /**
   * 媒体选择自动填写（需求 2026-10-23）：在「关联媒体」行内（或顶层 MEDIA_REF）
   * 从媒体库选中媒体后，把行内兄弟字段与表单级空白字段（标题/资源编码/资源类型/摘要/正文/
   * MIME/文件大小/预览图/AI 标签/所属部门/资源组等）一次补齐 —— 只补空白，不覆盖已输入值。
   *
   * <p>2026-10-25：模型配了 `formController` 且脚本声明 `onMediaSelect` 时，由脚本接管
   * （想填什么字段完全由模型自己的脚本决定）；脚本会写 `ctx` 补丁，平台侧的
   * `applyMediaAutofill` 只在没有脚本接管时兜底，两者不会互相覆盖。</p>
   */
  const handleMediaSelect = useCallback(
    (assets: MediaAsset[], ctx: MediaFillContext) => {
      const asset = assets[0];
      if (!asset) return;
      void (async () => {
        const scripted = await runFormController(editorType, 'onMediaSelect', {
          assets: assets.map((a) => ({ ...a })),
          fieldCode: ctx.fieldCode,
          repeat: ctx.repeatCode,
          rowIndex: ctx.rowIndex,
        });
        if (scripted.hooked) {
          if (scripted.applied) setDirty(true);
          return;
        }
        const filled = applyMediaAutofill(editorForm, asset, ctx, { fields });
        if (!filled.length) return;
        setDirty(true);
        message.success(t('已根据所选媒体自动填写 {n} 个空白字段', { n: filled.length }));
      })();
    },
    [editorForm, editorType, fields, runFormController],
  );

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (typeMap.get(i.contentTypeId)?.code || '').toLowerCase().includes(q)
      );
    });
  }, [items, keyword, typeMap, statusFilter]);

  const closeEditor = () => {
    const doClose = () => {
      setEditorOpen(false);
      setEditing(null);
      setEditorType(null);
      setDirty(false);
      setNote('');
      editorForm.resetFields();
    };
    if (dirty) {
      Modal.confirm({
        title: t('有未保存的修改'),
        content: t('确定关闭编辑器？未保存的内容将丢失。'),
        okText: t('关闭'),
        cancelText: t('继续编辑'),
        onOk: doClose,
      });
      return;
    }
    doClose();
  };

  const openCreateContent = () => {
    if (!selectedType) {
      message.warning(t('请先在「模型」页签选择内容模型'));
      return;
    }
    const selected = types.find((t) => t.id === selectedType);
    if ((selected?.objectType || selected?.templateType) === 'COMPONENT') {
      message.warning(t('COMPONENT 只能通过页面编辑器或组件引用字段创建'));
      return;
    }
    setEditorMode('create');
    setEditing(null);
    setEditorType(null);
    setDirty(false);
    setNote('');
    setMetaKeys([]);
    setPageKeys(['page']);
    editorForm.resetFields();
    const initial: Record<string, unknown> = {};
    if (selectedCats.length === 1) initial.categoryId = selectedCats[0];
    if (selectedType) {
      initial.contentTypeId = selectedType;
    }
    editorForm.setFieldsValue(initial);
    setEditorOpen(true);
    if (selectedType) {
      void loadTypeIntoEditor(selectedType);
    }
  };

  const loadTypeIntoEditor = async (contentTypeId: string) => {
    if (!siteId) return;
    setEditorLoading(true);
    // 换模型：上一个模型的可见性结果必须清空（随后 onInit 会给出新脚本的结果）
    setHiddenFields(new Set());
    try {
      const full = await modelsApi.get(siteId, contentTypeId);
      applyEditorType(full);
      const nodes = buildEditorNodes(full);
      const initial: Record<string, unknown> = { contentTypeId };
      if (full.objectType === 'PAGE') {
        initial.templatePath = full.displayTemplate;
        if (full.destinationPattern) initial.routePath = full.destinationPattern;
      }
      for (const item of modelFormItems(nodes)) {
        if (item.kind === 'field' && item.field.defaultValue != null && item.field.defaultValue !== '') {
          initial[item.field.code] = item.field.fieldType === 'BOOLEAN'
            ? item.field.defaultValue === 'true'
            : item.field.defaultValue;
        }
        if (item.kind === 'repeat') {
          const min = Math.max(item.minItems, 0);
          initial[item.code] = Array.from({ length: Math.max(min, 1) }, () => ({}));
        }
      }
      editorForm.setFieldsValue(initial);
      // 新建态：字段默认值已回填后再跑控制器初始化（脚本可在此按模型规则补齐/校验）
      void runFormController(full, 'onInit');
    } finally {
      setEditorLoading(false);
    }
  };

  /** 页面属性绑定（2026-09-22）：打开编辑器时的页面组成（可视化模板绑定回填与变更判定）。 */
  const editorCompositionRef = useRef<PageComposition | null>(null);

  /** 可视化模板值映射页面组成绑定（变化时应用；prev 为打开编辑器时的绑定，新建态传 null）。 */
  const applyVisualBinding = async (contentId: string, value: unknown, prev: PageComposition | null) => {
    const next = value ? String(value) : undefined;
    const prevId = prev?.templateId || undefined;
    if (next === prevId) return;
    if (next) await pageCompositionApi.save(siteId!, contentId, next, prev?.zones || {}, prev?.version ?? 0);
    else if (prev) await pageCompositionApi.unbind(siteId!, contentId, prev.version);
  };

  /**
   * 拉取内容详情 + 最新版本 + 模型定义并回填编辑器表单；返回刷新后的内容（含最新版本号）。
   * 供「打开编辑器」与「AI 建议采纳后同步」共用（DEF-11-14）。
   */
  const fillEditorFromServer = async (row: ContentItem) => {
    // 打开/切换内容：先清空可见性结果，避免上一份内容隐藏的字段带到这一份
    setHiddenFields(new Set());
    const [item, vers, full, composition] = await Promise.all([
      contentsApi.get(row.id),
      contentsApi.versions(row.id),
      modelsApi.get(siteId!, row.contentTypeId),
      // 页面属性绑定（可视化模板）：值在页面组成绑定中（非 PAGE 条目后端回 400 → null）。
      // 这是**预期内**的降级（模型可能不是 PAGE），用 QUIET 关掉全局 toast，
      // 否则从内容检索列表打开任意非 PAGE 内容都会弹「只有 PAGE 类型可以作为页面渲染」。
      pageCompositionApi.get(siteId!, row.id, QUIET).catch(() => null),
    ]);
    editorCompositionRef.current = composition;
    setEditing(item);
    applyEditorType(full);
    const latest = vers[0];
    let parsed: Record<string, unknown> = {};
    if (latest?.fieldValues) {
      try {
        parsed = JSON.parse(latest.fieldValues) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }
    const nodes = buildEditorNodes(full);
    const specs = repeatSpecsOf(nodes);
    const flatFields: FieldDef[] = [];
    for (const it of modelFormItems(nodes)) {
      if (it.kind === 'field') flatFields.push(it.field);
    }
    for (const f of flatFields) {
      if (parsed[f.code] !== undefined) {
        parsed[f.code] = hydrateDateFields(f, parsed[f.code]);
      }
    }
    for (const [rg, spec] of specs) {
      const rows = parsed[rg];
      if (Array.isArray(rows)) {
        parsed[rg] = rows.map((row) => {
          const obj = (row && typeof row === 'object' ? { ...(row as object) } : {}) as Record<string, unknown>;
          for (const child of spec.children) {
            if (obj[child.code] !== undefined) {
              obj[child.code] = hydrateDateFields(child, obj[child.code]);
            }
          }
          return obj;
        });
      }
    }
    // migrate legacy flat Class → class_rg[]
    if (!parsed.class_rg && (parsed.program_class || parsed.class_number)) {
      parsed.class_rg = [
        {
          program_class: parsed.program_class,
          class_number: parsed.class_number,
        },
      ];
      delete parsed.program_class;
      delete parsed.class_number;
    }
    for (const [rg, spec] of specs) {
      if (!parsed[rg]) {
        const n = Math.max(spec.minItems, 1);
        parsed[rg] = Array.from({ length: n }, () => ({}));
      }
    }
    editorForm.setFieldsValue({
      title: item.title,
      title_s: parsed.title_s ?? item.title,
      contentTypeId: item.contentTypeId,
      categoryId: item.categoryId,
      // 回填两键均设（内置输入与布局绑定字段谁渲染谁生效）：页面属性绑定值取条目级实体列/页面组成
      folderId: item.folderId,
      folder_id_s: item.folderId,
      routePath: item.routePath,
      route_path_s: item.routePath,
      templatePath: item.templatePath,
      template_path_s: item.templatePath,
      visualTemplateId: composition?.templateId,
      visual_template_s: composition?.templateId,
      ...parsed,
    });
    // 编辑态：内容值回填完成后再跑控制器初始化（脚本可按当前值做联动补齐，见 FR-CM-FORMCTRL）
    void runFormController(full, 'onInit');
    return item;
  };

  const openEditContent = async (row: ContentItem) => {
    // DEF-UI-01：入口按钮已按能力禁用，这里兜住深链（?item=）等旁路。
    if (!access.edit) {
      message.warning(writeDeniedReason);
      return;
    }
    setEditorMode('edit');
    setEditing(row);
    setDirty(false);
    setNote('');
    setMetaKeys([]);
    setPageKeys(['page']);
    setEditorOpen(true);
    setEditorLoading(true);
    try {
      await fillEditorFromServer(row);
    } catch {
      message.error(t('加载内容失败'));
      setEditorOpen(false);
    } finally {
      setEditorLoading(false);
    }
  };

  useEffect(() => {
    const shortcutKey = siteId && shortcutItemId ? `${siteId}:${shortcutItemId}` : undefined;
    if (!siteId || !shortcutItemId || openedShortcutItemRef.current === shortcutKey) return;
    openedShortcutItemRef.current = shortcutKey;
    void contentsApi.get(shortcutItemId).then((item) => {
      if (item.siteId !== siteId) {
        message.error(t('该内容不属于当前站点'));
        return;
      }
      return openEditContent(item);
    }).catch(() => {
      openedShortcutItemRef.current = undefined;
      message.error(t('无法定位指定内容'));
    });
  }, [siteId, shortcutItemId]);
  const buildFieldValues = (all: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.fieldType === 'RELATIONSHIP') continue;
      let val = all[f.code];
      if (f.fieldType === 'REPEAT_GROUP') {
        const kids = repeatSpecs.get(f.code)?.children || [];
        const rows = Array.isArray(val) ? val : [];
        out[f.code] = rows.map((row) => {
          const obj = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
          const next: Record<string, unknown> = {};
          for (const child of kids) {
            if (obj[child.code] !== undefined) {
              next[child.code] = normalizeFieldValue(child, obj[child.code]);
            }
          }
          return next;
        });
        continue;
      }
      // 页面属性绑定控件值入条目级实体列（folderId/routePath/templatePath/可视化绑定），不入 fieldValues
      if (f.isSystem && f.systemFieldType && BINDING_CONTROL_KINDS.has(f.systemFieldType)) continue;
      if (val !== undefined) out[f.code] = normalizeFieldValue(f, val);
    }
    return JSON.stringify(out);
  };

  const saveContent = async (andClose: boolean) => {
    // 校验失败不再放行未捕获的 rejection：按出错字段定位到对应折叠面板（内容类型选择器已移入模型属性）。
    let validated: Record<string, unknown> | null = await editorForm
      .validateFields()
      .catch((err: { errorFields?: { name?: string | (string | number)[] }[] }) => {
        const names = (err.errorFields ?? []).flatMap((f) =>
          Array.isArray(f.name) ? f.name.map(String) : f.name ? [String(f.name)] : [],
        );
        if (names.includes('contentTypeId')) {
          setMetaKeys(['meta']);
          message.error(t('请选择内容模型'));
        }
        if (names.some((n) => ['routePath', 'templatePath', 'folderId'].includes(n))) setPageKeys(['page']);
        return null;
      });
    if (!validated) return;
    // 客户端表单控制器 · 保存前钩子（FR-CM-FORMCTRL-004）：脚本可 setValue 补值，也可 ctx.fail() 阻断保存。
    const guard = await runFormController(editorType, 'onSave', null);
    if (guard.blocking) {
      message.error(guard.errors[0] || t('表单校验未通过'));
      return;
    }
    if (guard.applied) {
      // 脚本补的值可能影响必填/格式校验：重新校验取最新值，避免用旧快照提交
      const again = await editorForm.validateFields().catch(() => null);
      if (!again) return;
      validated = again as Record<string, unknown>;
      setDirty(true);
    }
    // 「页面与模板」区块隐藏后其输入不再挂载，validateFields 只含已挂载字段：
    // 先铺表单 store（setFieldsValue 回填的 routePath/templatePath/folderId 等原值），再叠已校验值，
    // 保证提交内容与区块显示时完全一致——尤其编辑态自定义模板不会因不传而被服务端回退成类型默认。
    const all = { ...editorForm.getFieldsValue(true), ...validated };
    // 2026-09-22：布局驱动优先 —— 模型布局含 title_s/页面属性绑定时内置输入退场（按实际渲染的输入取值）
    const has = (code: string) => fields.some((f) => f.code === code);
    const pick = (code: string, builtin: string) => all[has(code) ? code : builtin];
    const title = String(pick('title_s', 'title') ?? '').trim();
    if (!title) {
      message.error(t('请填写标题'));
      return;
    }
    const fieldValues = buildFieldValues(all);
    const categoryId = all.categoryId ? String(all.categoryId) : selectedCats.length === 1 ? selectedCats[0] : undefined;
    // 页面属性绑定：值映射条目级实体列（folder_id/route_path/template_path）
    const folderId = pick('folder_id_s', 'folderId');
    const routePath = pick('route_path_s', 'routePath');
    const templatePath = pick('template_path_s', 'templatePath');
    const visualTemplateId = pick('visual_template_s', 'visualTemplateId');
    setEditorLoading(true);
    try {
      if (editorMode === 'create') {
        const created = await contentsApi.create(siteId!, {
          title,
          categoryId,
          folderId: folderId ? String(folderId) : undefined,
          contentTypeId: all.contentTypeId,
          routePath: routePath ? String(routePath) : undefined,
          templatePath: templatePath ? String(templatePath) : undefined,
          fieldValues,
        });
        await applyVisualBinding(created.id, visualTemplateId, null);
        message.success(t('内容已创建'));
        setDirty(false);
        if (andClose) {
          setEditorOpen(false);
          setEditing(null);
          setEditorType(null);
        } else {
          await openEditContent(created);
        }
        await reloadList();
      } else if (editing) {
        await contentsApi.saveVersion(editing.id, {
          fieldValues,
          note: note || t('编辑保存'),
          title,
          routePath: routePath ? String(routePath) : undefined,
          templatePath: templatePath ? String(templatePath) : undefined,
          folderId: folderId ? String(folderId) : undefined,
        });
        await applyVisualBinding(editing.id, visualTemplateId, editorCompositionRef.current);
        message.success(t('版本已保存'));
        setDirty(false);
        const refreshed = await contentsApi.get(editing.id);
        setEditing(refreshed);
        if (andClose) {
          setEditorOpen(false);
          setEditing(null);
          setEditorType(null);
        }
        await reloadList();
      }
    } finally {
      setEditorLoading(false);
    }
  };

  const openHistory = async (row: ContentItem) => {
    setHistoryTarget(row);
    const rows = await contentsApi.versions(row.id);
    setVersions(rows);
    // 规范 §15.1：默认选中最新版本，右侧详情与操作组立即有内容可看
    setHistoryShown(VERSION_PAGE_SIZE);
    setHistoryOpen(true);
    if (rows.length > 0) {
      // 不假设接口排序：取版本号最大的一行作为默认选中项
      const newest = rows.reduce((max, v) => (v.version > max.version ? v : max), rows[0]);
      void selectHistoryVersion(newest, rows, row.id);
    } else {
      setHistorySelected(null);
      setSelectedDiff(null);
    }
  };

  /**
   * 规范 §15.1：选中时间线某一行并加载右侧「字段变更」。
   *
   * <p>`rows` / `itemId` 只在「刚拉完列表、state 尚未提交」的首次调用里显式传入；其余
   * 场景（点击时间线）沿用当前 `versions` 与 `historyTarget`。连点不同行时用递增 token
   * 丢弃过期响应，避免慢响应覆盖新选中项。</p>
   */
  const selectHistoryVersion = async (
    record: ContentVersion,
    rows: ContentVersion[] = versions,
    itemId: string | undefined = historyTarget?.id,
  ) => {
    setHistorySelected(record);
    if (!itemId) {
      setSelectedDiff(null);
      return;
    }
    const range = diffRangeWithPrevious(record, rows);
    const token = ++diffRequestRef.current;
    setSelectedDiffLoading(true);
    setSelectedDiff(null);
    try {
      const result = await contentsApi.versionDiff(itemId, range.from, range.to);
      if (diffRequestRef.current === token) setSelectedDiff(result);
    } catch {
      if (diffRequestRef.current === token) setSelectedDiff(null);
    } finally {
      if (diffRequestRef.current === token) setSelectedDiffLoading(false);
    }
  };

  /** FR-CV-VER-007「与指定版本对比」：以选中行为起点打开对比弹窗，目标版本在弹窗内的选择器改选。 */
  const openDiffWithPicker = (record: ContentVersion) => {
    const range = diffRangeFromVersion(record, versions) ?? diffRangeWithPrevious(record, versions);
    setDiffFrom(range.from);
    setDiffTo(range.to);
    setDiffResult(null);
    setDiffOpen(true);
    void runDiff(range.from, range.to);
  };

  /** FR-CV-VER-007「与前一版本对比」：区间即「前一版本（或空版本）→ 本行」。 */
  const compareWithPrevious = (record: ContentVersion) => {
    const range = diffRangeWithPrevious(record, versions);
    setDiffFrom(range.from);
    setDiffTo(range.to);
    setDiffResult(null);
    setDiffOpen(true);
    void runDiff(range.from, range.to);
  };

  /** FR-CV-VER-007「与当前版本对比」：区间方向固定为「较旧 → 较新」。 */
  const compareWithCurrent = (record: ContentVersion) => {
    if (!historyTarget) return;
    const range = diffRangeWithCurrent(record, historyTarget.currentVersion);
    if (!range) return;
    setDiffFrom(range.from);
    setDiffTo(range.to);
    setDiffResult(null);
    setDiffOpen(true);
    void runDiff(range.from, range.to);
  };

  const runDiff = async (from: number | null, to: number | null) => {
    if (!historyTarget || from == null || to == null) {
      setDiffResult(null);
      return;
    }
    setDiffLoading(true);
    try {
      setDiffResult(await contentsApi.versionDiff(historyTarget.id, from, to));
    } catch {
      setDiffResult(null);
      message.error(t('版本对比失败'));
    } finally {
      setDiffLoading(false);
    }
  };

  /** FR-CV-VER-008：默认「上一版本 → 最新版本」；最新版本由恢复产生时改为「来源版本 → 新版本」（OBS-11-10）。 */
  const openDiff = (rows: ContentVersion[]) => {
    const range = defaultDiffRange(rows);
    if (!range) {
      message.info(t('至少需要两个版本才能对比'));
      return;
    }
    setDiffFrom(range.from);
    setDiffTo(range.to);
    setDiffResult(null);
    setDiffOpen(true);
    // 直接按选定的两个版本发起对比，避免弹窗打开后表格空白、必须再动一次下拉
    void runDiff(range.from, range.to);
  };

  /** OBS-11-10：版本行内「与来源版本对比」——直接以该行与其来源版本为区间打开对比弹窗。 */
  const openDiffWithSource = (record: ContentVersion) => {
    const range = diffRangeWithSource(record, versions);
    if (!range) {
      message.info(t('该版本未记录来源版本，无法按来源对比'));
      return;
    }
    setDiffFrom(range.from);
    setDiffTo(range.to);
    setDiffResult(null);
    setDiffOpen(true);
    void runDiff(range.from, range.to);
  };

  /**
   * FR-CV-VER-004：恢复历史版本。
   *
   * <p>后端是「恢复创建新版本」语义——不会删掉 v{n} 之后的历史，而是把快照内容写成新版本。
   * 二次确认里明确说明这一点，避免用户误以为会回滚掉后续版本。</p>
   */
  const revertTo = async (target: ContentVersion) => {
    if (!historyTarget) return;
    setRevertLoading(true);
    try {
      const restored = await contentsApi.revertVersion(historyTarget.id, target.version,
        revertNote.trim() || undefined);
      message.success(t('已恢复 v{version}，生成新版本 v{latest}', {
        version: target.version,
        latest: restored.version,
      }));
      setRevertTarget(null);
      setRevertNote('');
      setHistoryOpen(false);
      setViewVersion(null);
      await reloadList();
      // 恢复后必须把新版本回填编辑器，否则编辑器停留在恢复前的旧值，继续保存会静默覆盖
      const fresh = await fillEditorFromServer(historyTarget);
      setDirty(false);
      message.info(t('已加载最新版本 v{version}', { version: fresh.currentVersion }));
    } catch (e) {
      message.error(errorMessage(e, t('恢复版本失败')));
    } finally {
      setRevertLoading(false);
    }
  };

  const selectedTypeObj = selectedType ? types.find((t) => t.id === selectedType) : undefined;
  /**
   * 版本历史所属内容的模型定义。
   *
   * <p>历史弹窗由列表行打开，可能与编辑器里正在编辑的模型不同；若直接用 `editorType` 会把字段标签
   * 解析到错误的模型上，故按 `historyTarget.contentTypeId` 反查。</p>
   */
  const historyType = useMemo(
    () => types.find((ty) => ty.id === historyTarget?.contentTypeId),
    [types, historyTarget],
  );
  /** OBS-11-10：「查看版本」弹窗中被查看版本的来源版本号（非恢复版本或引用悬空时为 null）。 */
  const viewVersionSource = useMemo(
    () => (viewVersion ? resolveRevertedFrom(viewVersion, versions) : null),
    [viewVersion, versions],
  );
  const categoryTreeData = useMemo(() => {
    type CategoryTreeNode = { value: string; title: string; children?: CategoryTreeNode[] };
    const build = (nodes: Category[]): CategoryTreeNode[] =>
      nodes.map((category) => ({
        value: category.id,
        title: category.name,
        children: category.children?.length ? build(category.children) : undefined,
      }));
    return build(cats);
  }, [cats]);
  const listEmpty = hasSearched ? t('没有符合条件的内容') : t('请设置左侧条件并检索');
  const selectedObjectType = selectedTypeObj?.objectType || selectedTypeObj?.templateType;
  const canCreate = Boolean(selectedType) && selectedObjectType !== 'COMPONENT' && selectedObjectType !== 'PAGE';
  const createTooltip = canCreate
    ? t('新建内容')
    : selectedObjectType === 'PAGE'
      ? t('请前往「内容 > 页面管理」创建页面')
      : selectedObjectType === 'COMPONENT'
        ? t('COMPONENT 只能通过页面编辑器创建')
        : t('请先在检索条件中选择模型');

  /** 勾选可用性与表格 rowSelection 一致：批量状态操作需 review/审核相应能力。 */
  const selectable = Boolean(access.submitReview || access.publish);
  const isRowSelected = (id: React.Key) => selectedRowKeys.includes(id);
  const toggleRowSelected = (id: React.Key, checked: boolean) => {
    setSelectedRowKeys((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((key) => key !== id);
    });
  };

  /** 行内操作：表格、缩略图与列表视图共用同一组按钮/菜单，避免三种视图行为分叉。 */
  const renderRowActions = (row: ContentItem) => {
    const isPage =
      (row.objectType || typeMap.get(row.contentTypeId)?.objectType || typeMap.get(row.contentTypeId)?.templateType) === 'PAGE';
    return (
      <Space size={2} className="content-table-actions">
        <Tooltip title={access.edit ? t('编辑') : writeDeniedReason}>
          <span>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={t('编辑')}
              disabled={!access.edit}
              onClick={() => void openEditContent(row)}
            />
          </span>
        </Tooltip>
        <Tooltip title={t('历史')}>
          <Button
            type="text"
            size="small"
            icon={<HistoryOutlined />}
            aria-label={t('历史')}
            onClick={() => void openHistory(row)}
          />
        </Tooltip>
        {isPage && (
          <Tooltip title={access.pageCanvas ? t('页面画布') : writeDeniedReason}>
            <span>
              <Button
                type="text"
                size="small"
                icon={<LayoutOutlined />}
                aria-label={t('页面画布')}
                disabled={!access.pageCanvas}
                onClick={() => navigate(`/pages/editor?pageId=${encodeURIComponent(row.id)}`)}
              />
            </span>
          </Tooltip>
        )}
        <Dropdown
          menu={{
            items: [
              {
                key: 'preview',
                label: t('预览'),
                disabled: !isPage || !row.routePath,
                // 回归缺陷 ④：预览新标签页需在用户手势内同步开窗，token 异步填充
                onClick: () => {
                  if (!siteId || !row.routePath) return;
                  openInNewTab(
                    async () => {
                      const token = await previewApi.token(siteId);
                      return previewApi.pageUrl(token.token, row.routePath!);
                    },
                    () => message.error(t('预览被浏览器拦截，请允许弹出窗口后重试')),
                    () => message.error(t('预览打开失败')),
                  );
                },
              },
              {
                key: 'submit-review',
                label: t('提交审核'),
                disabled: !access.submitReview,
                onClick: () => void openSubmitReview(row),
              },
              {
                key: 'publish',
                label: t('发布'),
                disabled: !access.publish,
                onClick: () => publishWithChecklist(row),
              },
              {
                key: 'draft',
                label: t('设为草稿'),
                disabled: !access.setDraft,
                onClick: async () => {
                  await contentsApi.setStatus(row.id, 'DRAFT');
                  message.success(t('已设为草稿'));
                  await reloadList();
                },
              },
              {
                key: 'archive',
                label: t('归档'),
                disabled: !access.archive || row.status === 'ARCHIVED',
                onClick: async () => {
                  await contentsApi.setStatus(row.id, 'ARCHIVED');
                  message.success(t('已归档'));
                  await reloadList();
                },
              },
              {
                key: 'delete',
                label: t('删除'),
                danger: true,
                // 仅已归档内容可删除（服务端同样校验），未归档时置灰而非点了才报错
                disabled: !access.remove || row.status !== 'ARCHIVED',
                onClick: () => confirmDeleteRows([row.id], true),
              },
            ],
          }}
        >
          <Button
            type="text"
            size="small"
            icon={<EllipsisOutlined />}
            aria-label={t('更多操作')}
            title={t('更多')}
          />
        </Dropdown>
      </Space>
    );
  };
  return (
    <div className="content-page">
      <div
        className={`content-browse${siderCollapsed ? ' is-sider-collapsed' : ''}`}
        style={{
          gridTemplateColumns: siderCollapsed ? '48px 1fr' : `${siderWidth}px 12px 1fr`,
        }}
      >
        <aside className="content-browse-sider content-search-sider">
          <div className="content-sider-collapsed" hidden={!siderCollapsed}>
            <Tooltip title={t('展开检索')} placement="right">
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                aria-label={t('展开检索')}
                onClick={toggleSiderCollapsed}
              />
            </Tooltip>
            <Tooltip title={t('检索')} placement="right">
              <Button
                type="text"
                icon={<SearchOutlined />}
                aria-label={t('检索')}
                className="is-active"
                onClick={() => {
                  setSiderCollapsed(false);
                  localStorage.setItem(CONTENT_SIDER_COLLAPSED_KEY, '0');
                }}
              />
            </Tooltip>
          </div>
          <div className="content-sider-body" hidden={siderCollapsed}>
            <div className="content-search-header">
              <Typography.Title level={4}>{t('检索')}</Typography.Title>
              <Tooltip title={t('收起检索')}>
                <Button
                  type="text"
                  size="small"
                  icon={<MenuFoldOutlined />}
                  aria-label={t('收起检索')}
                  onClick={toggleSiderCollapsed}
                />
              </Tooltip>
            </div>
            <div className="content-search-form">
              <div className="content-search-field">
                <Typography.Text>{t('关键词')}</Typography.Text>
                <Input
                  allowClear
                  value={keyword}
                  placeholder={t('标题关键词')}
                  onChange={(e) => setKeyword(e.target.value)}
                  onPressEnter={() => void runSearch()}
                />
              </div>
              <div className="content-search-field">
                <Typography.Text>{t('模型')}</Typography.Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={selectedType || undefined}
                  placeholder={t('全部模型')}
                  onChange={(value) => setSelectedType(value || null)}
                  options={types.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
                />
              </div>
              <div className="content-search-field">
                <Typography.Text>{t('分类')}</Typography.Text>
                <TreeSelect
                  treeCheckable
                  treeDefaultExpandAll={false}
                  showSearch
                  allowClear
                  // `maxTagCount="responsive"` 在窄栏（检索栏 166px）下会渲染成无意义的 `+ 0 ...`
                  // （Ant 在 responsive 下始终渲染 rest 节点用于测宽，omitted 为空即 `+ 0 ...`），
                  // 实测选中 2 个根分类时甚至会把「新闻」用 CSS 隐藏、只留空 rest 节点，用户无法从字段确认条件（OBS-11-02）。
                  // 改为固定最多展示 1 个标签 + `+N`（placeholder 在 omitted 为空时不渲染文本），
                  // 保证任何宽度下都能读到至少一个已选分类；代价是宽栏下也只展示 1 个标签名，其余以计数提示。
                  maxTagCount={1}
                  maxTagPlaceholder={(omitted) => (omitted.length > 0 ? `+${omitted.length} …` : null)}
                  value={selectedCats}
                  placeholder={t('全部分类')}
                  treeData={categoryTreeData}
                  treeNodeFilterProp="title"
                  showCheckedStrategy={TreeSelect.SHOW_PARENT}
                  onChange={(values: string[]) => setSelectedCats(values)}
                  style={{ width: '100%' }}
                />
                <Typography.Text type="secondary" className="content-search-hint">
                  
                  {t('同一根分类取并集，不同根分类取交集')}
                </Typography.Text>
              </div>
              <div className="content-search-field">
                <Typography.Text>{t('状态')}</Typography.Text>
                <Select
                  allowClear
                  value={statusFilter}
                  placeholder={t('全部状态')}
                  onChange={setStatusFilter}
                  options={['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED'].map((value) => ({ value, label: value }))}
                />
              </div>
              <Button type="primary" icon={<SearchOutlined />} onClick={() => void runSearch()}>
                
                {t('检索')}
              </Button>
              <Button
                type="link"
                onClick={() => {
                  setKeyword('');
                  setSelectedType(null);
                  setSelectedCats([]);
                  setStatusFilter(undefined);
                  setItems([]);
                  setHasSearched(false);
                }}
              >
                
                {t('清除')}
              </Button>
            </div>
          </div>
        </aside>
        {!siderCollapsed && (
          <div
            className="content-browse-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('调整导航宽度')}
            onMouseDown={startResize}
          >
            <span className="content-browse-resizer-grip" aria-hidden>
              <HolderOutlined />
            </span>
          </div>
        )}

        <main className="content-browse-main">
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
            <Space wrap>
              <Typography.Text strong>{t('检索结果')}</Typography.Text>
              {selectedTypeObj && <Tag color="blue">{selectedTypeObj.name}</Tag>}
              {selectedCats.map((id) => <Tag key={id}>{categoryNamePath(cats, id)}</Tag>)}
              {statusFilter && <Tag>{statusFilter}</Tag>}
            </Space>
            <Space wrap>
              <ViewModeDropdown value={viewMode} onChange={setViewMode} />
              {selectedTypeObj?.code === 'video_episode' && (
                <Tooltip title={access.create ? undefined : writeDeniedReason}>
                  <span>
                    <Button
                      disabled={!access.create}
                      onClick={async () => {
                        const seasonType = types.find((t) => t.code === 'video_season');
                        if (siteId && seasonType) setSeasons(await contentsApi.listByType(siteId, seasonType.id));
                        batchForm.setFieldsValue({ startNumber: 1, count: 10, titlePrefix: t('第') });
                        setBatchOpen(true);
                      }}
                    >
                      
                      {t('批量创建分集')}
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Tooltip title={access.create ? createTooltip : writeDeniedReason}>
                <span>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!access.create || (!canCreate && selectedObjectType !== 'PAGE')}
                    aria-label={selectedObjectType === 'PAGE' ? t('前往页面创建') : t('新建内容')}
                    onClick={() => selectedObjectType === 'PAGE' ? navigate('/pages') : openCreateContent()}
                  />
                </span>
              </Tooltip>
            </Space>
          </Space>
          <div className="content-browse-table">
            {selectedRowKeys.length > 0 ? (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 8 }}
                message={
                  <Space wrap>
                    <span>{t('已选中 {n} 条内容', { n: selectedRowKeys.length })}</span>
                    <Button
                      size="small"
                      disabled={!access.submitReview}
                      onClick={() => void runBatchStatus('IN_REVIEW', t('提交审核'))}
                    >
                      {t('提交审核')}
                    </Button>
                    <Button
                      size="small"
                      disabled={!access.publish}
                      onClick={() =>
                        Modal.confirm({
                          title: t('批量发布 {n} 条内容', { n: selectedRowKeys.length }),
                          content: t('发布检查未通过的条目会失败并列出原因，其余条目正常发布。'),
                          okText: t('发布'),
                          onOk: () => void runBatchStatus('PUBLISHED', t('发布')),
                        })
                      }
                    >
                      {t('发布')}
                    </Button>
                    <Button
                      size="small"
                      disabled={!access.setDraft}
                      onClick={() => void runBatchStatus('DRAFT', t('设为草稿'))}
                    >
                      {t('设为草稿')}
                    </Button>
                    <Button
                      size="small"
                      disabled={!access.archive}
                      onClick={() => void runBatchStatus('ARCHIVED', t('归档'))}
                    >
                      {t('归档')}
                    </Button>
                    <Button
                      size="small"
                      danger
                      disabled={!access.remove}
                      onClick={() => confirmDeleteRows(selectedRowKeys.map(String), false)}
                    >
                      {t('删除')}
                    </Button>
                    <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
                      {t('清空选择')}
                    </Button>
                  </Space>
                }
              />
            ) : null}
            {viewMode === 'table' ? (
            <Table
            rowKey="id"
            loading={loadingList}
            dataSource={filteredItems}
            pagination={{ pageSize: 20 }}
            locale={{ emptyText: listEmpty }}
            scroll={{ x: 1188 }}
            tableLayout="fixed"
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
              preserveSelectedRowKeys: true,
              // DEF-UI-01：勾选用于批量状态操作（提交审核需 write，发布/归档/删除需 review）；
              // 两者皆无的角色不能勾选。
              getCheckboxProps: () => ({ disabled: !(access.submitReview || access.publish) }),
            }}
            columns={[
              {
                title: t('标题'),
                dataIndex: 'title',
                width: 260,
                ellipsis: true,
                // DEF-UI-01：标题即编辑入口，无 write 能力时退化为纯文本（历史仍可只读查看）
                render: (t: string, row: ContentItem) =>
                  access.edit ? (
                    <Button type="link" style={{ padding: 0 }} onClick={() => void openEditContent(row)}>
                      {t}
                    </Button>
                  ) : (
                    <span>{t}</span>
                  ),
              },
              {
                title: t('状态'),
                dataIndex: 'status',
                width: 52,
                align: 'center',
                className: 'content-status-col',
                render: (s: string) => <ContentStatusIcon status={s} />,
              },
              {
                title: t('AI'),
                dataIndex: 'aiGenerated',
                width: 48,
                align: 'center',
                render: (v: boolean | undefined, row: ContentItem) =>
                  v ? <Tooltip title={`${t('AI 参与')}${row.aiModel ? ` · ${row.aiModel}` : ''}`}><Tag color="purple" style={{ marginInlineEnd: 0 }}>AI</Tag></Tooltip> : null,
              },
              {
                title: t('模型'),
                dataIndex: 'contentTypeId',
                width: 220,
                ellipsis: true,
                className: 'content-model-col',
                render: (id: string) => {
                  const t = typeMap.get(id);
                  if (!t) return id.slice(0, 8);
                  const objectType = t.objectType || t.templateType;
                  return (
                    <Tooltip title={`${t.code} · ${objectType}`}>
                      <Space size={4} className="content-model-tags">
                        <Tag color="blue" className="content-model-tag">{t.code}</Tag>
                        <Tag className="content-model-tag">{objectType}</Tag>
                      </Space>
                    </Tooltip>
                  );
                },
              },
              {
                title: t('版本'),
                dataIndex: 'currentVersion',
                width: 72,
                align: 'center',
                className: 'content-version-col',
                render: (v: number) => `v${v}`,
              },
              {
                title: t('作者'),
                dataIndex: 'createdBy',
                width: 100,
                // OBS-11-04：AI 批量建稿产物的 created_by 是用户 ID，展示后端解析出的用户名
                render: (v: string | undefined, record: ContentItem) => record.createdByName || v || '—',
              },
              {
                title: t('创建时间'),
                dataIndex: 'createdAt',
                width: 170,
                render: (v: string) => formatDateTime(v),
              },
              {
                title: <div style={{ textAlign: 'center' }}>{t('操作')}</div>,
                key: 'actions',
                fixed: 'right',
                width: 132,
                className: 'content-table-actions-col',
                render: (_: unknown, row: ContentItem) => renderRowActions(row),
              },
            ]}
            />
            ) : viewMode === 'thumbnail' ? (
              filteredItems.length === 0 ? (
                <Empty description={listEmpty} />
              ) : (
                <div className="content-thumb-grid">
                  {filteredItems.map((row) => (
                    <Card
                      key={row.id}
                      hoverable
                      size="small"
                      className={`content-thumb-card${isRowSelected(row.id) ? ' is-selected' : ''}`}
                      onDoubleClick={() => {
                        if (access.edit) void openEditContent(row);
                      }}
                      cover={
                        <div className="content-thumb-cover">
                          <ContentPreviewImage
                            siteId={siteId ?? undefined}
                            value={row.previewImage}
                            alt={row.title}
                            height={150}
                          />
                          {selectable && (
                            <Checkbox
                              className="content-thumb-select"
                              checked={isRowSelected(row.id)}
                              onChange={(event) => toggleRowSelected(row.id, event.target.checked)}
                              aria-label={t('选择')}
                            />
                          )}
                        </div>
                      }
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Typography.Text strong ellipsis={{ tooltip: row.title }} style={{ display: 'block' }}>
                            {row.title}
                          </Typography.Text>
                          <Space size={4} wrap style={{ marginTop: 6 }}>
                            <Tag color={statusColor(row.status)}>{row.status}</Tag>
                            {typeMap.get(row.contentTypeId) && (
                              <Tag color="blue">{typeMap.get(row.contentTypeId)!.code}</Tag>
                            )}
                            <Tag>v{row.currentVersion}</Tag>
                            {row.aiGenerated && <Tag color="purple">AI</Tag>}
                          </Space>
                          <Typography.Text
                            type="secondary"
                            ellipsis
                            style={{ display: 'block', marginTop: 6, fontSize: 12 }}
                          >
                            {row.createdByName || row.createdBy || '—'} · {formatDateTime(row.createdAt)}
                          </Typography.Text>
                        </div>
                        {renderRowActions(row)}
                      </div>
                    </Card>
                  ))}
                </div>
              )
            ) : (
              <List
                className="content-list-view"
                bordered
                dataSource={filteredItems}
                locale={{ emptyText: listEmpty }}
                renderItem={(row) => (
                  <List.Item
                    actions={[renderRowActions(row)]}
                    onDoubleClick={() => {
                      if (access.edit) void openEditContent(row);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
                      {selectable && (
                        <Checkbox
                          checked={isRowSelected(row.id)}
                          onChange={(event) => toggleRowSelected(row.id, event.target.checked)}
                          aria-label={t('选择')}
                          style={{ marginTop: 20 }}
                        />
                      )}
                      <ContentPreviewImage
                        siteId={siteId ?? undefined}
                        value={row.previewImage}
                        alt={row.title}
                        width={64}
                        height={64}
                        style={{ borderRadius: 6, flex: '0 0 auto' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space wrap size={6}>
                          {access.edit ? (
                            <Button type="link" style={{ padding: 0 }} onClick={() => void openEditContent(row)}>
                              {row.title}
                            </Button>
                          ) : (
                            <Typography.Text strong>{row.title}</Typography.Text>
                          )}
                          <ContentStatusIcon status={row.status} />
                          {row.aiGenerated && <Tag color="purple">AI</Tag>}
                        </Space>
                        <div style={{ marginTop: 4 }}>
                          <Space wrap size={12}>
                            <Tag color={statusColor(row.status)}>{row.status}</Tag>
                            {typeMap.get(row.contentTypeId) && (
                              <Tag color="blue">{typeMap.get(row.contentTypeId)!.code}</Tag>
                            )}
                            <Typography.Text type="secondary">v{row.currentVersion}</Typography.Text>
                            <Typography.Text type="secondary">
                              {row.createdByName || row.createdBy || '—'}
                            </Typography.Text>
                            <Typography.Text type="secondary">{formatDateTime(row.createdAt)}</Typography.Text>
                          </Space>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>
          <div className="content-status-bar">
            {hasSearched ? `找到 ${filteredItems.length} 条内容` : t('尚未执行检索')}
          </div>
        </main>
      </div>

      <Modal
        className="content-editor-modal"
        wrapClassName="content-editor-modal-wrap"
        title={
          <div className="content-editor-header">
            <Space wrap>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={closeEditor} />
              <Typography.Title level={5} style={{ margin: 0 }}>
                {editorMode === 'create' ? t('新建内容') : editing?.title || t('编辑内容')}
              </Typography.Title>
              {editing && <Tag>v{editing.currentVersion}</Tag>}
              {editing && <Tag color={statusColor(editing.status)}>{editing.status}</Tag>}
              {dirty && <Tag color="orange">{t('未保存 *')}</Tag>}
              {editorType && <Tag color="blue">{editorType.code}</Tag>}
              {editing?.categoryId && <Tag>CATEGORY {catPath(cats, editing.categoryId)}</Tag>}
            </Space>
            <Space wrap>
              <Input
                className="content-editor-note"
                placeholder={t('变更备注')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={editorLoading}
                onClick={() => void saveContent(false)}
              >
                
                {t('保存草稿')}
              </Button>
              <Button icon={<CheckOutlined />} loading={editorLoading} onClick={() => void saveContent(true)}>
                
                {t('保存并关闭')}
              </Button>
              <Button danger icon={<CloseOutlined />} onClick={closeEditor}>
                
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        open={editorOpen}
        closable={false}
        onCancel={closeEditor}
        footer={null}
        width="100vw"
        style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
        styles={{ body: { paddingTop: 8 } }}
        destroyOnClose
        keyboard={false}
        maskClosable={false}
        centered={false}
        confirmLoading={editorLoading}
      >
        <Form
          form={editorForm}
          layout="vertical"
          onValuesChange={(changed) => {
            setDirty(true);
            scheduleFieldChange(changed as Record<string, unknown>);
          }}
          disabled={editorLoading}
        >
          <Collapse
            size="small"
            style={{ marginBottom: 12 }}
            activeKey={metaKeys}
            onChange={(keys) => setMetaKeys(keys as string[])}
            items={[
              {
                key: 'meta',
                label: t('模型属性'),
                // 内容类型选择器已并入本面板：forceRender 保证收起时字段仍注册，校验与取值不丢失
                forceRender: true,
                children: (
                  <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
                    <Descriptions.Item label={t('内容类型')}>
                      <Form.Item
                        name="contentTypeId"
                        style={{ margin: 0, minWidth: 220 }}
                        rules={[{ required: true, message: t('请选择内容模型') }]}
                      >
                        <Select
                          disabled={editorMode === 'edit'}
                          showSearch
                          optionFilterProp="label"
                          options={types.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
                          onChange={(id) => void loadTypeIntoEditor(id)}
                          placeholder={t('选择模型后加载字段')}
                        />
                      </Form.Item>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('分类')}>
                      {selectedCats.length === 1 ? catPath(cats, selectedCats[0]) : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('模型版本')}>
                      {editorType ? `v${editorType.version}` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('当前版本')}>
                      {editing ? `v${editing.currentVersion}` : t('新建')}
                    </Descriptions.Item>
                    {/* OBS-11-04：AI 批量建稿产物的 created_by 是用户 ID，展示后端解析出的用户名 */}
                    <Descriptions.Item label={t('创建者')}>
                      {editing?.createdByName || editing?.createdBy || '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('创建时间')}>
                      {formatDateTime(editing?.createdAt)}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
            ]}
          />

          <Row gutter={16}>
            {/* 2026-09-22：模型布局含 title_s 时内置「标题」退场，避免重复输入项 */}
            {!fields.some((f) => f.code === 'title_s') && (
              <Col xs={24} md={12}>
                <Form.Item name="title" label={t('标题')} rules={[{ required: true, message: t('请输入标题') }]}>
                  <Input placeholder={t('内容标题')} />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* 「页面与模板」区块暂不显示（2026-09-23）：路由/模板/栏目输入随区块隐藏，保存取值回退表单回填值；恢复展示将 SHOW_PAGE_BLOCK 置为 true */}
          {SHOW_PAGE_BLOCK && editorType && (editorType.objectType || editorType.templateType) === 'PAGE' && (
            <Collapse
              activeKey={pageKeys}
              onChange={(keys) => setPageKeys(keys as string[])}
              style={{ marginBottom: 12 }}
              items={[
                {
                  key: 'page',
                  label: t('页面与模板'),
                  children: (
                    <Row gutter={16}>
                      {/* 内置页面属性退场（2026-09-22）：模型布局含对应绑定字段时由 ModelFormRenderer 按布局位置渲染 */}
                      {!fields.some((f) => f.code === 'folder_id_s') && (
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="folderId"
                            label={t('所属栏目')}
                            extra={t('选择栏目后路径自动推导，也可手动覆盖')}
                          >
                            <TreeSelect
                              allowClear
                              placeholder={t('选择栏目（可选）')}
                              treeData={folderTreeData(folders)}
                              showSearch
                              treeLine
                              treeNodeFilterProp="title"
                            />
                          </Form.Item>
                        </Col>
                      )}
                      {!fields.some((f) => f.code === 'route_path_s') && (
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="routePath"
                            label={t('页面路径')}
                            extra={t('站点内唯一，例如 /news/article-1；选择栏目后可自动生成')}
                            rules={[
                              { required: true, message: t('请输入页面路径') },
                              { pattern: /^\/[a-zA-Z0-9/_-]*$/, message: t('路径必须以 / 开头，仅包含字母、数字、/、_、-') },
                            ]}
                          >
                            <Input placeholder="/news/article-1" />
                          </Form.Item>
                        </Col>
                      )}
                      {!fields.some((f) => f.code === 'template_path_s') && (
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="templatePath"
                            label={t('页面模板')}
                            extra={t('默认使用内容模型绑定的 Display Template')}
                            rules={[{ required: true, message: t('请选择或填写页面模板') }]}
                          >
                            <Input placeholder="/templates/article.ftl" />
                          </Form.Item>
                        </Col>
                      )}
                      {/* CATEGORY 分类不再在对话框内展示（2026-09-23）：分类改由左侧筛选/分类字段维护，
                          创建时仍按左侧单选筛选回填，编辑保存本就不提交 categoryId，数据不受影响。 */}
                    </Row>
                  ),
                },
              ]}
            />
          )}
          {editorType && formNodes.length > 0 && (
            <ModelFormRenderer
              type={editorType}
              siteId={siteId!}
              contentId={editing?.id}
              onMediaSelect={handleMediaSelect}
              hiddenFields={hiddenFields}
              renderSectionTitle={(title, key) => {
                // 分区必填进度 Tag（历史行为保留：统计该分区内必填项的填写进度）
                const sec = formNodes.find((n) => n.key === key);
                const items = sec ? modelFormItems([sec]) : [];
                const requiredFields = items
                  .flatMap((it) =>
                    it.kind === 'field' && it.field.required
                      ? [it.field]
                      : it.kind === 'repeat'
                        ? it.children.filter((c) => c.required)
                        : [],
                  )
                  // 控制器隐藏的必填项不参与进度统计（不渲染、也不校验）
                  .filter((f) => !hiddenFields.has(f.code));
                if (!requiredFields.length) return title;
                const filled = requiredFields.filter((f) => {
                  const rg = items.find(
                    (it): it is Extract<(typeof items)[number], { kind: 'repeat' }> =>
                      it.kind === 'repeat' && it.children.some((c) => c.code === f.code),
                  );
                  if (rg) {
                    const rows = editorForm.getFieldValue(rg.code) as Record<string, unknown>[] | undefined;
                    return Boolean(rows?.some((r) => r?.[f.code] !== undefined && r?.[f.code] !== null && r?.[f.code] !== ''));
                  }
                  const v = editorForm.getFieldValue(f.code);
                  return v !== undefined && v !== null && v !== '';
                }).length;
                return (
                  <Space>
                    {title}
                    <Tag color={filled >= requiredFields.length ? 'success' : 'error'}>
                      {filled}/{requiredFields.length}
                    </Tag>
                  </Space>
                );
              }}
            />
          )}

          {editorType && !fields.length && (
            <Typography.Text type="secondary">{t('该模型暂无字段定义，仅保存标题。')}</Typography.Text>
          )}

          {!editorType && (
            <Typography.Paragraph type="secondary">
              {t('请选择内容模型以加载表单字段。')}{' '}
              <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setMetaKeys(['meta'])}>
                {t('前往选择')}
              </Button>
            </Typography.Paragraph>
          )}
        </Form>

      </Modal>


      <Modal
        title={historyTarget
          ? t('版本历史 - {title}', { title: historyTarget.title })
          : t('版本历史')}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={[
          <Button key="compare" onClick={() => openDiff(versions)} disabled={versions.length < 2}>
            {t('版本对比')}
          </Button>,
          <Button key="close" onClick={() => setHistoryOpen(false)}>
            {t('关闭')}
          </Button>,
        ]}
        width={900}
      >
        {/* 规范 §15.1：左侧版本时间线（倒序）+ 右侧版本详情，替代原先的单表平铺 */}
        <div style={{ display: 'flex', gap: 16, minHeight: 420 }}>
          <div
            style={{
              flex: '0 0 320px',
              maxHeight: 440,
              overflowY: 'auto',
              borderRight: '1px solid #f0f0f0',
              paddingRight: 12,
            }}
          >
            <Timeline
              items={timePage.rows.map((record) => {
                // OBS-11-10：恢复产生的版本标注来源版本（悬空引用由 resolveRevertedFrom 收敛为不展示）
                const source = resolveRevertedFrom(record, versions);
                const selected = historySelected?.id === record.id;
                return {
                  color: selected ? 'blue' : record.published ? 'green' : 'gray',
                  children: (
                    <div
                      role="button"
                      aria-label={t('查看版本 v{version}', { version: record.version })}
                      aria-pressed={selected}
                      onClick={() => void selectHistoryVersion(record)}
                      style={{
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: selected ? '#e6f4ff' : undefined,
                      }}
                    >
                      <Space size={4} wrap>
                        <strong>v{record.version}</strong>
                        {historyTarget && record.version === historyTarget.currentVersion && (
                          <Tag color="blue">{t('当前')}</Tag>
                        )}
                        {/* DEF-11-02：发布动作生成的版本（发布节点），据此回答「线上跑的是哪一版」 */}
                        {record.published && <Tag color="green">{t('发布版本')}</Tag>}
                        {source !== null && (
                          <Tag color="orange">{t('恢复自 v{version}', { version: source })}</Tag>
                        )}
                      </Space>
                      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                        {formatDateTime(record.createdAt)} · {record.createdByName || record.createdBy || '—'}
                      </div>
                      <div style={{ fontSize: 12 }} title={record.note || ''}>
                        {record.note || '—'}
                      </div>
                    </div>
                  ),
                };
              })}
            />
            {/* FR-CV-VER-006：每页 20 条，超出部分由「加载更多」追加 */}
            {timePage.hasMore && (
              <Button
                block
                size="small"
                onClick={() => setHistoryShown((n) => n + VERSION_PAGE_SIZE)}
              >
                {t('加载更多')}
              </Button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, maxHeight: 440, overflowY: 'auto' }}>
            {!historySelected ? (
              <Typography.Text type="secondary">{t('请选择左侧的版本查看详情')}</Typography.Text>
            ) : (
              <>
                <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
                  <Descriptions.Item label={t('版本号')}>
                    v{historySelected.version}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('作者')}>
                    {historySelected.createdByName || historySelected.createdBy || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('时间')}>
                    {formatDateTime(historySelected.createdAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('模型版本')}>
                    v{historySelected.modelVersion}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('备注')}>
                    {historySelected.note || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('标题')}>
                    {historySelected.title || '—'}
                  </Descriptions.Item>
                  {/* 规范 §15.1：详情列出「来源」——非恢复产生的版本没有来源，不是缺失 */}
                  <Descriptions.Item label={t('来源')}>
                    {resolveRevertedFrom(historySelected, versions) !== null
                      ? t('恢复自 v{version}', {
                          version: resolveRevertedFrom(historySelected, versions) as number,
                        })
                      : t('表单编辑')}
                  </Descriptions.Item>
                  {/* DEF-11-02：发布节点的类型与其它版本区分 */}
                  <Descriptions.Item label={t('版本类型')}>
                    {historySelected.published ? (
                      <Tag color="green">{t('发布版本')}</Tag>
                    ) : (
                      t('普通版本')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('AI 参与')} span={2}>
                    {historySelected.aiGenerated ? (
                      <Tag color="purple" title={historySelected.aiModel}>
                        {t('AI')}
                        {historySelected.aiModel ? ` · ${historySelected.aiModel}` : ''}
                      </Tag>
                    ) : (
                      '—'
                    )}
                  </Descriptions.Item>
                </Descriptions>

                {/* 规范 §15.1：详情下半部分是「字段变更」——该版本相对前一版本的字段级差异 */}
                <Typography.Text strong>{t('字段变更')}</Typography.Text>
                <Spin spinning={selectedDiffLoading}>
                  <List
                    size="small"
                    style={{ marginBottom: 12 }}
                    dataSource={selectedDiff?.changes ?? []}
                    locale={{ emptyText: t('与前一版本相比没有字段变更') }}
                    renderItem={(change) => (
                      <List.Item>
                        <Space size={4} wrap>
                          <Tag color={change.changeType === 'ADDED' ? 'green' : change.changeType === 'REMOVED' ? 'red' : 'orange'}>
                            {change.changeType === 'ADDED'
                              ? t('新增')
                              : change.changeType === 'REMOVED'
                                ? t('删除')
                                : t('修改')}
                          </Tag>
                          <span>{versionFieldLabel(change.field, collectFields(historyType))}</span>
                          <Typography.Text type="secondary">
                            {(change.before || '—') + ' → ' + (change.after || '—')}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Spin>

                {/* FR-CV-VER-007：5 种版本操作（来源对比为 OBS-11-10 的既有能力） */}
                <Space size={4} wrap>
                  <Button size="small" onClick={() => setViewVersion(historySelected)}>
                    {t('查看')}
                  </Button>
                  <Button size="small" onClick={() => compareWithPrevious(historySelected)}>
                    {t('与前一版本对比')}
                  </Button>
                  <Button
                    size="small"
                    disabled={!historyTarget || historySelected.version === historyTarget.currentVersion}
                    onClick={() => compareWithCurrent(historySelected)}
                  >
                    {t('与当前版本对比')}
                  </Button>
                  {/* 规范 §15.2「与指定版本对比」：预置本行为起点，目标版本在弹窗内的选择器改选 */}
                  <Button size="small" onClick={() => openDiffWithPicker(historySelected)}>
                    {t('与指定版本对比')}
                  </Button>
                  {resolveRevertedFrom(historySelected, versions) !== null && (
                    <Button size="small" onClick={() => openDiffWithSource(historySelected)}>
                      {t('与来源版本对比')}
                    </Button>
                  )}
                  <Tooltip title={access.edit ? undefined : writeDeniedReason}>
                    <span>
                      <Button
                        size="small"
                        danger
                        disabled={!access.edit || !historyTarget || historySelected.version === historyTarget.currentVersion}
                        onClick={() => {
                          setRevertNote('');
                          setRevertTarget(historySelected);
                        }}
                      >
                        {t('恢复到此版本')}
                      </Button>
                    </span>
                  </Tooltip>
                </Space>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* FR-CV-VER-001/003：只读查看历史版本快照（含条目级标题/路径/模板）。 */}
      <Modal
        title={viewVersion ? t('查看版本 v{version}', { version: viewVersion.version }) : t('查看版本')}
        open={!!viewVersion}
        onCancel={() => setViewVersion(null)}
        footer={[
          <Button key="close" onClick={() => setViewVersion(null)}>{t('关闭')}</Button>,
          <Button
            key="revert"
            type="primary"
            disabled={!access.edit || !historyTarget || !viewVersion || viewVersion.version === historyTarget.currentVersion}
            onClick={() => {
              if (!viewVersion) return;
              setRevertNote('');
              setRevertTarget(viewVersion);
            }}
          >
            {t('恢复到此版本')}
          </Button>,
        ]}
        width={720}
      >
        {viewVersion && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={t('以下为该版本保存时的内容快照，只读展示；恢复会以它生成一个新版本，不会删除后续版本。')}
            />
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label={t('版本')}>{`v${viewVersion.version}`}</Descriptions.Item>
              <Descriptions.Item label={t('标题')}>{viewVersion.title || '—'}</Descriptions.Item>
              {viewVersion.routePath && (
                <Descriptions.Item label={t('页面路径')}>{viewVersion.routePath}</Descriptions.Item>
              )}
              {viewVersion.templatePath && (
                <Descriptions.Item label={t('页面模板')}>{viewVersion.templatePath}</Descriptions.Item>
              )}
              {viewVersionSource !== null && (
                <Descriptions.Item label={t('来源版本')}>{`v${viewVersionSource}`}</Descriptions.Item>
              )}
              {/* DEF-11-02：发布动作生成的版本（发布节点）在详情里也标注，避免只看备注文案产生歧义 */}
              {viewVersion.published && (
                <Descriptions.Item label={t('版本类型')}>
                  <Tag color="green">{t('发布版本')}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('备注')}>{viewVersion.note || '—'}</Descriptions.Item>
              {/* OBS-11-04：AI 版本 actor 落库为用户 ID，此处展示后端解析出的用户名 */}
              <Descriptions.Item label={t('作者')}>
                {viewVersion.createdByName || viewVersion.createdBy || '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('时间')}>
                {formatDateTime(viewVersion.createdAt)}
              </Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="code"
              size="small"
              pagination={false}
              dataSource={versionSnapshotRows(viewVersion, collectFields(historyType))}
              columns={[
                { title: t('字段'), dataIndex: 'label', width: 200, ellipsis: true,
                  render: (v: string, record: { code: string }) => (
                    <span title={`${v} (${record.code})`}>{v}</span>
                  ) },
                { title: t('值'), dataIndex: 'text', render: (v: string) => (v === '' ? '—' : v) },
              ]}
            />
          </>
        )}
      </Modal>

      {/* FR-CV-VER-008：版本对比（默认上一版本 → 最新版本；最新版本由恢复产生时为「来源版本 → 新版本」，可改选）。 */}
      <Modal
        title={t('版本对比')}
        open={diffOpen}
        onCancel={() => setDiffOpen(false)}
        footer={<Button onClick={() => setDiffOpen(false)}>{t('关闭')}</Button>}
        width={860}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <span>{t('对比范围')}</span>
          <Select
            style={{ width: 140 }}
            value={diffFrom ?? undefined}
            onChange={(v) => { setDiffFrom(v); void runDiff(v, diffTo); }}
            options={versions.map((v) => ({ value: v.version, label: `v${v.version}` }))}
          />
          <span>{t('→')}</span>
          <Select
            style={{ width: 140 }}
            value={diffTo ?? undefined}
            onChange={(v) => { setDiffTo(v); void runDiff(diffFrom, v); }}
            options={versions.map((v) => ({ value: v.version, label: `v${v.version}` }))}
          />
        </Space>
        {diffResult && (
          <Space style={{ marginBottom: 12 }} wrap size="large">
            <Statistic title={t('新增')} value={diffCount(diffResult, 'ADDED')} valueStyle={{ color: '#389e0d', fontSize: 16 }} />
            <Statistic title={t('修改')} value={diffCount(diffResult, 'MODIFIED')} valueStyle={{ color: '#d46b08', fontSize: 16 }} />
            <Statistic title={t('删除')} value={diffCount(diffResult, 'REMOVED')} valueStyle={{ color: '#cf1322', fontSize: 16 }} />
            {/* 规范 §15.4：摘要须给出「未变」计数，避免用户把「表里没有」误读成「字段不存在」 */}
            <Statistic title={t('未变')} value={diffResult.unchangedFields ?? 0} valueStyle={{ fontSize: 16 }} />
          </Space>
        )}
        {/* 规范 §15.4：两端模型版本不一致时先提示，否则模型改版产生的字段增删会被误读成内容变更 */}
        {modelChange && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('模型变更')}
            description={t('v{from} 的模型版本为 v{fromModelVersion}，v{to} 的模型版本为 v{toModelVersion}；字段增删可能来自模型改版而非内容修改。', {
              from: String(modelChange.from),
              fromModelVersion: String(modelChange.fromModelVersion),
              to: String(modelChange.to),
              toModelVersion: String(modelChange.toModelVersion),
            })}
          />
        )}
        <Table
          rowKey="field"
          size="small"
          loading={diffLoading}
          pagination={false}
          scroll={{ y: 380 }}
          dataSource={diffResult?.changes ?? []}
          locale={{ emptyText: t('两个版本之间没有差异') }}
          columns={[
            { title: t('字段'), dataIndex: 'field', width: 200, ellipsis: true,
              render: (code: string) => (
                <span title={code}>{versionFieldLabel(code, collectFields(historyType))}</span>
              ) },
            {
              title: t('变更'),
              dataIndex: 'changeType',
              width: 100,
              render: (v: string) => (
                <Tag color={v === 'ADDED' ? 'green' : v === 'REMOVED' ? 'red' : 'orange'}>
                  {v === 'ADDED' ? t('新增') : v === 'REMOVED' ? t('删除') : t('修改')}
                </Tag>
              ),
            },
            { title: t('变更前'), dataIndex: 'before', render: (v?: string) => v || '—' },
            { title: t('变更后'), dataIndex: 'after', render: (v?: string) => v || '—' },
          ]}
        />
      </Modal>

      {/* FR-CV-VER-004/012：恢复需二次确认，并允许填写原因（随版本备注与审计留痕）。 */}
      <Modal
        title={revertTarget ? t('恢复到 v{version}', { version: revertTarget.version }) : t('恢复版本')}
        open={!!revertTarget}
        confirmLoading={revertLoading}
        okText={t('确认恢复')}
        onCancel={() => { setRevertTarget(null); setRevertNote(''); }}
        onOk={() => { if (revertTarget) void revertTo(revertTarget); }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('恢复不会删除历史：系统会以 v{version} 的内容快照生成一个新版本，当前内容随即切换为该快照。',
            { version: revertTarget?.version ?? '' })}
        />
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label={t('源版本')}>
            {revertTarget
              ? `v${revertTarget.version}（${revertTarget.createdByName || revertTarget.createdBy || '—'}，${formatDateTime(revertTarget.createdAt)}）`
              : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('当前版本')}>
            {historyTarget ? `v${historyTarget.currentVersion}` : '—'}
          </Descriptions.Item>
        </Descriptions>
        <Input.TextArea
          rows={2}
          maxLength={200}
          value={revertNote}
          onChange={(e) => setRevertNote(e.target.value)}
          placeholder={t('恢复原因（可选），如：误删内容回滚')}
        />
      </Modal>

      <Modal
        title={t('批量创建分集')}
        open={batchOpen}
        confirmLoading={batchLoading}
        onCancel={() => setBatchOpen(false)}
        onOk={() => void batchForm.submit()}
        okText={t('创建')}
      >
        <Form
          form={batchForm}
          layout="vertical"
          onFinish={async (values: { seasonId: string; startNumber: number; count: number; titlePrefix?: string }) => {
            if (!siteId) return;
            setBatchLoading(true);
            try {
              const created = await contentsApi.batchEpisodes(siteId, values);
              message.success(`已创建 ${created.length} 集`);
              setBatchOpen(false);
              await reloadList();
            } catch (e) {
              // 保留用例期望的固定前缀，同时带出后端的具体原因（如「季《…》中第 1 集已存在，本次未创建任何分集」）。
              const detail = errorMessage(e, '');
              message.error(detail ? `${t('批量创建分集失败')}：${detail}` : t('批量创建分集失败'));
            } finally {
              setBatchLoading(false);
            }
          }}
        >
          <Form.Item name="seasonId" label={t('所属季')} rules={[{ required: true, message: t('请选择视频季') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={seasons.map((s) => ({ value: s.id, label: s.title }))}
              placeholder={t('选择已创建的视频季')}
            />
          </Form.Item>
          <Form.Item name="startNumber" label={t('起始集数')} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="count" label={t('创建数量')} rules={[{ required: true }]}>
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="titlePrefix" label={t('标题前缀')}>
            <Input placeholder={t('第')} />
          </Form.Item>
        </Form>
      </Modal>
      {submitTarget && (
        <Modal
          open
          title={t('提交审核')}
          okText={t('提交')}
          confirmLoading={submitSaving}
          okButtonProps={{ disabled: submitLoading || submitActions.length === 0 }}
          onOk={() => void submitForReview()}
          onCancel={() => setSubmitTarget(null)}
        >
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {t('内容')}：{submitTarget.title}
          </Typography.Paragraph>
          <Spin spinning={submitLoading}>
            <Form form={submitForm} layout="vertical">
              <Form.Item name="targetStatus" label={t('目标状态')} rules={[{ required: true }]}>
                <Select
                  options={submitActions.map((a) => ({
                    value: a.targetStatus,
                    label: `${a.sourceStatus} → ${a.targetStatus}`,
                  }))}
                  placeholder={t('当前状态没有可用的工作流转换')}
                />
              </Form.Item>
              <Form.Item name="workflowId" label={t('工作流')} rules={[{ required: true }]}>
                <Select
                  options={submitWorkflows.map((w) => ({
                    value: w.id,
                    label: w.version ? `${w.name} v${w.version}` : w.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="assignee" label={t('受理人')} rules={[{ required: true }]}>
                {/* 站点成员/用户目录接口都需要更高权限；取不到候选时允许直接填写用户名。 */}
                <AutoComplete
                  options={submitAssignees}
                  placeholder={t('搜索或输入用户名')}
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            </Form>
          </Spin>
        </Modal>
      )}
    </div>
  );
}

export default function ContentPage() {
  return (
    <RequireSite>
      <ContentInner />
    </RequireSite>
  );
}
