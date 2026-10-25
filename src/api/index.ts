import { api } from './client';
import type { AxiosRequestConfig } from 'axios';
import type {
  BuildJob,
  BuildLog,
  Category,
  ContentItem,
  ContentType,
  ContentTypeConfig,
  ContentVersion,
  ContentVersionDiff,
  DependencyReport,
  DeployTarget,
  Deployment,
  LockfileStatus,
  MediaAsset,
  MediaDetail,
  MediaFolderView,
  Meta,
  MeProfile,
  ApiToken,
  AdminApiTokenView,
  OAuthClientAdminView,
  OAuthClientCreatedView,
  Notification,
  Release,
  BuildArtifact,
  Role,
  Site,
  SiteAuthorizationPolicy,
  SiteDeletionPreview,
  SiteMember,
  SiteFolder,
  SitePackage,
  SitePackagePrecheckReport,
  TemplateFile,
  TemplateProject,
  PageInfo,
  PageResourceUpdateResult,
  PageSubtreeMovePlan,
  PageRouteImpactReport,
  PageRedirectPlan,
  VisualTheme,
  ThemeImportResult,
  ThemeBrowserFile,
  ThemeRevision,
  ThemeDiffEntry,
  ThemeShare,
  ReleaseThemeVersion,
  PageComposition,
  PageComponentSpec,
  VisualTemplate,
  VisualTemplateAcl,
  VisualTemplateDocument,
  VisualTemplateRevision,
  VisualContainer,
  VisualContainerRevision,
  ContainerStructure,
  TemplateRevision,
  User,
  Workflow,
  WorkflowActionInfo,
  WorkflowTask,
  NotificationPreference,
  NotificationTemplate,
  LifecycleHook,
  LifecycleTestResult,
  QuickCreatePathPreview,
  VariableNameSuggestion,
  SystemFieldDef,
  PermissionView,
  SavePermissionEntry,
  PermissionCheck,
  OrganizationSettings,
  UserReferenceSummary,
  FrontendUserDetail,
  TimeMachineSnapshot,
  RelationDef,
  ContentRelationGroup,
  RelatedContent,
  MvcController,
  MvcControllerValidation,
  SharedComponent,
  WidgetDefinition,
  SharedComponentRevision,
  UrlRewriteRule,
  UrlRewriteValidation,
  UrlRewriteTestResult,
  DashboardContentCardItem,
  DashboardPendingApprovalItem,
  DashboardRecentlyPublishedItem,
  DashboardActivityResponse,
  DashboardSummary,
} from './types';

export const metaApi = {
  get: () => api.get<Meta>('/meta').then((r) => r.data),
};

/** 用户自助语言切换（FR-I18N-004）：GET 查当前生效语言，PUT 持久化个人偏好。 */
export const i18nApi = {
  current: () =>
    api
      .get<{ language: string; default: string; available: { tag: string; nativeName: string }[] }>(
        '/me/language',
      )
      .then((r) => r.data),
  update: (language: string) =>
    api
      .put<{ language: string; message: string }>('/me/language', { language })
      .then((r) => r.data),
};

/**
 * 站点看板：概览、活动流与待办。
 */
export const dashboardApi = {
  summary: (siteId: string) =>
    api.get<DashboardSummary>(`/sites/${siteId}/dashboard/summary`).then((r) => r.data),
  activity: (siteId: string, limit = 20) =>
    api.get<DashboardActivityResponse>(`/sites/${siteId}/dashboard/activity`, { params: { limit } }).then((r) => r.data),
  myActivity: (siteId: string, limit = 20) =>
    api.get<DashboardActivityResponse>(`/sites/${siteId}/dashboard/my-activity`, { params: { limit } }).then((r) => r.data),
  pendingApproval: (siteId: string, limit = 20) =>
    api.get<DashboardPendingApprovalItem[]>(`/sites/${siteId}/dashboard/pending-approval`, { params: { limit } }).then((r) => r.data),
  scheduled: (siteId: string, limit = 20) =>
    api.get<DashboardContentCardItem[]>(`/sites/${siteId}/dashboard/scheduled`, { params: { limit } }).then((r) => r.data),
  recentlyPublished: (siteId: string, limit = 20) =>
    api.get<DashboardRecentlyPublishedItem[]>(`/sites/${siteId}/dashboard/recently-published`, { params: { limit } }).then((r) => r.data),
  unpublishedWork: (siteId: string, limit = 20) =>
    api.get<DashboardContentCardItem[]>(`/sites/${siteId}/dashboard/unpublished-work`, { params: { limit } }).then((r) => r.data),
  expiring: (siteId: string, limit = 20) =>
    api.get<DashboardContentCardItem[]>(`/sites/${siteId}/dashboard/expiring`, { params: { limit } }).then((r) => r.data),
};

export const authApi = {
  me: () => api.get<{ authenticated: boolean; username?: string; loginMode?: string }>('/auth/me').then((r) => r.data),
  login: (username: string, password: string) =>
    api.post<{ authenticated: boolean; username?: string; loginMode?: string }>('/auth/backend/login', { username, password }).then((r) => r.data),
  frontendLogin: (body: { username: string; password: string; siteKey?: string }) =>
    api.post<{ authenticated: boolean; username?: string; loginMode?: string; siteKey?: string }>('/auth/frontend/login', body).then((r) => r.data),
  logout: () => api.post('/auth/backend/logout'),
  profile: () => api.get<MeProfile>('/me').then((r) => r.data),
  tokens: () => api.get<ApiToken[]>('/me/tokens').then((r) => r.data),
  createToken: (body: {
    name: string;
    siteId?: string | null;
    scopes?: string[];
    expiresAt: string;
    allowedFrom?: string;
  }) => api.post<ApiToken & { token: string }>('/me/tokens', body).then((r) => r.data),
  deleteToken: (id: string) => api.delete(`/me/tokens/${id}`),
  /** 管理端全量 Token 列表（system-admin）。 */
  adminTokens: () => api.get<AdminApiTokenView[]>('/admin/tokens').then((r) => r.data),
  /** 系统管理员吊销任意 Token。 */
  adminRevokeToken: (id: string) => api.post(`/admin/tokens/${id}/revoke`),
};

/** OAuth 客户端管理（system-admin）。 */
export const oauthApi = {
  list: () => api.get<OAuthClientAdminView[]>('/oauth/clients').then((r) => r.data),
  create: (body: { name: string; redirectUris: string[]; scopes?: string[] }) =>
    api.post<OAuthClientCreatedView>('/oauth/clients', body).then((r) => r.data),
  revoke: (clientId: string) => api.post(`/oauth/clients/${encodeURIComponent(clientId)}/revoke`),
};

/** 访问审计查看（站点 read）。 */
export interface AccessAuditItem {
  occurredAt: string;
  action: string;
  actor: string;
  objectId: string;
  detail?: string;
}

