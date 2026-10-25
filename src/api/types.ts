export interface Site {
  id: string;
  siteKey: string;
  name: string;
  description?: string;
  defaultLocale?: string;
  timezone?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  environments?: { id: string; name: string; type: string }[];
}

/** 删除预览阻断项（外部引用）；前端按 code 本地化，message 为中文兜底。 */
export interface SiteDeletionBlocker {
  code: string;
  message: string;
  count: number;
}

/** 归档站点删除预览：影响面计数 + 阻断项 + 是否可删。 */
export interface SiteDeletionPreview {
  siteId: string;
  status: string;
  impact: Record<string, number>;
  blockers: SiteDeletionBlocker[];
  deletable: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  status: string;
  /** BACKEND / FRONTEND */
  kind?: string;
  homeSiteId?: string | null;
  failedLogins?: number;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  /** 最近一次登录通道：BACKEND / FRONTEND */
  lastLoginMode?: string | null;
  createdAt: string;
  roles?: UserRoleAssignment[];
}

export interface UserRoleAssignment {
  roleId: string;
  roleCode: string;
  roleName: string;
  siteId?: string | null;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  builtIn?: boolean;
  scope?: string;
  capabilities?: string[];
  /** 绑定的后台工具布局 code 列表（spec 6.1/8.7）。 */
  layouts?: string[];
  /** 会员档展示顺序。空表示站点/后台角色，访问判定不比较这个数字。 */
  tierLevel?: number | null;
}

export interface MeProfile {
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  status: string;
  /** BACKEND / FRONTEND */
  kind: string;
  /** 当前会话登录通道：BACKEND / FRONTEND */
  loginMode: string;
  organizationRoles: string[];
  /** 后台工具布局 code 列表（菜单渲染） */
  layouts: string[];
  sites: {
    siteId: string;
    siteKey?: string;
    siteName?: string;
    roles: string[];
    capabilities: string[];
  }[];
}

export interface ApiToken {
  id: string;
  publicId: string;
  name: string;
  siteId?: string | null;
  scopes: string[];
  expiresAt: string;
  allowedFrom?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  token?: string;
}

/** 管理端全量 Token 视图（FR-AGT-MCP-004）：含属主用户名。 */
export interface AdminApiTokenView {
  token: ApiToken;
  ownerUsername: string;
  createdByName?: string | null;
}

/** OAuth 客户端管理视图（FR-AGT-MCP-013）：不含 client_secret。 */
export interface OAuthClientAdminView {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  revokedAt?: string | null;
  createdAt: string;
}

/** OAuth 客户端创建响应：client_secret 仅此一次返回明文。 */
export interface OAuthClientCreatedView extends OAuthClientAdminView {
  clientSecret?: string;
}

export interface SiteMember {
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  status: string;
  roles: UserRoleAssignment[];
}

export interface SiteAuthorizationPolicy {
  siteId: string;
  peerReviewRequired: boolean;
  reviewerCanWrite: boolean;
  publisherCanWrite: boolean;
  /** FR-AI-GOV-004：AI 参与内容是否可直接发布（false = 必须经审批）。 */
  agentDirectPublish: boolean;
  /** 会员自助注册是否需要审核。关闭时注册成功即可登录。 */
  memberRegistrationReview?: boolean;
}

/** spec 9.7 / 5.5：组织安全与品牌配置。 */
export interface OrganizationSettings {
  /** USERNAME | EMAIL */
  loginIdentifier?: string | null;
  portalUrl?: string | null;
  mailDomain?: string | null;
  fromEmail?: string | null;
  defaultLanguage?: string | null;
  defaultTimezone?: string | null;
  /** JSON：backendPrimaryColor / backendSecondaryColor / loginBackground */
  branding?: string | null;
}

export interface BrandingConfig {
  backendPrimaryColor?: string;
  backendSecondaryColor?: string;
  loginBackground?: string;
}

