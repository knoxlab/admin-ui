import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Dropdown,
  Layout,
  Menu,
  Select,
  Spin,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PartitionOutlined,
  PictureOutlined,
  RocketOutlined,
  SearchOutlined,
  SettingOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  LayoutOutlined,
  BgColorsOutlined,
  InboxOutlined,
  KeyOutlined,
  UnorderedListOutlined,
  UserOutlined,
  UserSwitchOutlined,
  BarChartOutlined,
  FundOutlined,
  ThunderboltOutlined,
  NodeIndexOutlined,
  LinkOutlined,
  DesktopOutlined,
  HeartOutlined,
  FileDoneOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth, hasCapability, isSystemAdmin } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import { isMenuAllowedByLayout } from './appMenuLayout';
import { SiteProvider, useSite } from './context/SiteContext';
import { modelsApi, organizationApi, workflowApi } from './api';
import { parseBranding, brandCssVars, resolveBrand, type ResolvedBrand } from './utils/branding';
import { setDisplayTimezone } from './utils/datetime';
import LanguageSwitcher from './components/LanguageSwitcher';
import { type TranslateFn } from './i18n/locale';
import { useT } from './i18n/I18nProvider';
import { CONTENT_MENU_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT } from './appEvents';
import type { ContentType, Notification } from './api/types';
import Dashboard from './pages/Dashboard';
import SitesPage from './pages/Sites';
import ModelsPage from './pages/Models';import CategoriesPage from './pages/Categories';
import ContentPage from './pages/Content';
import TimeMachinePage from './pages/TimeMachine';
import MediaPage from './pages/Media';
import WorkflowPage from './pages/Workflow';
import NotificationsPage from './pages/Notifications';
import PublishPage from './pages/Publish';
import IdePage from './pages/Ide';
import SearchPage from './pages/Search';
import PackagesPage from './pages/Packages';
import TagsPage from './pages/Tags';
import IdentityPage from './pages/Identity';
import AccountModal from './pages/Settings';
import SystemConfigPage from './pages/SystemConfig';
import TemplateDesignerPage from './pages/TemplateDesigner';
import ThemesPage from './pages/Themes';
import ContainersPage from './pages/Containers';
import TemplatesPage from './pages/Templates';
import PageDesignerPage from './pages/PageDesigner';
import PagesPage from './pages/Pages';
import SiteBrowserPage from './pages/SiteBrowser';
import AnalyticsPage from './pages/Analytics';
import SystemLogsPage from './pages/SystemLogs';
import './App.css';

const { Sider, Header, Content } = Layout;

const CONTENT_MENU_KEY = 'content-menu';
const DESIGN_MENU_KEY = 'design-menu';
const CONTENT_MODEL_KEY = 'content-model';
const PUBLISH_MENU_KEY = 'publish-menu';
const SYSTEM_MENU_KEY = 'system-menu';
const STATS_MENU_KEY = 'stats-menu';
const IDENTITY_MENU_KEY = 'identity-menu';