export const sitesApi = {
  list: (params?: { status?: string }) => api.get<Site[]>('/sites', { params }).then((r) => r.data),
  get: (id: string) => api.get<Site>(`/sites/${id}`).then((r) => r.data),
  create: (body: { siteKey: string; name: string; description?: string; defaultLocale?: string; timezone?: string }) =>
    api.post<Site>('/sites', body).then((r) => r.data),
  freeze: (id: string) => api.post(`/sites/${id}/freeze`),
  archive: (id: string) => api.post(`/sites/${id}/archive`),
  unarchive: (id: string) => api.post(`/sites/${id}/unarchive`),
  /** FR-SITE-LC-007：删除预览（影响面 + 外部引用阻断项），删除前先调这个。 */
  deletionPreview: (id: string) =>
    api.get<SiteDeletionPreview>(`/sites/${id}/deletion-preview`).then((r) => r.data),
  /** FR-SITE-LC-007：物理删除归档站点及其全部站点级数据（审计保留）。 */
  delete: (id: string) => api.delete(`/sites/${id}`),
  members: (id: string, config?: AxiosRequestConfig) =>
    api.get<SiteMember[]>(`/sites/${id}/members`, config).then((r) => r.data),
  addMember: (id: string, body: { username: string; roleCode: string }) =>
    api.post(`/sites/${id}/members`, body),
  authorizationPolicy: (id: string) =>
    api.get<SiteAuthorizationPolicy>(`/sites/${id}/authorization-policy`).then((r) => r.data),
  saveAuthorizationPolicy: (id: string, body: Partial<SiteAuthorizationPolicy>) =>
    api.put<SiteAuthorizationPolicy>(`/sites/${id}/authorization-policy`, body).then((r) => r.data),
  accessGuidance: (id: string) =>
    api.get<{ enabled: boolean }>(`/sites/${id}/access-guidance`).then((r) => r.data),
  saveAccessGuidance: (id: string, enabled: boolean) =>
    api.put<{ enabled: boolean }>(`/sites/${id}/access-guidance`, { enabled }).then((r) => r.data),
  accessAudit: (id: string, params?: { page?: number; size?: number; action?: string }) =>
    api.get<{ items: AccessAuditItem[]; total: number; page: number; size: number }>(
      `/sites/${id}/access-audit`, { params }).then((r) => r.data),
};

export const usersApi = {
  list: (config?: AxiosRequestConfig) => api.get<User[]>('/users', config).then((r) => r.data),
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),
  create: (body: { username: string; password: string; displayName: string; email?: string; kind?: string; homeSiteId?: string | null }) =>
    api.post<User>('/users', body).then((r) => r.data),
  disable: (id: string, reassignTo?: string) =>
    api.post(`/users/${id}/disable`, reassignTo ? { reassignTo } : {}),
  unlock: (id: string) => api.post(`/users/${id}/unlock`),
  changePassword: (id: string, body: { currentPassword?: string; newPassword: string }) =>
    api.post(`/users/${id}/password`, body),
  assignRole: (id: string, body: { roleId?: string; roleCode?: string; siteId?: string | null }) =>
    api.post(`/users/${id}/roles`, body),
  revokeRole: (id: string, roleId: string, siteId?: string | null) =>
    api.delete(`/users/${id}/roles/${roleId}`, { params: siteId ? { siteId } : {} }),
  /** spec 9.1：本人或 system-admin（前台会员：本站 site-admin）读写资料。 */
  profile: (id: string) => api.get<Record<string, unknown>>(`/users/${id}/profile`).then((r) => r.data),
  updateProfile: (id: string, fields: Record<string, unknown>) =>
    api.put<Record<string, unknown>>(`/users/${id}/profile`, fields).then((r) => r.data),
  /** spec 5.3：用户引用摘要（system-admin）。 */
  references: (id: string) => api.get<UserReferenceSummary>(`/users/${id}/references`).then((r) => r.data),
};

/** spec 9.1.1：站点前台会员管理（该站 admin 或 system-admin）。 */
export const frontendUsersApi = {
  list: (siteId: string) => api.get<SiteMember[]>(`/sites/${siteId}/frontend-users`).then((r) => r.data),
  create: (siteId: string, body: { username: string; password: string; displayName: string; email?: string }) =>
    api.post<User>(`/sites/${siteId}/frontend-users`, body).then((r) => r.data),
  detail: (siteId: string, id: string) =>
    api.get<FrontendUserDetail>(`/sites/${siteId}/frontend-users/${id}`).then((r) => r.data),
  disable: (siteId: string, id: string, reassignTo?: string) =>
    api.post(`/sites/${siteId}/frontend-users/${id}/disable`, reassignTo ? { reassignTo } : {}),
  approve: (siteId: string, id: string) =>
    api.post(`/sites/${siteId}/frontend-users/${id}/approve`, {}),
  /** 解锁会员（恢复登录并清零失败计数）；待审核会员走 approve。 */
  unlock: (siteId: string, id: string) =>
    api.post(`/sites/${siteId}/frontend-users/${id}/unlock`),
};

export const organizationApi = {
  /** 需后台登录。 */
  settings: () => api.get<OrganizationSettings>('/organization/settings').then((r) => r.data),
  /** system-admin。 */
  updateSettings: (body: Partial<OrganizationSettings>) =>
    api.put<OrganizationSettings>('/organization/settings', body).then((r) => r.data),
  /** 公开品牌（未登录可用）。 */
  branding: () => api.get<OrganizationSettings>('/organization/settings/public/branding').then((r) => r.data),
};

export const rolesApi = {
  list: (config?: AxiosRequestConfig) => api.get<Role[]>('/roles', config).then((r) => r.data),
  create: (body: { code: string; name: string; description?: string; capabilities?: string[]; layouts?: string[]; tierLevel?: number | null }) =>
    api.post<Role>('/roles', body).then((r) => r.data),
  remove: (id: string) => api.delete(`/roles/${id}`),
  /** 后台布局目录（后端 BackendLayoutCatalog 下发，避免前端硬编码漂移，DEF-11-20）。 */
  layouts: () => api.get<{ code: string; name: string }[]>('/roles/layouts').then((r) => r.data),
  /** 站点能力键目录（后端 SiteCapabilities.ALL 下发，单一来源防漂移；失败时前端用内置清单兜底）。 */
  capabilities: () => api.get<{ key: string }[]>('/roles/capabilities').then((r) => r.data),
  updateCapabilities: (id: string, capabilities: string[]) =>
    api.put<Role>(`/roles/${id}/capabilities`, { capabilities }).then((r) => r.data),
  updateLayouts: (id: string, layouts: string[]) =>
    api.put<Role>(`/roles/${id}/layouts`, { layoutCodes: layouts }).then((r) => r.data),
};

export const permissionsApi = {
  view: (objectType: string, objectId: string) =>
    api.get<PermissionView>(`/permissions`, { params: { objectType, objectId } }).then((r) => r.data),
  save: (objectType: string, objectId: string, breakInheritance: boolean, entries: SavePermissionEntry[]) =>
    api
      .put<PermissionView>(`/permissions`, { breakInheritance, entries }, { params: { objectType, objectId } })
      .then((r) => r.data),
  restoreInheritance: (objectType: string, objectId: string) =>
    api.post(`/permissions/inherit`, null, { params: { objectType, objectId, confirm: true } }),
  check: (objectType: string, objectId: string, right: string) =>
    api
      .get<PermissionCheck>(`/permissions/check`, { params: { objectType, objectId, right } })
      .then((r) => r.data),
};