/** spec 5.3：用户引用摘要（禁用前迁移）。 */
export interface UserReferenceSummary {
  userId: string;
  ownedContents: number;
  pendingTasks: number;
  hasReferences: boolean;
}

/** 会员详情（spec 9.1.1）：核心字段 + system.frontend-user 资料。 */
export interface FrontendUserDetail {
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  status: string;
  profile: Record<string, unknown>;
}

export type PermissionPrincipalType = 'ROLE' | 'USER';

export interface SavePermissionEntry {
  principalType: PermissionPrincipalType;
  principalId: string;
  permissions: string[];
}

export interface PermissionEntry {
  principalType: PermissionPrincipalType;
  principalId: string;
  permissions: string[];
}

export interface PermissionView {
  objectType: string;
  objectId: string;
  /** 当前对象是否仍继承父级权限。 */
  inherit: boolean;
  /** 继承来源对象类型（无来源=回退站点能力）。 */
  sourceType?: string | null;
  sourceId?: string | null;
  /** 直接 ACL（本对象个别授权）。 */
  directAcl: PermissionEntry[];
  /** 有效 ACL（含继承后的生效结果）。 */
  effectiveAcl: PermissionEntry[];
}

export interface PermissionCheck {
  objectType: string;
  objectId: string;
  right: string;
  granted: boolean;
}

export interface ContentType {
  id: string; code: string; name: string; description?: string; version: number; status: string;
  templateType: 'PAGE' | 'COMPONENT' | 'SECTION'; objectType?: 'PAGE' | 'COMPONENT' | 'SHARED' | 'MEDIA' | 'FORM';
  isSystem?: boolean;
  displayTemplate?: string; icon?: string; thumbnail?: string; previewImage?: string; publishedVersion?: number;
  controllerPath?: string; formController?: string; mergeStrategy?: 'NONE' | 'MERGE_FIELDS' | 'MERGE_DATA'; parentTypeId?: string;
  quickCreate?: boolean; destinationPattern?: string; config?: ContentTypeConfig; flattenComponents?: boolean;
  subtype?: 'WIDGET' | 'FORM' | null; formNotificationEmails?: string;
  contentMenuEnabled?: boolean; contentMenuLabel?: string; contentMenuOrder?: number;
  schemaOrgType?: string;
  layout?: LayoutElement[]; fields?: FieldDef[];
}
export interface FieldDef {
  id?: string; code: string; name: string; fieldType: string; required: boolean; sortOrder: number; groupName?: string;
  helpText?: string; defaultValue?: string; readOnly: boolean; validation?: Record<string, unknown> | string; fieldConfig?: Record<string, unknown>; conditionExpr?: string;
  i18n: boolean; adminIndex: boolean; publicIndex: boolean; sensitive?: boolean; sortable: boolean; filterable: boolean; highlight: boolean;
  uniqueField?: boolean; isSystem?: boolean; systemFieldType?: string; fieldVariables?: Record<string, unknown>;
}
export interface ContentTypeConfig {
  pathIncludes?: string[]; pathExcludes?: string[];
  deleteDependencies?: { pattern: string; removeEmptyFolder?: boolean }[];
  copyDependencies?: { pattern: string; target?: string }[];
  cdataEscapedFieldPatterns?: string[];
}
export interface LifecycleHook {
  event: 'CREATE' | 'UPDATE' | 'COPY' | 'DELETE' | 'WEBHOOK'; scriptContent: string; scriptLang?: string; timeoutMs?: number; enabled?: boolean;
  /** WEBHOOK 事件监听白名单（逗号分隔 Knox webhook 事件，空 = 监听全部） */
  listenEvents?: string;
}
export interface LifecycleTestResult { success: boolean; output?: unknown; errors?: string[] }
export interface VariableNameSuggestion { variableName: string; reserved?: boolean; warnings?: string[] }
export interface SystemFieldDef { code: string; name: string; fieldType: string; systemFieldType: string }
export interface QuickCreatePathPreview { path: string; collisionResolved?: boolean }