function buildMenuItems(t: TranslateFn): NonNullable<MenuProps['items']> {
  return [
    { key: '/dashboard', icon: <AppstoreOutlined />, label: t('概览') },
    { key: CONTENT_MENU_KEY, icon: <FileTextOutlined />, label: t('内容'), children: [] },
    { key: DESIGN_MENU_KEY, icon: <BgColorsOutlined />, label: t('设计'), children: [
      { key: '/browser', icon: <FolderOutlined />, label: t('目录浏览') },
      { key: '/themes', icon: <BgColorsOutlined />, label: t('主题') },
      { key: '/templates', icon: <LayoutOutlined />, label: t('模板') },
      { key: '/containers', icon: <InboxOutlined />, label: t('容器') },
    ] },
    { key: CONTENT_MODEL_KEY, icon: <DatabaseOutlined />, label: t('模型'), children: [
      { key: '/models', icon: <UnorderedListOutlined />, label: t('内容类型') },
      { key: '/categories', icon: <FolderOutlined />, label: t('分类管理') },
      { key: '/tags', icon: <TagsOutlined />, label: t('标签云') },
    ] },
    { key: PUBLISH_MENU_KEY, icon: <RocketOutlined />, label: t('发布'), children: [
      { key: '/publish?tab=releases', icon: <RocketOutlined />, label: t('Release 与构建') },
      { key: '/publish?tab=deployments', icon: <UnorderedListOutlined />, label: t('发布队列') },
      { key: '/publish?tab=targets', icon: <CloudUploadOutlined />, label: t('发布目标') },
    ] },
    { key: STATS_MENU_KEY, icon: <BarChartOutlined />, label: t('统计'), children: [
      { key: '/analytics/overview', icon: <FundOutlined />, label: t('网站概况') },
      { key: '/analytics/realtime', icon: <ThunderboltOutlined />, label: t('实时监控') },
      { key: '/analytics/visits', icon: <NodeIndexOutlined />, label: t('访问分析') },
      { key: '/analytics/sources', icon: <LinkOutlined />, label: t('来源分析') },
      { key: '/analytics/clients', icon: <DesktopOutlined />, label: t('客户端分析') },
      { key: '/analytics/loyalty', icon: <HeartOutlined />, label: t('忠诚度分析') },
      { key: '/analytics/visits-log', icon: <FileDoneOutlined />, label: t('访问记录') },
      { key: '/analytics/publish', icon: <TeamOutlined />, label: t('发布统计') },
    ] },
    { key: IDENTITY_MENU_KEY, icon: <TeamOutlined />, label: t('用户'), children: [
      { key: '/identity?tab=users', icon: <UserOutlined />, label: t('组织用户') },
      { key: '/identity?tab=members', icon: <TeamOutlined />, label: t('本站成员') },
      { key: '/identity?tab=frontend', icon: <UserOutlined />, label: t('会员') },
      { key: '/identity?tab=tiers', icon: <KeyOutlined />, label: t('会员分组') },
      { key: '/identity?tab=roles', icon: <KeyOutlined />, label: t('角色目录') },
    ] },
    { key: SYSTEM_MENU_KEY, icon: <SettingOutlined />, label: t('系统'), children: [
      { key: '/sites', icon: <GlobalOutlined />, label: t('站点与环境') },
      { key: '/system-config', icon: <SettingOutlined />, label: t('系统配置') },
      { key: '/system-logs', icon: <FileTextOutlined />, label: t('系统日志') },
      { key: '/workflow', icon: <PartitionOutlined />, label: t('工作流') },
      { key: '/search', icon: <SearchOutlined />, label: t('搜索索引') },
      { key: '/packages', icon: <CloudUploadOutlined />, label: t('站点包') },
    ] },
  ];
}