export const modelsApi = {
  list: (siteId: string) => api.get<ContentType[]>(`/sites/${siteId}/content-types`).then((r) => r.data),
  installVideoPlatformPreset: (siteId: string) =>
    api.post<{
      createdModels: number;
      existingModels: number;
      createdCategories: number;
      existingCategories: number;
      createdRelations: number;
      models: string[];
      categories: string[];
    }>(`/sites/${siteId}/content-types/presets/video-platform`).then((r) => r.data),
  installTravelLuxPreset: (siteId: string) =>
    api.post<{
      createdModels: number;
      existingModels: number;
      createdContents: number;
      existingContents: number;
      createdTheme: boolean;
      createdTemplateProject: boolean;
      createdVisualTemplate: boolean;
      createdPage: boolean;
      themeId: string;
      templateId: string;
      pageId: string;
      routePath: string;
    }>(`/sites/${siteId}/content-types/presets/travel-lux`).then((r) => r.data),
  get: (siteId: string, id: string) => api.get<ContentType>(`/sites/${siteId}/content-types/${id}`).then((r) => r.data),
  contentMenu: (siteId: string) =>
    api.get<ContentType[]>(`/sites/${siteId}/content-types/content-menu`).then((r) => r.data),
  updateContentMenu: (siteId: string, id: string, body: { enabled: boolean; label?: string; order?: number }) =>
    api.put<ContentType>(`/sites/${siteId}/content-types/${id}/content-menu`, body).then((r) => r.data),
  create: (siteId: string, body: unknown) =>
    api.post<ContentType>(`/sites/${siteId}/content-types`, body).then((r) => r.data),
  update: (siteId: string, id: string, body: unknown) => api.put<ContentType>(`/sites/${siteId}/content-types/${id}`, body).then((r) => r.data),
  publish: (siteId: string, id: string, migrationRules?: unknown) =>
    api.post<ContentType>(`/sites/${siteId}/content-types/${id}/publish`, migrationRules === undefined ? {} : { migrationRules }),
  newVersion: (siteId: string, id: string) =>
    api.post<ContentType>(`/sites/${siteId}/content-types/${id}/new-version`).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/content-types/${id}`),
  copy: (siteId: string, id: string, body: { name?: string; code?: string; icon?: string }) =>
    api.post<ContentType>(`/sites/${siteId}/content-types/${id}/copy`, body).then((r) => r.data),
  fieldVariables: (siteId: string, id: string, fieldId: string) =>
    api.get<Record<string, unknown>>(`/sites/${siteId}/content-types/${id}/fields/${fieldId}/variables`).then((r) => r.data),
  saveFieldVariables: (siteId: string, id: string, fieldId: string, variables: Record<string, unknown>) =>
    api.put(`/sites/${siteId}/content-types/${id}/fields/${fieldId}/variables`, variables).then((r) => r.data),
  deleteFieldVariable: (siteId: string, id: string, fieldId: string, key: string) =>
    api.delete(`/sites/${siteId}/content-types/${id}/fields/${fieldId}/variables/${key}`),
  lifecycle: (siteId: string, id: string) =>
    api.get<LifecycleHook[]>(`/sites/${siteId}/content-types/${id}/lifecycle`).then((r) => r.data),
  saveLifecycle: (siteId: string, id: string, event: LifecycleHook['event'], body: Omit<LifecycleHook, 'event'>) =>
    api.put<LifecycleHook>(`/sites/${siteId}/content-types/${id}/lifecycle/${event}`, body).then((r) => r.data),
  testLifecycle: (siteId: string, id: string, event: LifecycleHook['event'], body: { scriptContent: string; testData?: unknown }) =>
    api.post<LifecycleTestResult>(`/sites/${siteId}/content-types/${id}/lifecycle/${event}/test`, body).then((r) => r.data),
  updateConfig: (siteId: string, id: string, body: ContentTypeConfig) =>
    api.put<ContentType>(`/sites/${siteId}/content-types/${id}/config`, body).then((r) => r.data),
  parentCandidates: (siteId: string, id: string) =>
    api.get<ContentType[]>(`/sites/${siteId}/content-types/${id}/parent-candidates`).then((r) => r.data),
  suggestVariableName: (siteId: string, name: string, fieldType: string) =>
    api.post<VariableNameSuggestion>(`/sites/${siteId}/content-types/var-name/suggest`, { name, fieldType }).then((r) => r.data),
  reservedVariableNames: (siteId: string) =>
    api.get<string[]>(`/sites/${siteId}/content-types/var-name/reserved`).then((r) => r.data),
  systemFields: (siteId: string, objectType: string, mediaKind?: string) =>
    api.get<SystemFieldDef[]>(`/sites/${siteId}/content-types/system-fields`, {
      params: { objectType, ...(mediaKind ? { mediaKind } : {}) },
    }).then((r) => r.data),
  previewQuickCreatePath: (siteId: string, destinationPattern: string, values?: Record<string, string>) =>
    api.post<QuickCreatePathPreview>(`/sites/${siteId}/content-types/quick-create/preview`, { destinationPattern, values }).then((r) => r.data),
  renderCustomCode: (siteId: string, id: string, fieldId: string, input: unknown) =>
    api.post<{ valid: boolean; executed: boolean; output?: string; errors?: string[]; message?: string }>(
      `/sites/${siteId}/content-types/${id}/fields/${fieldId}/custom-code/render`, { input }).then((r) => r.data),
  validateCustomCode: (siteId: string, id: string, fieldId: string, input: unknown) =>
    api.post<{ valid: boolean; executed: boolean; output?: string; errors?: string[]; message?: string }>(
      `/sites/${siteId}/content-types/${id}/fields/${fieldId}/custom-code/validate`, { input }).then((r) => r.data),
  tryClassCompose: (
    siteId: string,
    body: {
      compose: unknown;
      roles: Record<string, { code?: string; name?: string; id?: string } | string | null>;
    },
  ) =>
    api
      .post<{
        classNumber?: string;
        classCaption?: string;
        declarativeClassNumber?: string;
        scriptExecuted?: boolean;
        message?: string;
      }>(`/sites/${siteId}/class-compose/try`, body)
      .then((r) => r.data),
};

export const tagsApi = {
  suggestions: (siteId: string, prefix?: string) =>
    api.get<string[]>(`/sites/${siteId}/tags/suggestions`, { params: { prefix: prefix || '' } }).then((r) => r.data),
  cloud: (siteId: string) =>
    api.get<{ tag: string; count: number }[]>(`/sites/${siteId}/tags/cloud`).then((r) => r.data),
};

/**
 * FR-CV-VER-009/010：时间机器只读快照查询。
 *
 * <p>只读接口：`at` 省略时返回服务器当前时刻的快照。写保护不在这里，
 * 而由 `client.ts` 的只读请求头 + 后端拦截器负责（见 §15.5）。</p>
 */
export const timeMachineApi = {
  at: (siteId: string, at?: string | null) =>
    api
      .get<TimeMachineSnapshot>(`/sites/${siteId}/time-machine`, { params: at ? { at } : {} })
      .then((r) => r.data),
};

export const relationsApi = {  list: (siteId: string) => api.get<RelationDef[]>(`/sites/${siteId}/content-relations`).then((r) => r.data),
  create: (siteId: string, body: {
    relationName: string; cardinality: string; sourceTypeId: string; targetTypeId: string; description?: string;
  }) => api.post<RelationDef>(`/sites/${siteId}/content-relations`, body).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/content-relations/${id}`),
  listForContent: (contentId: string) =>
    api.get<ContentRelationGroup[]>(`/content/${contentId}/relations`).then((r) => r.data),
  add: (contentId: string, relationName: string, targetContentId: string) =>
    api.post(`/content/${contentId}/relations/${relationName}`, { targetContentId }).then((r) => r.data),
  removeRelation: (contentId: string, relationName: string, targetId: string) =>
    api.delete(`/content/${contentId}/relations/${relationName}/${targetId}`),
  searchByRelated: (siteId: string, query: string) =>
    api.get<RelatedContent[]>(`/sites/${siteId}/content-relations/search-by-related`, { params: { query } }).then((r) => r.data),
};