export interface RelationDef {
  id: string; siteId: string; relationName: string; cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
  sourceTypeId: string; targetTypeId: string; description?: string; createdBy?: string;
}

export interface ContentRelationGroup {
  relationName: string; cardinality?: string;
  outgoing: { id: string; title?: string }[];
  incoming: { id: string; title?: string }[];
}

/** 关联内容查询结果中的一条关系路径（DEF-SEARCH-03）。 */
export interface RelatedRelationLink {
  relationName: string | null;
  cardinality?: string | null;
  /** 相对被查询锚点：outgoing=锚点指向该内容；incoming=该内容指向锚点。 */
  direction: 'outgoing' | 'incoming';
}

/** `GET /content-relations/search-by-related` 的单条结果（DEF-SEARCH-03 起含方向与关系类型）。 */
export interface RelatedContent {
  id: string;
  title?: string;
  relations: RelatedRelationLink[];
  /** 聚合方向：outgoing / incoming / both。 */
  direction: 'outgoing' | 'incoming' | 'both';
}

export interface LayoutElement {
  elementId?: string; elementType: 'FIELD' | 'FORM_SECTION' | 'REPEAT_GROUP' | 'TAB' | 'LINE_DIVIDER'; sortOrder: number;
  config?: Record<string, unknown>; field?: FieldDef; children?: LayoutElement[];
}
export interface SiteFolder {
  id: string; siteId: string; parentId?: string; title: string; name: string; path: string; sortOrder: number;
  showOnMenu: boolean; allowedFileExtensions?: string; defaultFileAssetType: 'FILE' | 'IMAGE' | 'PAGE';
  createdAt: string; updatedAt: string; children: SiteFolder[];
}

export interface Category {
  id: string;
  parentId?: string;
  name: string;
  pathAlias: string;
  sortOrder: number;
  depth: number;
  children?: Category[];
}

export interface ContentItem {
  id: string;
  siteId: string;
  categoryId?: string;
  folderId?: string;
  contentTypeId: string;
  title: string;
  status: string;
  currentVersion: number;
  routePath?: string;
  templatePath?: string;
  objectType?: 'PAGE' | 'COMPONENT' | 'SHARED';
  createdBy?: string;
  /** OBS-11-04：后端解析后的创建者用户名（AI 批量建稿的 actor 是用户 ID，界面按 createdByName || createdBy 回退）。 */
  createdByName?: string | null;
  createdAt: string;
  /** FR-AI-GOV-001：AI 参与（生成/修改）标识。 */
  aiGenerated?: boolean;
  aiModel?: string;
  aiPromptVersion?: number;
  aiGeneratedAt?: string;
  /** 列表缩略图/列表视图预览图：内容模型图片字段的原值（资产编号/mediaRef/URL），空=无预览图。 */
  previewImage?: string;
}

export interface ContentVersion {
  id: string;
  version: number;
  fieldValues: string;
  modelVersion: number;
  note?: string;
  createdBy?: string;
  /** OBS-11-04：后端解析后的作者用户名（AI 版本 actor 存的是用户 ID，故这里给出展示名）。 */
  createdByName?: string | null;
  aiGenerated?: boolean;
  aiModel?: string;
  aiPromptVersion?: number;
  createdAt: string;
  /** FR-CV-VER-001/003：条目级系统字段快照（标题 / 页面路径 / 页面模板）。 */
  title?: string;
  routePath?: string;
  templatePath?: string;
  /** OBS-11-10：本版本由「恢复到 v{n}」产生时的来源版本号（非恢复版本为 null）。 */
  revertedFrom?: number | null;
  /** DEF-11-02：本版本由「发布」动作生成（版本历史中的发布节点；普通保存/恢复为 false）。 */
  published?: boolean;
}