function buildPageMeta(t: TranslateFn): Record<string, { title: string; crumbs: string[] }> {
  const home = t('首页');
  return {
    '/dashboard': { title: t('概览'), crumbs: [home, t('概览')] },
    '/content': { title: t('内容搜索'), crumbs: [home, t('内容'), t('内容搜索')] },
    '/time-machine': { title: t('时间机器'), crumbs: [home, t('内容'), t('时间机器')] },
    '/media': { title: t('媒体库'), crumbs: [home, t('内容'), t('媒体库')] },
    '/workflow': { title: t('工作流'), crumbs: [home, t('系统'), t('工作流')] },
    '/notifications': { title: t('通知中心'), crumbs: [home, t('通知中心')] },
    '/browser': { title: t('目录浏览'), crumbs: [home, t('设计'), t('目录浏览')] },
    '/pages': { title: t('页面管理'), crumbs: [home, t('内容'), t('页面管理')] },
    '/pages/editor': { title: t('可视化编辑'), crumbs: [home, t('内容'), t('页面管理'), t('可视化编辑')] },
    '/themes': { title: t('主题'), crumbs: [home, t('设计'), t('主题')] },
    '/templates': { title: t('模板'), crumbs: [home, t('设计'), t('模板')] },
    '/containers': { title: t('容器'), crumbs: [home, t('设计'), t('容器')] },
    '/template-designer': { title: t('模板设计器'), crumbs: [home, t('设计'), t('模板'), t('设计器')] },
    '/ide': { title: t('模板工程'), crumbs: [home, t('设计'), t('模板工程')] },
    '/models': { title: t('内容类型'), crumbs: [home, t('模型'), t('内容类型')] },
    '/categories': { title: t('分类管理'), crumbs: [home, t('模型'), t('分类管理')] },
    '/tags': { title: t('标签云'), crumbs: [home, t('模型'), t('标签云')] },
    '/publish': { title: t('构建与发布'), crumbs: [home, t('发布'), t('构建与发布')] },
    '/sites': { title: t('站点与环境'), crumbs: [home, t('系统'), t('站点与环境')] },
    '/system-config': { title: t('系统配置'), crumbs: [home, t('系统'), t('系统配置')] },
    '/system-logs': { title: t('系统日志'), crumbs: [home, t('系统'), t('系统日志')] },
    '/search': { title: t('搜索索引'), crumbs: [home, t('系统'), t('搜索索引')] },
    '/packages': { title: t('站点包'), crumbs: [home, t('系统'), t('站点包')] },
    '/identity': { title: t('用户'), crumbs: [home, t('用户')] },
    '/analytics/overview': { title: t('网站概况'), crumbs: [home, t('统计'), t('网站概况')] },
    '/analytics/realtime': { title: t('实时监控'), crumbs: [home, t('统计'), t('实时监控')] },
    '/analytics/visits': { title: t('访问分析'), crumbs: [home, t('统计'), t('访问分析')] },
    '/analytics/sources': { title: t('来源分析'), crumbs: [home, t('统计'), t('来源分析')] },
    '/analytics/clients': { title: t('客户端分析'), crumbs: [home, t('统计'), t('客户端分析')] },
    '/analytics/loyalty': { title: t('忠诚度分析'), crumbs: [home, t('统计'), t('忠诚度分析')] },
    '/analytics/visits-log': { title: t('访问记录'), crumbs: [home, t('统计'), t('访问记录')] },
    '/analytics/publish': { title: t('发布统计'), crumbs: [home, t('统计'), t('发布统计')] },
  };
}

function buildIdentityTabMeta(t: TranslateFn): Record<string, { title: string; crumbs: string[] }> {
  const home = t('首页');
  return {
    users: { title: t('组织用户'), crumbs: [home, t('用户'), t('组织用户')] },
    members: { title: t('本站成员'), crumbs: [home, t('用户'), t('本站成员')] },
    frontend: { title: t('会员'), crumbs: [home, t('用户'), t('会员')] },
    tiers: { title: t('会员分组'), crumbs: [home, t('用户'), t('会员分组')] },
    roles: { title: t('角色目录'), crumbs: [home, t('用户'), t('角色目录')] },
  };
}

function avatarLetter(name: string | null | undefined) {
  const n = (name || 'U').trim();
  return n.slice(0, 1).toUpperCase();
}

function matchPath(pathname: string) {
  return (
    Object.keys(buildPageMeta((zh) => zh))
      .sort((a, b) => b.length - a.length)
      .find((p) => pathname === p || pathname.startsWith(`${p}/`)) || '/dashboard'
  );
}

function PagesRoute() {
  const [params] = useSearchParams();
  const legacyPageId = params.get('pageId');
  return legacyPageId ? <Navigate to={`/pages/editor?pageId=${encodeURIComponent(legacyPageId)}`} replace /> : <PagesPage />;
}

/**
 * 审核深链 `/tasks/{id}`：站内通知与邮件模板（`${taskUrl}`）都写这个地址，历史通知行
 * 也已落库为它 —— 统一转到工作流「待办」并带上 `?task=` 定位到该任务的审核界面。
 */