export const foldersApi = {
  tree: (siteId: string) => api.get<SiteFolder[]>(`/sites/${siteId}/folders`).then((r) => r.data),
  create: (siteId: string, body: { parentId?: string; title: string; name: string; sortOrder?: number; showOnMenu?: boolean; allowedFileExtensions?: string; defaultFileAssetType?: string }) => api.post<SiteFolder>(`/sites/${siteId}/folders`, body).then((r) => r.data),
  update: (siteId: string, id: string, body: { parentId?: string; title: string; name: string; sortOrder?: number; showOnMenu?: boolean; allowedFileExtensions?: string; defaultFileAssetType?: string }) => api.put<SiteFolder>(`/sites/${siteId}/folders/${id}`, body).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/folders/${id}`),
};

export const categoriesApi = {
  tree: (siteId: string) => api.get<Category[]>(`/sites/${siteId}/categories`).then((r) => r.data),
  create: (siteId: string, body: { name: string; pathAlias: string; parentId?: string | null; sortOrder?: number }) =>
    api.post<Category>(`/sites/${siteId}/categories`, body).then((r) => r.data),
  update: (id: string, body: { name?: string; pathAlias?: string; sortOrder?: number }) =>
    api.put<Category>(`/categories/${id}`, body).then((r) => r.data),
  move: (id: string, body: { targetParentId?: string | null; sortOrder?: number }) =>
    api.post<Category>(`/categories/${id}/move`, body).then((r) => r.data),
  reorder: (siteId: string, body: { parentId?: string | null; orderedIds: string[] }) =>
    api.put(`/sites/${siteId}/categories/reorder`, body),
  remove: (id: string) => api.delete(`/categories/${id}`),
};

export const pagesApi = {
  list: (siteId: string) => api.get<PageInfo[]>(`/sites/${siteId}/pages/tree`).then((r) => r.data),
  updateResource: (siteId: string, pageId: string, body: { expectedVersion: number; title?: string; routePath: string; templatePath?: string; fieldValues?: string; note?: string; createRedirectDraft?: boolean; withdrawPublished?: boolean }) =>
    api.patch<PageResourceUpdateResult>(`/sites/${siteId}/pages/${pageId}`, body).then((r) => r.data),
  impact: (siteId: string, changes: { pageId: string; oldRoutePath: string; newRoutePath: string }[]) =>
    api.post<PageRouteImpactReport>(`/sites/${siteId}/pages/impact`, { changes }).then((r) => r.data),
  previewRedirects: (siteId: string, changes: { pageId: string; oldRoutePath: string; newRoutePath: string }[]) =>
    api.post<PageRedirectPlan>(`/sites/${siteId}/pages/redirects/preview`, { changes }).then((r) => r.data),
  previewMove: (siteId: string, body: { sourcePath: string; targetPath: string; expectedPages: { pageId: string; expectedVersion: number }[] }) =>
    api.post<PageSubtreeMovePlan>(`/sites/${siteId}/pages/move/preview`, body).then((r) => r.data),
  moveSubtree: (siteId: string, body: { sourcePath: string; targetPath: string; expectedPages: { pageId: string; expectedVersion: number }[]; createRedirectDrafts?: boolean }) =>
    api.post<PageSubtreeMovePlan>(`/sites/${siteId}/pages/move`, body).then((r) => r.data),
  renderUrl: (siteId: string, route: string) => `${api.defaults.baseURL}/delivery/sites/${siteId}/pages?route=${encodeURIComponent(route)}`,
};
/** 内容批量操作结果：成功 id 列表 + 失败项（含原因，前端汇总提示而非逐条弹窗）。 */
export interface ContentBatchResult {
  succeeded: string[];
  failed: { id: string; message: string }[];
}

export const contentsApi = {
  search: (siteId: string, params: { contentTypeId?: string; categoryIds?: string[]; status?: string; keyword?: string }) =>
    api.get<ContentItem[]>(`/sites/${siteId}/contents/search`, { params }).then((r) => r.data),
  listByCategory: (categoryId: string) =>
    api.get<ContentItem[]>(`/categories/${categoryId}/contents`).then((r) => r.data),
  listByFolder: (siteId: string, folderId: string) =>
    api.get<ContentItem[]>(`/sites/${siteId}/folders/${folderId}/contents`).then((r) => r.data),
  listByType: (siteId: string, contentTypeId: string) =>
    api.get<ContentItem[]>(`/sites/${siteId}/content-types/${contentTypeId}/contents`).then((r) => r.data),
  get: (id: string, config?: AxiosRequestConfig) =>
    api.get<ContentItem>(`/contents/${id}`, config).then((r) => r.data),
  create: (siteId: string, body: { title: string; categoryId?: string; folderId?: string; contentTypeId: string; routePath?: string; templatePath?: string; fieldValues?: string }) =>
    api.post<ContentItem>(`/sites/${siteId}/contents`, body).then((r) => r.data),
  saveVersion: (id: string, body: { fieldValues: string; note?: string; title?: string; routePath?: string; templatePath?: string; folderId?: string }) =>
    api.post<ContentVersion>(`/contents/${id}/versions`, body).then((r) => r.data),
  updateInlineField: (siteId: string, id: string, body: { fieldCode: string; value: string; expectedVersion: number; format: 'text' | 'html' }) =>
    api.patch<{ contentId: string; contentTypeId: string; fieldCode: string; value: string; previousVersion: number; currentVersion: number; status: string }>(
      `/sites/${siteId}/contents/${id}/inline-field`, body,
    ).then((r) => r.data),
  versions: (id: string, config?: AxiosRequestConfig) =>
    api.get<ContentVersion[]>(`/contents/${id}/versions`, config).then((r) => r.data),
  /** FR-CV-VER-004：恢复到指定版本（「恢复创建新版本」语义，不覆盖历史）。 */
  revertVersion: (id: string, version: number, note?: string) =>
    api.post<ContentVersion>(`/contents/${id}/versions/${version}/revert`, { note }).then((r) => r.data),
  /** FR-CV-VER-008：版本字段级对比（含条目级标题/路径/模板）。 */
  versionDiff: (id: string, from: number, to: number) =>
    api.get<ContentVersionDiff>(`/contents/${id}/versions/diff`, { params: { from, to } }).then((r) => r.data),
  setStatus: (id: string, status: string) => api.post(`/contents/${id}/status`, { status }),
  /** 删除已归档内容：后端级联清除版本/关系/统计等关联数据并同步删除检索索引文档。 */
  remove: (id: string) => api.delete(`/contents/${id}`),
  /** 批量状态流转（提交审核/发布/设为草稿/归档）：逐条成败，部分失败不回滚。 */
  batchStatus: (siteId: string, ids: string[], status: string) =>
    api.post<ContentBatchResult>(`/sites/${siteId}/contents/batch-status`, { ids, status }).then((r) => r.data),
  /** 批量删除：仅已归档条目会被删除，其余逐条报错返回。 */
  batchDelete: (siteId: string, ids: string[]) =>
    api.post<ContentBatchResult>(`/sites/${siteId}/contents/batch-delete`, { ids }).then((r) => r.data),
  publishChecklist: (id: string) =>
    api.get<{ pass: boolean; items: { level: string; code: string; message: string }[] }>(
      `/contents/${id}/publish-checklist`,
    ).then((r) => r.data),
  // 页面自带「批量创建分集失败：<后端原因>」提示，故关闭全局兜底 toast，避免同一失败弹两条
  batchEpisodes: (siteId: string, body: { seasonId: string; startNumber: number; count: number; titlePrefix?: string }) =>
    api.post<ContentItem[]>(`/sites/${siteId}/contents/batch-episodes`, body, { skipGlobalErrorToast: true })
      .then((r) => r.data),
};

/** FR-AI-GEO-004 AI 引用统计（内容详情页「AI 引用表现」面板）。 */
/** 媒体行 → 资产（两条列表通道共用，避免 knoxMediaId/endpointName 映射口径漂移）。 */
const toMediaAsset = (row: { asset: MediaAsset; knoxMediaId: string | null; endpointName: string | null }): MediaAsset => ({
  ...row.asset, knoxMediaId: row.knoxMediaId ?? undefined, endpointName: row.endpointName ?? undefined,
});

export const mediaApi = {
  list: async (siteId: string, params?: { kind?: string; mediaTypeId?: string; q?: string; status?: string; folderPath?: string }) => {
    const rows = await api.get<{
      asset: MediaAsset; knoxMediaId: string | null; endpointName: string | null;
    }[]>(`/sites/${siteId}/media`, { params }).then((r) => r.data);
    return rows.map(toMediaAsset);
  },
  /** 媒体库分页：排序与切页在服务端完成，避免「页内有序、页间乱序」。 */
  page: async (siteId: string, params?: {
    kind?: string; mediaTypeId?: string; q?: string; status?: string; folderPath?: string;
    sort?: string; page?: number; size?: number;
  }) => {
    const data = await api.get<{
      items: { asset: MediaAsset; knoxMediaId: string | null; endpointName: string | null }[];
      total: number; page: number; size: number; hasMore: boolean;
    }>(`/sites/${siteId}/media/page`, { params }).then((r) => r.data);
    return { ...data, items: data.items.map(toMediaAsset) };
  },
  detail: (siteId: string, id: string) =>
    api.get<MediaDetail>(`/sites/${siteId}/media/${id}/detail`).then((r) => r.data),
  register: (siteId: string, body: {
    filename: string; contentHash: string; mimeType: string; fileSize: number; storageKey: string;
  }) => api.post<MediaAsset>(`/sites/${siteId}/media`, body).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/media/${id}`),
  /** 本地存储上传（社区版）：multipart 直传，服务端写入 storage-root 并登记资产。 */
  upload: (siteId: string, file: File, onProgress?: (pct: number) => void, folderPath?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (folderPath) form.append('folderPath', folderPath);
    return api.post<{ assetId: string; status: string }>(`/sites/${siteId}/media/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }).then((r) => r.data);
  },
  /** 按资产替换上传：追加新版本并更新账本字段。 */
  replace: (siteId: string, id: string, file: File, folderPath?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (folderPath) form.append('folderPath', folderPath);
    return api.post<{ assetId: string; status: string }>(`/sites/${siteId}/media/${id}/replace`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
    }).then((r) => r.data);
  },
};

/**
 * FR-AGT-MEDIA-005 站点媒体目录（`media_folder` 物化路径树）。
 * 端点 `/sites/:siteId/media/folders`，站点 `read` 可查、`write` 可建/搬移。
 */
export const mediaFolderApi = {
  tree: (siteId: string) =>
    api.get<MediaFolderView[]>(`/sites/${siteId}/media/folders`).then((r) => r.data),
  get: (siteId: string, folderId: string) =>
    api.get<MediaFolderView>(`/sites/${siteId}/media/folders/${folderId}`).then((r) => r.data),
  create: (siteId: string, body: { name: string; parentId?: string | null; sortOrder?: number }) =>
    api.post<MediaFolderView>(`/sites/${siteId}/media/folders`, body).then((r) => r.data),
  move: (siteId: string, folderId: string, body: { parentId?: string | null }) =>
    api.post<MediaFolderView>(`/sites/${siteId}/media/folders/${folderId}/move`, body).then((r) => r.data),
};

export const workflowApi = {
  list: (siteId: string, config?: AxiosRequestConfig) =>
    api.get<Workflow[]>(`/sites/${siteId}/workflows`, config).then((r) => r.data),
  get: (id: string) => api.get<Workflow>(`/workflows/${id}`).then((r) => r.data),
  create: (siteId: string, body: unknown) =>
    api.post<Workflow>(`/sites/${siteId}/workflows`, body).then((r) => r.data),
  update: (id: string, body: unknown) => api.put<Workflow>(`/workflows/${id}`, body).then((r) => r.data),
  publish: (id: string) => api.post(`/workflows/${id}/publish`),
  deprecate: (id: string) => api.post(`/workflows/${id}/deprecate`),
  newVersion: (id: string) => api.post<Workflow>(`/workflows/${id}/new-version`).then((r) => r.data),
  submit: (contentId: string, workflowId: string, targetStatus: string, assignee: string, scheduledAt?: string) =>
    api.post(`/contents/${contentId}/submit`, { workflowId, targetStatus, assignee, scheduledAt }),
  /** 内容当前状态允许的转换集合（驱动「提交审核」入口的可见性与目标选项）。 */
  availableActions: (contentId: string, config?: AxiosRequestConfig) =>
    api.get<WorkflowActionInfo[]>(`/contents/${contentId}/available-actions`, config).then((r) => r.data),
  /**
   * 待办列表：`siteId` 限定为当前站点 —— 非当前站点、内容已删除或已无权查看的任务后端会过滤掉。
   */
  pendingTasks: (siteId?: string) =>
    api.get<WorkflowTask[]>('/tasks/pending', siteId ? { params: { siteId } } : undefined).then((r) => r.data),
  approve: (taskId: string, comment?: string) =>
    api.post<WorkflowTask>(`/tasks/${taskId}/approve`, comment ? { comment } : {}).then((r) => r.data),
  reject: (taskId: string, reason?: string) =>
    api.post<WorkflowTask>(`/tasks/${taskId}/reject`, { comment: reason }).then((r) => r.data),
  cancel: (taskId: string, comment?: string) =>
    api.post<WorkflowTask>(`/tasks/${taskId}/cancel`, comment ? { comment } : {}).then((r) => r.data),
  delegate: (taskId: string, newAssignee: string) =>
    api.post<WorkflowTask>(`/tasks/${taskId}/delegate`, { newAssignee }).then((r) => r.data),
  notifications: (unreadOnly = false) =>
    api.get<Notification[]>('/me/notifications', { params: { unreadOnly } }).then((r) => r.data),
  unreadCount: () =>
    api.get<{ unreadCount: number }>('/notifications/unread-count').then((r) => r.data.unreadCount),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all').then((r) => r.data),
  preferences: () => api.get<NotificationPreference[]>('/me/notification-preferences').then((r) => r.data),
  savePreferences: (items: NotificationPreference[]) =>
    api.put<NotificationPreference[]>('/me/notification-preferences', items).then((r) => r.data),
  listTemplates: (siteId: string) =>
    api.get<NotificationTemplate[]>(`/sites/${siteId}/notification-templates`).then((r) => r.data),
  getTemplate: (siteId: string, key: string) =>
    api.get<NotificationTemplate>(`/sites/${siteId}/notification-templates/${encodeURIComponent(key)}`).then((r) => r.data),
  saveTemplate: (siteId: string, key: string, body: { subject: string; bodyHtml: string; bodyText?: string }) =>
    api.put<NotificationTemplate>(`/sites/${siteId}/notification-templates/${encodeURIComponent(key)}`, body).then((r) => r.data),
  previewTemplate: (siteId: string, key: string, sample?: Record<string, unknown>) =>
    api.post<{ subject: string; html: string; text: string }>(
      `/sites/${siteId}/notification-templates/${encodeURIComponent(key)}/preview`,
      sample ?? {},
    ).then((r) => r.data),
};

export const releasesApi = {
  list: (siteId: string) => api.get<Release[]>(`/sites/${siteId}/releases`).then((r) => r.data),
  create: (siteId: string, body: { name: string }) =>
    api.post<Release>(`/sites/${siteId}/releases`, body).then((r) => r.data),
  freeze: (id: string) => api.post(`/releases/${id}/freeze`),
  deploy: (id: string) => api.post(`/releases/${id}/deploy`),
  pages: (id: string) => api.get<{ pageId: string; contentVersion: number; compositionVersion?: number; routePath: string; inputDigest: string }[]>(`/releases/${id}/pages`).then((r) => r.data),
  themes: (id: string) => api.get<ReleaseThemeVersion[]>(`/releases/${id}/themes`).then((r) => r.data),
  artifacts: (id: string) => api.get<BuildArtifact[]>(`/releases/${id}/artifacts`).then((r) => r.data),
};

export const pageCompositionApi = {
  // config 供「非 PAGE 内容打开编辑器」这类**预期内**的失败使用（如 QUIET）：后端会回
  // 400「只有 PAGE 类型可以作为页面渲染」，调用方已按空绑定降级，不该再弹全局错误提示。
  get: (siteId: string, pageId: string, config?: AxiosRequestConfig) =>
    api.get<PageComposition>(`/sites/${siteId}/pages/${pageId}/composition`, config).then((r) => r.data),
  renderComponent: (siteId: string, pageId: string, body: { zoneKey: string; index: number; component: PageComponentSpec }) =>
    api.post<{ html: string }>(`/sites/${siteId}/pages/${pageId}/composition/component-preview`, body).then((r) => r.data),
  save: (siteId: string, pageId: string, templateId: string, zones: Record<string, PageComponentSpec[]>, expectedVersion: number) =>
    api.put<PageComposition>(`/sites/${siteId}/pages/${pageId}/composition`, { templateId, zones, expectedVersion }).then((r) => r.data),
  saveLayout: (siteId: string, pageId: string, layoutJson: string, expectedVersion: number) =>
    api.put<PageComposition>(`/sites/${siteId}/pages/${pageId}/composition/layout`, { layoutJson, expectedVersion }).then((r) => r.data),
  unbind: (siteId: string, pageId: string, expectedVersion: number) =>
    api.delete<PageComposition>(`/sites/${siteId}/pages/${pageId}/composition`, { params: { expectedVersion } }).then((r) => r.data),
};

export const sharedComponentsApi = {
  list: (siteId: string, q?: string) => api.get<SharedComponent[]>(`/sites/${siteId}/components`, { params: { q } }).then((r) => r.data),
  create: (siteId: string, body: unknown) => api.post<SharedComponent>(`/sites/${siteId}/components`, body).then((r) => r.data),
  update: (siteId: string, id: string, body: unknown) => api.put<SharedComponent>(`/sites/${siteId}/components/${id}`, body).then((r) => r.data),
  history: (siteId: string, id: string) => api.get<SharedComponentRevision[]>(`/sites/${siteId}/components/${id}/history`).then((r) => r.data),
  restore: (siteId: string, id: string, version: number) => api.post<SharedComponent>(`/sites/${siteId}/components/${id}/restore/${version}`).then((r) => r.data),
  references: (siteId: string, id: string) => api.get(`/sites/${siteId}/components/${id}/references`).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/components/${id}`),
};