/** FR-CV-VER-008：版本字段级对比结果；`field` 为模型字段码或 title/routePath/templatePath。 */
export interface ContentVersionDiff {
  fromVersion: number;
  toVersion: number;
  changedFields: number;
  /** 规范 §15.4「未变 N」：参与比对但取值相同的字段数（模型字段 + 条目级三个系统字段）。 */
  unchangedFields?: number;
  changes: {
    field: string;
    changeType: 'ADDED' | 'REMOVED' | 'MODIFIED' | string;
    before?: string;
    after?: string;
  }[];
}

/** FR-CV-VER-009：时间机器快照里的一条内容（条目身份 + 该时刻生效版本的内容）。 */
export interface TimeMachineSnapshotItem {
  id: string;
  categoryId?: string | null;
  folderId?: string | null;
  contentTypeId?: string | null;
  contentTypeCode?: string | null;
  contentTypeName?: string | null;
  title?: string | null;
  routePath?: string | null;
  templatePath?: string | null;
  /** 该时刻生效的版本号（该条目在时间点之前保存的最后一个版本）。 */
  version: number;
  modelVersion: number;
  versionCreatedAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
  fieldValues: string;
  /**
   * 条目的**当前**状态。状态流转未纳入版本快照，故只作参考，
   * 不承诺等于所浏览时刻的状态（界面上如实标注为「当前状态」）。
   */
  currentStatus?: string | null;
}

/** FR-CV-VER-009：某时刻的站点快照。 */
export interface TimeMachineSnapshot {
  at: string;
  /** 站内内容最早的创建时间：快照为空且晚于 `at` 时即可给出「该时间点早于内容创建时间」。 */
  earliestContentCreatedAt?: string | null;
  total: number;
  /** 站点当前存在、但在 `at` 时刻尚未创建（或尚无版本）的条数。 */
  notYetCreated: number;
  items: TimeMachineSnapshotItem[];
}

export interface MediaAsset {
  id: string;
  siteId: string;
  title: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  currentVersion: number;
  status?: 'ACTIVE' | 'PROCESSING' | 'FAILED' | 'ARCHIVED';
  source?: 'KNOX' | 'LOCAL' | 'EXTERNAL';
  ownerSiteId?: string;
  folderPath?: string;
  routePath?: string;
  templatePath?: string;
  objectType?: 'PAGE' | 'COMPONENT' | 'SHARED';
  kind?: 'video' | 'audio' | 'image' | 'document' | 'font' | 'other';
  mediaTypeCode?: string;
  mediaTypeName?: string;
  metadata?: string;
  /** FR-KNX-030 列表行增强：Knox 映射 ID 与所在端点名。 */
  knoxMediaId?: string;
  endpointName?: string;
}

/** 媒体库详情抽屉数据（FR-KNX-030）。 */
export interface MediaDetail {
  asset: MediaAsset;
  knoxMediaId: string | null;
  endpointName: string | null;
  processingSteps: string[];
  versions: {
    version: number;
    filename: string;
    mimeType: string | null;
    fileSize: number;
    contentHash: string;
    storedAt: string;
    artifactsJson: string | null;
  }[];
  references: { contentType: string; contentId: string; title: string; fieldCode?: string }[];
  playPlan: string | null;
  playbackJson: string | null;
  /**
   * 封面地址（`/media-thumb/{siteId}/{assetId}` 本站代理）。音频/字体无封面时为 `null`。
   * 绝对地址复制见抽屉内 `absUrl()`（外链引用必须是绝对地址）。
   */
  posterUrl: string | null;
  /** 进度条预览雪碧图（本站 `/media-sprite/...` 代理），仅 `previewStatus === 'ready'` 时非空。 */
  spriteUrl: string | null;
  /** 配套 WebVTT 缩略图索引（`/media-vtt/...` 代理），与 `spriteUrl` 同生同灭。 */
  thumbsVttUrl: string | null;
  /** Knox 预览产物状态：disabled / waiting / running / ready / failed；`null` = 未接入或探测失败。 */
  previewStatus: string | null;
  /** 切片规格是否与内置 PowerPlayer 契约一致（160×90、每 10 秒一帧、10 列）；不一致时播放代码不自动启用悬停预览。 */
  previewPowerPlayerReady: boolean;
}