function TaskDeepLinkRoute() {
  const { taskId } = useParams();
  return <Navigate to={`/workflow?task=${encodeURIComponent(taskId ?? '')}`} replace />;
}

function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const { username, logout, me } = useAuth();
  const { sites, siteId, setSiteId } = useSite();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [contentMenuTypes, setContentMenuTypes] = useState<ContentType[]>([]);
  const [unreadNotes, setUnreadNotes] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [brand, setBrand] = useState<ResolvedBrand>(() => resolveBrand({}));

  /**
   * DEF-CFG-03：组织设置里的「后台展示时区」与「品牌次色」在此灌入消费端。
   *
   * <p>两者修复前都是「能存、能读、无行为」的空转配置：`defaultTimezone` 只落库，
   * 时间一律按浏览器时区渲染；`backendSecondaryColor` 只落库，管理端选中态用的是
   * 硬编码的品牌蓝。这里对齐后：
   * <ul>
   *   <li>{@code defaultTimezone} → {@link setDisplayTimezone}，全站时间格式化按该时区重投影；</li>
   *   <li>{@code backendPrimaryColor}/{@code backendSecondaryColor} → 外壳 CSS 变量，供
   *       {@code App.css} 的侧边栏选中/悬停态取值。</li>
   * </ul>
   *
   * <p><b>刻意取公开端点而非 {@code GET /organization/settings}：</b>后者是「组织设置」页面的
   * 管理面读口（spec 9.7 口径为「已登录可读」，未来若按 UI 收敛为 system-admin），
   * 而**展示时区与品牌是跨账号的显示默认**，对站点管理员/只读用户同样应当生效。
   * 取公开端点还带来一个副产品：登录页与登录后的品牌**同源同值**，不会出现
   * 「登录页是组织品牌、进来又变回默认色」的跳变。
   *
   * <p>读取失败时**保持默认口径**（浏览器本地时区 + 缺省品牌色），不阻塞外壳渲染：
   * 组织设置读不到不该让后台打不开。
   */
  useEffect(() => {
    let cancelled = false;
    organizationApi
      .branding()
      .then((settings) => {
        if (cancelled) return;
        setDisplayTimezone(settings.defaultTimezone);
        setBrand(resolveBrand(parseBranding(settings.branding)));
      })
      .catch(() => {
        if (!cancelled) setDisplayTimezone(null);
      });
    return () => {
      cancelled = true;
      setDisplayTimezone(null);
    };
  }, []);

  const pageMeta = useMemo(() => buildPageMeta(t), [t]);
  const identityTabMeta = useMemo(() => buildIdentityTabMeta(t), [t]);
  const menuItems = useMemo(() => buildMenuItems(t), [t]);
  const activePath = matchPath(location.pathname);
  const identityTab = activePath === '/identity' ? (new URLSearchParams(location.search).get('tab') || 'users') : null;
  const meta = (identityTab && identityTabMeta[identityTab]) || pageMeta[activePath];

  const selectedMenuKey = useMemo(() => {
    if (activePath === '/pages/editor') return '/pages';
    if (activePath === '/content') {
      const type = new URLSearchParams(location.search).get('type');
      return type ? '/content?type=' + type : '/content';
    }
    if (activePath === '/publish') {
      const tab = new URLSearchParams(location.search).get('tab');
      return `/publish?tab=${tab === 'targets' || tab === 'deployments' ? tab : 'releases'}`;
    }
    if (activePath === '/identity') {
      const tab = new URLSearchParams(location.search).get('tab') || 'users';
      return `/identity?tab=${tab}`;
    }
    if (activePath === '/system-config') return '/system-config';
    if (activePath.startsWith('/analytics/')) return activePath;
    return activePath;
  }, [activePath, location.pathname, location.search]);

  const appMenuItems = useMemo<MenuProps['items']>(() => menuItems.map((item) => {
    if (!item || typeof item !== 'object' || item.key !== CONTENT_MENU_KEY) return item;
    return {
      ...item,
      children: [
        { key: '/content', icon: <SearchOutlined />, label: t('内容搜索') },
        { key: '/pages', icon: <FileTextOutlined />, label: t('页面管理') },
        // FR-CV-VER-009：历史时间点只读浏览
        { key: '/time-machine', icon: <HistoryOutlined />, label: t('时间机器') },
        ...contentMenuTypes.map((type) => ({
          key: `/content?type=${type.id}`,
          icon: <DatabaseOutlined />,
          label: type.contentMenuLabel || type.name,
        })),
        { key: '/media', icon: <PictureOutlined />, label: t('媒体库') },
      ],
    };
  }), [contentMenuTypes, menuItems, t]);

  const visibleMenuItems = useMemo(() => {
    const layoutOk = (key: string) => (me ? isMenuAllowedByLayout(key, me.layouts) : true);
    const allow = (key: string) => {
      if (!layoutOk(key)) return false;
      if (!me) return true;
      if (key === '/dashboard' || key === '/media' || key === '/workflow' || key === '/browser' || key === '/pages' || key === '/pages/editor') return true;
      if (key === '/content' || key.startsWith('/content?')) return true;
      // FR-CV-VER-009：时间机器只需站点读权限（接口 @PreAuthorize 也是 read）
      if (key === '/time-machine') return hasCapability(me, siteId, 'read') || hasCapability(me, siteId, 'admin');
      if (key === '/categories' || key === '/tags') return hasCapability(me, siteId, 'admin');
      if (key === '/models') return hasCapability(me, siteId, 'model') || hasCapability(me, siteId, 'admin');
      if (key.startsWith('/publish')) return hasCapability(me, siteId, 'deploy') || hasCapability(me, siteId, 'admin');
      if (['/themes', '/templates', '/containers', '/template-designer'].includes(key)) {
        return hasCapability(me, siteId, 'template') || hasCapability(me, siteId, 'write') || hasCapability(me, siteId, 'admin');
      }
      if (key === '/system-config') return isSystemAdmin(me) || hasCapability(me, siteId, 'admin');
      if (key === '/system-logs') {
        return isSystemAdmin(me) || hasCapability(me, siteId, 'logs') || hasCapability(me, siteId, 'logs-admin');
      }
      if (key.startsWith('/identity')) {
        const tab = new URLSearchParams(key.split('?')[1] || '').get('tab') || 'users';
        if (tab === 'users' || tab === 'roles') return isSystemAdmin(me);
        if (tab === 'members' || tab === 'frontend') return isSystemAdmin(me) || hasCapability(me, siteId, 'admin');
        return isSystemAdmin(me) || hasCapability(me, siteId, 'admin');
      }
      if (['/search', '/packages'].includes(key)) return isSystemAdmin(me) || hasCapability(me, siteId, 'site-admin');
      if (key.startsWith('/analytics')) return hasCapability(me, siteId, 'stats') || hasCapability(me, siteId, 'admin');
      if (key === '/sites') return isSystemAdmin(me) || hasCapability(me, siteId, 'read');
      return true;
    };
    const filter = (items: MenuProps['items']): MenuProps['items'] =>
      (items || []).flatMap((item) => {
        if (!item || typeof item !== 'object') return [item];
        if ('children' in item && Array.isArray(item.children)) {
          const children = filter(item.children);
          if (!children?.length) return [];
          return [{ ...item, children }];
        }
        return allow(String('key' in item ? item.key : '')) ? [item] : [];
      });
    return filter(appMenuItems);
  }, [appMenuItems, me, siteId]);

  useEffect(() => {
    let active = true;
    const loadContentMenu = async () => {
      if (!siteId) {
        setContentMenuTypes([]);
        return;
      }
      try {
        const list = await modelsApi.contentMenu(siteId);
        if (active) setContentMenuTypes(list);
      } catch {
        if (active) setContentMenuTypes([]);
      }
    };
    void loadContentMenu();
    const refresh = () => void loadContentMenu();
    window.addEventListener(CONTENT_MENU_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CONTENT_MENU_CHANGED_EVENT, refresh);
    };
  }, [siteId]);

  const loadUnread = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        workflowApi.notifications(true),
        workflowApi.unreadCount(),
      ]);
      setUnreadNotes(list.slice(0, 10));
      setUnreadCount(count);
    } catch {
      setUnreadNotes([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void loadUnread();
    const timer = window.setInterval(() => void loadUnread(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadUnread, location.pathname]);

  // DEF-11-05：通知中心标记已读/全部已读后立即刷新未读角标，不等下一次轮询或路由变化。
  useEffect(() => {
    const refresh = () => void loadUnread();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
  }, [loadUnread]);

  useEffect(() => {
    if (collapsed) return;
    const parentByPath: Record<string, string> = {
      '/content': CONTENT_MENU_KEY,
      '/pages': CONTENT_MENU_KEY,
      '/pages/editor': CONTENT_MENU_KEY,
      '/media': CONTENT_MENU_KEY,
      '/browser': DESIGN_MENU_KEY,
      '/themes': DESIGN_MENU_KEY,
      '/templates': DESIGN_MENU_KEY,
      '/containers': DESIGN_MENU_KEY,
      '/template-designer': DESIGN_MENU_KEY,
      '/models': CONTENT_MODEL_KEY,
      '/categories': CONTENT_MODEL_KEY,
      '/tags': CONTENT_MODEL_KEY,
      '/publish': PUBLISH_MENU_KEY,
      '/identity': IDENTITY_MENU_KEY,
      '/sites': SYSTEM_MENU_KEY,
      '/system-config': SYSTEM_MENU_KEY,
      '/system-logs': SYSTEM_MENU_KEY,
      '/workflow': SYSTEM_MENU_KEY,
      '/search': SYSTEM_MENU_KEY,
      '/packages': SYSTEM_MENU_KEY,
    };
    const parentKey = activePath.startsWith('/analytics') ? STATS_MENU_KEY
      : parentByPath[activePath];
    if (parentKey) {
      // 手风琴：展开当前分组并收起其他一级分组
      setOpenKeys([parentKey]);
    }
  }, [activePath, location.search, collapsed]);

  const userMenuItems: MenuProps['items'] = useMemo(
    () => [
          {
            key: 'user-label',
            label: username || t('用户'),
            disabled: true,
          },
      {
        key: 'account',
        icon: <UserOutlined />,
        label: t('我的账户'),
        onClick: () => setAccountOpen(true),
      },
      {
        key: 'impersonate',
        icon: <UserSwitchOutlined />,
        label: t('切换身份登录'),
        onClick: () => message.info(t('切换身份登录功能即将提供')),
      },
      {
        key: 'issue',
        icon: <ToolOutlined />,
        label: t('反馈问题'),
        onClick: () => message.info(t('请通过系统设置或运维渠道反馈问题')),
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: t('退出登录'),
        onClick: () => {
          void logout().then(() => navigate('/login'));
        },
      },
    ],
    [username, navigate, logout, t],
  );

  const notifyMenu: MenuProps['items'] = unreadNotes.length
    ? [
        ...unreadNotes.map((n) => ({
          key: n.id,
          label: (
            <div style={{ maxWidth: 280 }}>
              <div>{n.title}</div>
              {n.body && (
                <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
                  {n.body}
                </Typography.Text>
              )}
            </div>
          ),
          onClick: () => {
            void workflowApi.markRead(n.id).then(() => loadUnread());
            navigate('/notifications');
          },
        })),
        { type: 'divider' as const },
        { key: 'all', label: t('查看全部通知'), onClick: () => navigate('/notifications') },
      ]
    : [
        { key: 'empty', disabled: true, label: t('暂无新通知') },
        { type: 'divider' as const },
        { key: 'all', label: t('通知中心'), onClick: () => navigate('/notifications') },
      ];

  return (
    <Layout
      className="app-shell"
      // DEF-CFG-03：品牌色以 CSS 变量下发到外壳，供 App.css 消费；缺省色由 resolveBrand 兜底。
      style={brandCssVars(brand) as CSSProperties}
    >
      <Sider
        className="app-shell-sider"
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        trigger={null}
        theme="dark"
      >
        <div className="app-shell-sider-top">
          <Tooltip title={collapsed ? t('展开导航') : t('收起导航')} placement="right">
            <Button
              type="text"
              aria-label={collapsed ? t('展开导航') : t('收起导航')}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((v) => !v)}
            />
          </Tooltip>
          {!collapsed && (
            <span className="app-shell-brand">PowerCMS 12</span>
          )}
        </div>
        <Menu
          className="app-shell-menu"
          theme="dark"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[selectedMenuKey]}
          openKeys={collapsed ? undefined : openKeys}
          onOpenChange={(keys) => {
            // 手风琴：一级菜单互斥展开，新展开的分组替换原有分组
            const latest = keys.find((k) => !openKeys.includes(k));
            setOpenKeys(latest ? [latest] : keys.slice(-1));
          }}
          items={visibleMenuItems}
          onClick={({ key }) => {
            if ([CONTENT_MENU_KEY, DESIGN_MENU_KEY, CONTENT_MODEL_KEY, PUBLISH_MENU_KEY, SYSTEM_MENU_KEY, STATS_MENU_KEY, IDENTITY_MENU_KEY].includes(key)) return;
            navigate(key);
          }}
        />
      </Sider>

      <Layout className="app-shell-main">
        <Header className="app-shell-header" style={{ background: token.colorBgContainer }}>
          <div className="app-shell-header-left">
            <Breadcrumb
              className="app-shell-breadcrumb"
              items={meta.crumbs.map((c, i) => ({
                title:
                  i === 0 ? (
                    <a
                      href="/dashboard"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/dashboard');
                      }}
                    >
                      {c}
                    </a>
                  ) : (
                    c
                  ),
              }))}
            />
          </div>

          <div className="app-shell-header-right">
            <Select
              className="app-shell-site-select"
              placeholder={t('选择站点')}
              value={siteId ?? undefined}
              options={sites.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.siteKey})`,
              }))}
              onChange={setSiteId}
              allowClear
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={280}
            />

            <Dropdown menu={{ items: notifyMenu }} placement="bottomRight" trigger={['click']}>
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label={t('通知')} />
              </Badge>
            </Dropdown>

            <div className="app-shell-header-divider" />

            <LanguageSwitcher />

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Avatar
                style={{ backgroundColor: '#91caff', color: '#003eb3', cursor: 'pointer', fontWeight: 600 }}
                size={36}
              >
                {avatarLetter(username)}
              </Avatar>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-shell-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/time-machine" element={<TimeMachinePage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/tasks/:taskId" element={<TaskDeepLinkRoute />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/browser" element={<SiteBrowserPage />} />
            <Route path="/pages" element={<PagesRoute />} />
            <Route path="/pages/editor" element={<PageDesignerPage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/containers/*" element={<ContainersPage />} />
            <Route path="/template-designer" element={<TemplateDesignerPage />} />
            <Route path="/ide" element={<IdePage />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/analytics" element={<Navigate to="/analytics/overview" replace />} />
            <Route path="/analytics/:section" element={<AnalyticsPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/identity" element={<IdentityPage />} />
            <Route path="/system-config" element={<SystemConfigPage />} />
            <Route path="/system-logs" element={<SystemLogsPage />} />
          </Routes>
        </Content>
      </Layout>
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </Layout>
  );
}

function ProtectedApp() {
  const { username, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!username) return <Navigate to="/login" replace />;
  return (
    <SiteProvider>
      <AppShell />
    </SiteProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}