export const mvcControllersApi = {
  list: (siteId: string) => api.get<MvcController[]>(`/sites/${siteId}/mvc/controllers`).then((r) => r.data),
  validate: (siteId: string, body: { id?: string; path: string; definition: string }) => api.post<MvcControllerValidation>(`/sites/${siteId}/mvc/controllers/validate`, body).then((r) => r.data),
  create: (siteId: string, body: { path: string; definition: string }) => api.post<MvcController>(`/sites/${siteId}/mvc/controllers`, body).then((r) => r.data),
  update: (siteId: string, id: string, body: { path: string; definition: string }) => api.put<MvcController>(`/sites/${siteId}/mvc/controllers/${id}`, body).then((r) => r.data),
  publish: (siteId: string, id: string, message?: string) => api.post<MvcController>(`/sites/${siteId}/mvc/controllers/${id}/publish`, { message }).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/mvc/controllers/${id}`),
};


export const urlRewritesApi = {
  list: (siteId: string) => api.get<UrlRewriteRule[]>(`/sites/${siteId}/url-rewrites`).then((r) => r.data),
  validate: (siteId: string, body: unknown) => api.post<UrlRewriteValidation>(`/sites/${siteId}/url-rewrites/validate`, body).then((r) => r.data),
  test: (siteId: string, input: string) => api.post<UrlRewriteTestResult>(`/sites/${siteId}/url-rewrites/test`, { input }).then((r) => r.data),
  create: (siteId: string, body: unknown) => api.post<UrlRewriteRule>(`/sites/${siteId}/url-rewrites`, body).then((r) => r.data),
  update: (siteId: string, id: string, body: unknown) => api.put<UrlRewriteRule>(`/sites/${siteId}/url-rewrites/${id}`, body).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/url-rewrites/${id}`),
};