/** FR-KNX-051 按资产替换上传结果。 */
export interface MediaFolderView {
  id: string;
  siteId: string;
  parentId: string | null;
  name: string;
  /** 物化路径，形如 `/images/2026`；根目录为 `/`。 */
  path: string;
  sortOrder: number;
  /** 路径段数推导的层级（根为 0）。 */
  depth: number;
  /** 直属该目录的资产数（不含子目录）。 */
  directAssetCount: number;
  /** 含子目录的累计资产数。 */
  totalAssetCount: number;
  createdAt: string;
  updatedAt: string;
}

/** FR-AI-MEDIA-001 转写稿视图（CMS 侧承接：Knox 字幕 cues 拼接回写，可编辑）。 */
export interface Workflow {
  id: string;
  siteId?: string;
  name: string;
  description?: string;
  version?: number;
  status: string;
  system?: boolean;
  timeoutMinutes?: number;
  reminderIntervalMinutes?: number;
  timeoutActionKey?: string;
  transitions?: WorkflowTransition[];
}

export interface WorkflowTransition {
  id?: string;
  sourceStatus: string;
  targetStatus: string;
  allowedRoleId?: string | null;
  requiredComment?: boolean;
  sortOrder?: number;
  minApprovers?: number;
}

/** 内容当前状态允许的工作流转换（`GET /contents/{id}/available-actions`）。 */
export interface WorkflowActionInfo {
  sourceStatus: string;
  targetStatus: string;
  requiredComment?: boolean;
}

export interface WorkflowTask {
  id: string;
  contentItemId: string;
  contentVersion: number;
  /** 内容标题（后端随待办返回；内容已删除时为 null，列表回退展示编号）。 */
  contentTitle?: string | null;
  /** 内容模型 id（点击标题打开只读审核弹窗时按该模型布局渲染字段）。 */
  contentTypeId?: string | null;
  sourceStatus: string;
  targetStatus: string;
  assignee?: string;
  submitter?: string;
  status: string;
  comment?: string;
  createdAt: string;
  scheduledAt?: string;
  executionState?: string;
  confirmedApprovers?: number;
  requiredApprovers?: number;
  delegatedFrom?: string;
}

export interface Notification {
  id: string;
  type?: string;
  title: string;
  body?: string;
  read: boolean;
  level?: string;
  link?: string;
  createdAt: string;
}

export interface NotificationPreference {
  eventType: string;
  channel: string;
  enabled: boolean;
}

export interface NotificationTemplate {
  id: string;
  siteId?: string | null;
  key: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  overlay: boolean;
  updatedAt?: string;
}

export interface Release {
  id: string;
  siteId: string;
  name: string;
  status: string;
  templateProjectId?: string;
  templateRevision?: number;
  inputDigest?: string;
  frozenAt?: string;
  contents?: { contentItemId: string; version: number }[];
  createdAt: string;
}

export interface ReleaseThemeVersion { revisionId: string; themeId: string; themeVersion: number; ownerSiteId: string; source: 'OWNED' | 'SHARED'; referenceRole: 'ROOT' | 'PARENT'; fileDigest: string; }

export interface BuildArtifact { id: string; buildJobId: string; releaseId: string; artifactPath: string; fileCount: number; sizeBytes: number; routeManifest?: string; fileManifest?: string; inputDigest?: string; buildType: string; createdAt: string; }