export const visualLayoutApi = {
  themes: (siteId: string, params?: { includeUnrecognized?: boolean }) => api.get<VisualTheme[]>(`/sites/${siteId}/visual/themes`, { params }).then((r) => r.data),
  getTheme: (siteId: string, id: string) => api.get<VisualTheme>(`/sites/${siteId}/visual/themes/${id}`).then((r) => r.data),
  createTheme: (siteId: string, body: { name: string; description?: string; config?: string; status?: string }) =>
    api.post<VisualTheme>(`/sites/${siteId}/visual/themes`, body).then((r) => r.data),
  updateTheme: (siteId: string, id: string, body: { name: string; description?: string; config?: string; status?: string }) =>
    api.put<VisualTheme>(`/sites/${siteId}/visual/themes/${id}`, body).then((r) => r.data),
  importTheme: (siteId: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.post<ThemeImportResult>(`/sites/${siteId}/visual/themes/import`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  themeFiles: (siteId: string, id: string) => api.get<ThemeBrowserFile[]>(`/sites/${siteId}/visual/themes/${id}/files`).then((r) => r.data),
  saveThemeFile: (siteId: string, id: string, body: { path: string; content: string; expectedVersion: number }) => api.put<ThemeBrowserFile>(`/sites/${siteId}/visual/themes/${id}/files`, body).then((r) => r.data),
  exportTheme: (siteId: string, id: string, version?: number) =>
    api.get(`/sites/${siteId}/visual/themes/${id}/export`, { params: { version }, responseType: 'blob' }).then((r) => r.data as Blob),
  themeHistory: (siteId: string, id: string) =>
    api.get<ThemeRevision[]>(`/sites/${siteId}/visual/themes/${id}/history`).then((r) => r.data),
  themeDiff: (siteId: string, id: string, v1: number, v2: number) =>
    api.get<ThemeDiffEntry[]>(`/sites/${siteId}/visual/themes/${id}/diff/${v1}/${v2}`).then((r) => r.data),
  deleteThemeRevision: (siteId: string, id: string, version: number) =>
    api.delete(`/sites/${siteId}/visual/themes/${id}/history/${version}`),
  restoreTheme: (siteId: string, id: string, version: number, message?: string) =>
    api.post<ThemeImportResult>(`/sites/${siteId}/visual/themes/${id}/restore/${version}`, { message }).then((r) => r.data),
  setThemeParent: (siteId: string, id: string, parentThemeId?: string) =>
    api.put<ThemeRevision>(`/sites/${siteId}/visual/themes/${id}/parent`, { parentThemeId: parentThemeId || null }).then((r) => r.data),
  themeShares: (siteId: string, id: string) => api.get<ThemeShare[]>(`/sites/${siteId}/visual/themes/${id}/shares`).then((r) => r.data),
  grantThemeShare: (siteId: string, id: string, consumerSiteId: string, pinnedVersion?: number) =>
    api.put<ThemeShare>(`/sites/${siteId}/visual/themes/${id}/shares`, { consumerSiteId, pinnedVersion }).then((r) => r.data),
  updateThemeShare: (siteId: string, id: string, consumerSiteId: string, pinnedVersion: number) =>
    api.put<ThemeShare>(`/sites/${siteId}/visual/themes/${id}/shares/${consumerSiteId}`, { pinnedVersion }).then((r) => r.data),
  revokeThemeShare: (siteId: string, id: string, consumerSiteId: string) => api.delete(`/sites/${siteId}/visual/themes/${id}/shares/${consumerSiteId}`),
  templates: (siteId: string, params?: { themeId?: string; q?: string }) =>
    api.get<VisualTemplate[]>(`/sites/${siteId}/visual/templates`, { params }).then((r) => r.data),
  getTemplate: (siteId: string, id: string) =>
    api.get<VisualTemplate>(`/sites/${siteId}/visual/templates/${id}`).then((r) => r.data),
  document: (siteId: string, id: string) =>
    api.get<VisualTemplateDocument>(`/sites/${siteId}/visual/templates/${id}/document`).then((r) => r.data),
  createTemplate: (siteId: string, body: { name: string; themeId?: string; description?: string; layoutJson?: string; status?: string; message?: string }) =>
    api.post<VisualTemplate>(`/sites/${siteId}/visual/templates`, body).then((r) => r.data),
  updateTemplate: (siteId: string, id: string, body: { name: string; themeId?: string; description?: string; layoutJson?: string; status?: string; message?: string }) =>
    api.put<VisualTemplate>(`/sites/${siteId}/visual/templates/${id}`, body).then((r) => r.data),
  publishTemplate: (siteId: string, id: string, message?: string) =>
    api.post<VisualTemplate>(`/sites/${siteId}/visual/templates/${id}/publish`, { message }).then((r) => r.data),
  deleteTemplate: (siteId: string, id: string) => api.delete(`/sites/${siteId}/visual/templates/${id}`),
  revisions: (siteId: string, templateId: string) =>
    api.get<VisualTemplateRevision[]>(`/sites/${siteId}/visual/templates/${templateId}/revisions`).then((r) => r.data),
  revisionSnapshot: (siteId: string, templateId: string, version: number) =>
    api.get<string>(`/sites/${siteId}/visual/templates/${templateId}/revisions/${version}/snapshot`).then((r) => r.data),
  diff: (siteId: string, templateId: string, v1: number, v2: number) =>
    api.get<{ path: string; change: string }[]>(`/sites/${siteId}/visual/templates/${templateId}/diff/${v1}/${v2}`).then((r) => r.data),
  restore: (siteId: string, templateId: string, version: number) =>
    api.post<VisualTemplate>(`/sites/${siteId}/visual/templates/${templateId}/restore/${version}`).then((r) => r.data),
  getAcl: (siteId: string, templateId: string) =>
    api.get<VisualTemplateAcl[]>(`/sites/${siteId}/visual/templates/${templateId}/acl`).then((r) => r.data),
  replaceAcl: (siteId: string, templateId: string, entries: VisualTemplateAcl[]) =>
    api.put<VisualTemplateAcl[]>(`/sites/${siteId}/visual/templates/${templateId}/acl`, { entries }).then((r) => r.data),
  containers: (siteId: string) => api.get<VisualContainer[]>(`/sites/${siteId}/visual/containers`).then((r) => r.data),
  getContainer: (siteId: string, id: string) => api.get<VisualContainer>(`/sites/${siteId}/visual/containers/${id}`).then((r) => r.data),
  createContainer: (siteId: string, body: { name: string; config?: string; containerStructures?: ContainerStructure[]; message?: string }) =>
    api.post<VisualContainer>(`/sites/${siteId}/visual/containers`, body).then((r) => r.data),
  updateContainer: (siteId: string, id: string, body: { name: string; config?: string; containerStructures?: ContainerStructure[]; message?: string }) =>
    api.put<VisualContainer>(`/sites/${siteId}/visual/containers/${id}`, body).then((r) => r.data),
  containerRevisions: (siteId: string, id: string) =>
    api.get<VisualContainerRevision[]>(`/sites/${siteId}/visual/containers/${id}/revisions`).then((r) => r.data),
  restoreContainer: (siteId: string, id: string, version: number) =>
    api.post<VisualContainer>(`/sites/${siteId}/visual/containers/${id}/restore/${version}`).then((r) => r.data),
  createZone: (siteId: string, templateId: string, body: { zoneKey: string; containerId?: string; sortOrder?: number; config?: string }) =>
    api.post<VisualTemplate>(`/sites/${siteId}/visual/templates/${templateId}/zones`, body).then((r) => r.data),
  updateZone: (siteId: string, templateId: string, zoneId: string, body: { zoneKey: string; containerId?: string; sortOrder?: number; config?: string }) =>
    api.put<VisualTemplate>(`/sites/${siteId}/visual/templates/${templateId}/zones/${zoneId}`, body).then((r) => r.data),
  deleteZone: (siteId: string, templateId: string, zoneId: string) =>
    api.delete<VisualTemplate>(`/sites/${siteId}/visual/templates/${templateId}/zones/${zoneId}`).then((r) => r.data),
};
export const templatesApi = {
  list: (siteId: string) => api.get<TemplateProject[]>(`/sites/${siteId}/template-projects`).then((r) => r.data),
  create: (siteId: string, body: { name: string; projectType?: string }) =>
    api.post<TemplateProject>(`/sites/${siteId}/template-projects`, body).then((r) => r.data),
  get: (id: string) => api.get<TemplateProject>(`/template-projects/${id}`).then((r) => r.data),
  listFiles: (projectId: string) =>
    api.get<TemplateFile[]>(`/template-projects/${projectId}/files`).then((r) => r.data),
  getFile: (projectId: string, path: string) =>
    api.get<TemplateFile>(`/template-projects/${projectId}/files-content`, { params: { path } }).then((r) => r.data),
  saveFile: (projectId: string, path: string, content: string) =>
    api.put<TemplateFile>(`/template-projects/${projectId}/files`, { path, content }).then((r) => r.data),
  deleteFile: (projectId: string, path: string) =>
    api.delete(`/template-projects/${projectId}/files`, { data: { path } }),
  commit: (projectId: string, author: string, message: string) =>
    api.post<TemplateRevision>(`/template-projects/${projectId}/commits`, { author, message }).then((r) => r.data),
  revisions: (projectId: string) =>
    api.get<TemplateRevision[]>(`/template-projects/${projectId}/revisions`).then((r) => r.data),
  restore: (projectId: string, version: number) =>
    api.post(`/template-projects/${projectId}/restore/${version}`),
  lockfileStatus: (projectId: string) =>
    api.get<LockfileStatus>(`/template-projects/${projectId}/lockfile-status`).then((r) => r.data),
  preflight: (projectId: string) =>
    api.get<{ pass: boolean; items: string[] }>(`/template-projects/${projectId}/preflight-release`).then((r) => r.data),
  audit: (projectId: string) =>
    api.get<DependencyReport>(`/template-projects/${projectId}/dependency-audit`).then((r) => r.data),
};

export const buildsApi = {
  list: (projectId: string) => api.get<BuildJob[]>(`/template-projects/${projectId}/build-jobs`).then((r) => r.data),
  create: (body: { projectId: string; revision: number; jobType?: string; releaseId?: string }) =>
    api.post<BuildJob>('/build-jobs', body).then((r) => r.data),
  get: (id: string) => api.get<BuildJob>(`/build-jobs/${id}`).then((r) => r.data),
  start: (id: string) => api.post<BuildJob>(`/build-jobs/${id}/start`).then((r) => r.data),
  cancel: (id: string) => api.post<BuildJob>(`/build-jobs/${id}/cancel`).then((r) => r.data),
  logs: (id: string) => api.get<BuildLog[]>(`/build-jobs/${id}/logs`).then((r) => r.data),
};

export const deployApi = {
  listTargets: (siteId: string) =>
    api.get<DeployTarget[]>(`/sites/${siteId}/deploy-targets`).then((r) => r.data),
  createTarget: (siteId: string, body: { name: string; targetType: string; config: string }) =>
    api.post<DeployTarget>(`/sites/${siteId}/deploy-targets`, body).then((r) => r.data),
  removeTarget: (id: string) => api.delete(`/deploy-targets/${id}`),
  listDeployments: (siteId: string) =>
    api.get<Deployment[]>(`/sites/${siteId}/deployments`).then((r) => r.data),
  createDeployment: (siteId: string, body: unknown) =>
    api.post<Deployment>(`/sites/${siteId}/deployments`, body).then((r) => r.data),
  publish: (id: string) => api.post<Deployment>(`/deployments/${id}/publish`).then((r) => r.data),
  advance: (id: string, status: string) => api.post(`/deployments/${id}/advance`, { status }),
  rollback: (id: string) => api.post<Deployment>(`/deployments/${id}/rollback`).then((r) => r.data),
  cancel: (id: string) => api.post(`/deployments/${id}/cancel`),
};

export const packagesApi = {
  list: () => api.get<SitePackage[]>('/site-packages').then((r) => r.data),
  /** FR-PACKAGE-005：导入前预检（无副作用），返回校验违规与冲突报告。 */
  precheck: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<SitePackagePrecheckReport>('/site-packages/precheck', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  import: (file: File, conflictStrategy?: string, conflictsToken?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (conflictStrategy) form.append('conflictStrategy', conflictStrategy);
    if (conflictsToken) form.append('conflictsToken', conflictsToken);
    return api.post<{ siteId: string; packageId: string; siteKey: string }>('/site-packages/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  export: (siteId: string) =>
    api.get(`/sites/${siteId}/export`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

export const searchApi = {
  search: (siteId: string, q: string) =>
    api.post<{ results: Record<string, unknown>[]; total: number }>(`/sites/${siteId}/search`, { query: q }).then((r) => r.data),
  /** 分页检索：排序 + 字段级过滤 + 游标分页 + 高亮（社区版为 BM25）。 */
  query: (siteId: string, body: {
    query: string;
    statuses?: string[];
    sort?: { field: string; order?: 'asc' | 'desc' }[];
    filters?: Record<string, string[]>;
    cursor?: string;
  }) =>
    api.post<{
      hits: { contentId: string; title: string; status?: string | null; highlight?: Record<string, string[]> | null }[];
      nextCursor?: string | null;
    }>(`/sites/${siteId}/search/query`, body).then((r) => r.data),
  rebuild: (siteId: string) => api.post(`/sites/${siteId}/search/rebuild`),
  /**
   * FR-MODEL-006：访客索引重建（**system-admin + 交互式会话**，`/public/rebuild`）。
   *
   * <p>模型属性变更会同时让管理索引与访客索引的字段级映射过期，只重建管理索引的话
   * `mapping-state.rebuildRequired`（两侧并集）依旧为真 —— 所以「立即重建」必须两侧都做。
   */
  rebuildPublic: (siteId: string) => api.post(`/sites/${siteId}/search/public/rebuild`),
  /**
   * FR-MODEL-006 / TC-M66-023：字段级索引映射基线状态。
   * `rebuildRequired=true` 表示模型属性变更后索引 mapping 已过期，排序/过滤会失效，需重建。
   */
  mappingState: (siteId: string) =>
    api.get<{
      targets: { target: string; appliedFingerprint?: string | null; desiredFingerprint?: string | null; rebuildRequired: boolean; appliedAt?: string | null }[];
      rebuildRequired: boolean;
    }>(`/sites/${siteId}/search/mapping-state`).then((r) => r.data),
};

const previewBaseUrl = (import.meta.env.VITE_PREVIEW_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

export const previewOrigin = new URL(previewBaseUrl).origin;

export const previewApi = {
  token: (siteId: string) =>
    api.post<{ token: string; expiresAt: string }>(`/preview/token?siteId=${siteId}`).then((r) => r.data),
  drafts: (token: string) =>
    api.get(`/preview/content`, { params: { token } }).then((r) => r.data),
  pageUrl: (token: string, route: string) => {
    const url = new URL('/api/v1/preview/page', previewBaseUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('route', route);
    return url.toString();
  },
  editPageUrl: (token: string, route: string, nonce: string) => {
    const url = new URL('/api/v1/preview/page', previewBaseUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('route', route);
    url.searchParams.set('mode', 'edit');
    url.searchParams.set('uveNonce', nonce);
    return url.toString();
  },  url: (token: string, route: string, device: string) => {
    const url = new URL('/api/v1/preview/content', previewBaseUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('route', route);
    url.searchParams.set('device', device);
    return url.toString();
  },
};



export const widgetsApi = {
  list: (siteId: string) => api.get<WidgetDefinition[]>(`/sites/${siteId}/widgets`).then((r) => r.data),
  save: (siteId: string, body: { code: string; name: string; controllerDefinition: string; parameterSchema: string }) => api.post<WidgetDefinition>(`/sites/${siteId}/widgets`, body).then((r) => r.data),
  publish: (siteId: string, id: string) => api.post<WidgetDefinition>(`/sites/${siteId}/widgets/${id}/publish`).then((r) => r.data),
  remove: (siteId: string, id: string) => api.delete(`/sites/${siteId}/widgets/${id}`),
};

export const cssClassesApi = { list: (siteId: string) => api.get<{classes:string[];warnings:string[]}>(`/sites/${siteId}/css-classes`).then((r) => r.data) };

export const cacheOpsApi = { stats: () => api.get<{sizes:Record<string,number>;hits:number;misses:number}>(`/delivery/render-cache/stats`).then(r=>r.data), clear:(region:string)=>api.post(`/delivery/render-cache/clear?region=${region}`), warm:(siteId:string)=>api.post(`/sites/${siteId}/render-cache/warmup`), status:(siteId:string)=>api.get<{state:string;loaded:number;message?:string}>(`/sites/${siteId}/render-cache/warmup`).then(r=>r.data) };

/** AI 配置管理（模型 / 站点策略 / 配额 / 用量）。 */