export interface PageInfo {
  id: string;
  title: string;
  routePath?: string;
  templatePath?: string;
  status: string;
  contentTypeId: string;
  folderId?: string;
  currentVersion: number;
  updatedAt: string;
  /** 列表缩略图/列表视图预览图：内容模型图片字段的原值，空=无预览图（前端回退默认图）。 */
  previewImage?: string;
}
export interface PageResourceUpdateResult {
  id: string; siteId: string; title: string; oldRoutePath?: string; routePath: string; status: string; currentVersion: number;
}
export interface PageRouteImpactReport {
  scannedContentItems: number; contentReferences: number; rewriteReferences: number; truncated: boolean;
  references: { kind: 'CONTENT_FIELD' | 'URL_REWRITE'; objectId: string; title: string; matchedRoute: string; detail: string }[];
}
export interface PageRedirectPlan {
  valid: boolean; errors: string[];
  proposals: { pageId: string; name: string; pattern: string; replacement: string }[];
}
export interface PageSubtreeMovePlan {
  sourcePath: string; targetPath: string; valid: boolean; errors: string[];
  changes: { pageId: string; title: string; oldRoutePath: string; newRoutePath: string; status: string; currentVersion: number }[];
  impact: PageRouteImpactReport; redirects: PageRedirectPlan;
}
export interface PageComponentSpec {
  id: string; kind: 'EMBEDDED' | 'CONTENT' | 'SHARED'; sharedComponentId?: string; sharedVersion?: number;
  contentItemId?: string; contentVersion?: number;
  componentTypeId?: string; title?: string; data: Record<string, unknown>; templatePath?: string;
  containerId?: string; additionalModel: Record<string, unknown>; order: number;
}
export interface SharedComponent { id: string; siteId: string; path: string; title: string; contentTypeId: string; data: Record<string, unknown>; templatePath?: string; status: string; currentVersion: number; lockVersion: number; createdBy?: string; createdAt: string; updatedAt: string; }
export interface SharedComponentRevision { id: string; version: number; parentVersion?: number; author?: string; message?: string; createdAt: string; }
export interface PageComposition { id?: string; pageId: string; templateId?: string; zones: Record<string, PageComponentSpec[]>; version: number; updatedBy?: string; updatedAt?: string; }
export interface VisualTheme {
  id: string; siteId: string; ownerSiteId: string; source: 'OWNED' | 'SHARED'; shared: boolean; readOnly: boolean; pinnedVersion?: number; name: string; description?: string; config: string; status: string; manifestVersion?: string; vendor?: string; cmsVersionRange?: string; validity?: string; warnings?: string; currentVersion: number; parentThemeId?: string; parentVersion?: number; createdAt: string; updatedAt: string;
}
export interface ThemeShare { id: string; themeId: string; consumerSiteId: string; pinnedVersion: number; status: 'ACTIVE' | 'REVOKED'; createdBy?: string; createdAt: string; updatedAt: string; }
export interface ThemeFileDigest { path: string; mediaType: string; size: number; sha256: string; }
export interface ThemeBrowserFile { path: string; mediaType: string; size: number; sha256: string; content?: string; editable: boolean; version: number; }
export interface ThemeImportResult {
  themeId: string; version: number; validity: string; manifest: { name: string; version: string; vendor: string; cmsVersionRange: string };
  warnings: string[]; files: ThemeFileDigest[];
}
export interface ThemeRevision { id: string; themeId: string; version: number; parentVersion?: number; parentThemeId?: string; parentThemeVersion?: number; author?: string; message?: string; manifestSnapshot: string; fileDigest: string; createdAt: string; }
export interface ThemeDiffEntry { path: string; change: 'ADDED' | 'MODIFIED' | 'DELETED'; fromSha256?: string; toSha256?: string; }
export interface ContainerStructure {
  id?: string; structureId: string; contentTypeVar?: string; contentTypeName?: string; code: string; sortOrder: number;
}
export interface VisualContainer {
  id: string; siteId: string; name: string; allowedComponentTypes: string; config: string; currentVersion: number;
  containerStructures: ContainerStructure[]; createdAt: string; updatedAt: string;
}
export interface VisualDropZone {
  id: string; templateId: string; zoneKey: string; containerId?: string; sortOrder: number; config: string;
}
export interface VisualTemplate {
  id: string; siteId: string; themeId?: string; name: string; description?: string; layoutJson: string; status: string;
  currentVersion?: number; zones: VisualDropZone[]; anonymous?: boolean; createdAt: string; updatedAt: string;
}
export interface VisualContainerRevision { id: string; containerId: string; version: number; parentVersion?: number; author?: string; message?: string; createdAt: string; }
export interface VisualTemplateRevision {
  id: string; templateId: string; version: number; parentVersion?: number; author?: string; message?: string; createdAt: string;
}
export interface VisualTemplateAcl {
  roleCode: string; canView: boolean; canUse: boolean; canEdit: boolean; canPublish: boolean;
}
export interface VisualTemplateDocument {
  id: string; siteId: string; themeId?: string; name: string; description?: string; status: string;
  currentVersion: number; layoutJson: string; zones: VisualDropZone[]; permissions: VisualTemplateAcl[];
  createdAt: string; updatedAt: string;
}
export interface TemplateProject {
  id: string;
  siteId: string;
  name: string;
  projectType: string;
  runtimeImage: string;
  currentRevision: number;
  createdAt: string;
}

export interface TemplateFile {
  path: string;
  content: string;
  hash: string;
  updatedAt: string;
}

export interface TemplateRevision {
  id: string;
  version: number;
  parentVersion?: number;
  author?: string;
  message?: string;
  fileSnapshot: string;
  createdAt: string;
}

export interface BuildJob {
  id: string;
  projectId: string;
  revision: number;
  releaseId?: string;
  jobType: string;
  status: string;
  artifactUrl?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface BuildLog {
  id: number;
  seq: number;
  level: string;
  line: string;
  createdAt: string;
}

export interface DeployTarget {
  id: string;
  siteId: string;
  name: string;
  targetType: string;
  config: string;
  createdAt: string;
}

export interface Deployment {
  id: string;
  siteId: string;
  releaseId: string;
  deployTargetId: string;
  artifactId?: string;
  buildType: string;
  status: string;
  healthCheckBefore?: string;
  healthCheckAfter?: string;
  note?: string;
  startedAt?: string;
  finishedAt?: string;
  scheduledAt?: string;
  deployedBy?: string;
  createdAt: string;
}

export interface SitePackage {
  id: string;
  packageId: string;
  name: string;
  version: string;
  importedSiteId?: string;
  importedAt?: string;
  createdAt: string;
}

/** FR-PACKAGE-005：预检报告中的校验违规项。 */
export interface SitePackageViolation {
  code: string;
  severity: 'BLOCKING' | 'WARN';
  object: string;
  detail: string;
}

/** FR-PACKAGE-005：预检报告中的冲突项。 */
export interface SitePackageConflict {
  type: string;
  objectType: string;
  objectKey: string;
  severity: 'BLOCKING' | 'CONFIRMABLE' | 'WARN';
  resolutions: string[];
  detail: string;
}

/** 预检签发的一种处理策略及其确认令牌（导入时原样回传）。 */
export interface SitePackageResolution {
  strategy: string;
  token: string;
}

export interface SitePackageSignatureInfo {
  policy: string;
  present: boolean;
  algorithm?: string;
  keyId?: string;
  verified: boolean;
  detail: string;
}

/** 站点包导入预检报告（FR-PACKAGE-005）。 */
export interface SitePackagePrecheckReport {
  packageDigest: string;
  packageId?: string;
  name?: string;
  version?: string;
  schemaVersion?: string;
  siteKey?: string;
  fileCount: number;
  zipSizeBytes: number;
  totalUncompressedBytes: number;
  cmsVersion: string;
  cmsVersionRange?: string;
  versionCompatible: boolean;
  signature?: SitePackageSignatureInfo;
  violations: SitePackageViolation[];
  conflicts: SitePackageConflict[];
  blocked: boolean;
  confirmable: boolean;
  resolutions: SitePackageResolution[];
}

export interface LockfileStatus {
  hasLockfile: boolean;
  lockfileHash?: string;
  hasPackageJson: boolean;
  matchValid: boolean;
  releaseReady?: boolean;
}

export interface DependencyReport {
  runtimeImage: string;
  projectType: string;
  dependencies: { name: string; version: string; license: string }[];
}

export interface Meta {
  name: string;
  product: string;
  apiVersion: string;
}

// ==== 工作台（Dashboard）====
export interface DashboardContentCardItem {
  id: string;
  title: string;
  status: string;
  routePath?: string;
  createdBy?: string;
  updatedAt?: string;
  scheduledPublishAt?: string;
  scheduledWithdrawAt?: string;
}

export interface DashboardPendingApprovalItem {
  taskId: string;
  contentItemId: string;
  title: string;
  submitter?: string;
  assignee?: string;
  sourceStatus?: string;
  targetStatus?: string;
  createdAt?: string;
  scheduledAt?: string;
}

export interface DashboardRecentlyPublishedItem {
  id: string;
  title: string;
  routePath?: string;
  publishedVersion: number;
  createdBy?: string;
  publishedAt?: string;
}

export interface DashboardActivityItem {
  occurredAt: string;
  actor?: string;
  actorName?: string;
  action: string;
  objectType?: string;
  objectId?: string;
  title?: string;
  result?: string;
}

export interface DashboardActivityResponse {
  items: DashboardActivityItem[];
  total: number;
}

export interface DashboardSummary {
  activity: number;
  myActivity: number;
  unpublishedWork: number;
  expiring: number;
  pendingApproval?: number;
  scheduled?: number;
  recentlyPublished?: number;
}
export interface TemplateLayoutBox {
  id: string;
  width: number;
  classes: string[];
  zoneKey?: string;
  zoneKeys?: string[];
}
export interface TemplateLayoutRow {
  id: string;
  classes: string[];
  boxes: TemplateLayoutBox[];
}
export interface TemplateLayout {
  mode: 'VISUAL' | 'CODE';
  columns: 12;
  header: boolean;
  footer: boolean;
  sidebar: 'NONE' | 'LEFT' | 'RIGHT';
  sidebarWidth: 20 | 30 | 40;
  sidebarZoneKeys?: string[];
  code?: string;
  fragmentOverrides?: { htmlHead?: string; header?: string; footer?: string };
  rows: TemplateLayoutRow[];
}
export interface ContainerDisplayConfig {
  type: 'CONTENT' | 'ZERO_CONTENT';
  preLoopFtl: string;
  postLoopFtl: string;
  zeroContentFtl: string;
  displayTemplates: Record<string, string>;
}


export interface MvcController {
  id: string; siteId: string; path: string; route: string; method: 'GET' | 'POST'; definition: string;
  status: 'DRAFT' | 'PUBLISHED'; currentVersion: number; publishedVersion?: number; updatedAt: string;
}
export interface MvcControllerValidation { valid: boolean; errors: string[]; normalizedRoute: string; method: string; }

export interface UrlRewriteRule { id: string; name: string; pattern: string; replacement: string; priority: number; status: 'DRAFT' | 'ACTIVE'; lockVersion: number; }
export interface UrlRewriteValidation { valid: boolean; errors: string[]; }
export interface UrlRewriteTestResult { input: string; output: string; hops: number; rules: string[]; }

export interface WidgetDefinition { id:string; siteId:string; code:string; name:string; controllerDefinition:string; parameterSchema:string; status:string; }

// ==== AI 配置 ====
