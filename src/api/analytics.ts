import { api } from './client';

export interface AnalyticsOverview {
  pv: number; uv: number; ipCount: number; sessionCount: number;
  returnRate: number; wowPv: number; prevPv?: number | null;
  dataFrom?: string | null; metricNote?: string;
}
export interface TrendPoint { statDate: string; pv: number; uv: number; ipCount: number; sessionCount: number }
export interface HourPoint { hour: number; pv: number; uv: number; ipCount: number }
export interface FolderRow {
  folderId: string; title: string; path: string; parentFolderId: string;
  pv: number; uv: number; ipCount: number; sessionCount: number; directPv: number;
}
export interface ContentRankRow {
  contentId: string; title: string; folderTitle: string; typeName: string;
  createdBy: string;
  /** OBS-11-04：后端解析后的创建者用户名（AI 批量建稿写入的 actor 是用户 ID）。 */
  createdByName?: string | null;
  pv: number; uv: number; playCount: number; avgDurationMs: number;
}
export interface TypeRow { contentTypeId: string; typeName: string; pv: number; uv: number }
export interface UrlRow { path: string; pv: number; uv: number }
export interface SourceRow { sourceType: string; detail: string; pv: number; uv: number }
export interface SearchTermRow { keyword: string; searchCount: number; uv: number; zeroHitCount: number }
export interface ClientRow { value: string; pv: number; uv: number }
export interface BucketRow { bucket: string; count: number }
export interface PageRankRow { path: string; sessionCount: number }
export interface AssetRow {
  mediaAssetId: string; playCount: number; playSessionCount: number;
  watchedMsTotal: number; trafficBytesTotal: number;
}
export interface RecentVisitRow {
  occurredAt: string; ipMasked: string; routePath: string; title: string;
  sourceType: string; os: string; browser: string; isNewVisitor: boolean;
}
export interface RegionRow { province: string; city: string; pv: number; uv: number }
export interface PublishUserRow {
  actor: string; drafts: number; submitted: number; approved: number; rejected: number;
  published: number; withdrawn: number; archived: number; avgReviewMinutes: string | number;
}
export interface PublishDeptRow {
  deptName: string; members: number; drafts: number; submitted: number; approved: number;
  rejected: number; published: number; withdrawn: number; archived: number;
}
export interface PublishFolderRow {
  folderId: string; folderTitle: string; total: number; drafts: number; inReview: number;
  approved: number; published: number; withdrawn: number; archived: number;
}
export interface PublishTrendPoint {
  statDate: string; submits: number; approvals: number; rejections: number; publishes: number;
}
export interface RealtimeSummary { onlineCount: number; watchingCount: number; view: string }
export interface MinutePoint { minute: string; onlineCount: number; watchingCount: number }
export interface WatchingRow {
  visitorId: string; memberAccount?: string; contentTitle?: string; routePath?: string;
  ipMasked?: string; regionProvince?: string; regionCity?: string;
  os?: string; browser?: string; deviceType?: string;
  playPositionMs: number; lastActiveAt?: string; serverNode?: string;
  /** 播放状态（服务端推导）：PLAYING / PAUSED / STOPPED */
  playState?: string;
  /** 会话结束原因（仅 STOPPED 有值，如 completed / timeout / 客户端上报的 ended） */
  endReason?: string;
  /** 会话累计流量（字节，心跳原子累加） */
  trafficBytes?: number;
  /** 会话累计观看时长（毫秒） */
  watchedMs?: number;
}
export interface AnalyticsNode {
  serverNode: string; host: string; version: string; status: string;
  queueDepth: number; droppedCount: number; lastHeartbeatAt: string;
  configVersion: string; geoLibVersion: string;
}

const base = (siteId: string) => `/sites/${siteId}/analytics`;

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export const analyticsApi = {
  overview: (siteId: string, from: string, to: string) =>
    api.get<AnalyticsOverview>(`${base(siteId)}/overview`, { params: { from, to } }).then((r) => r.data),
  trend: (siteId: string, from: string, to: string) =>
    api.get<TrendPoint[]>(`${base(siteId)}/trend`, { params: { from, to } }).then((r) => r.data),
  hourly: (siteId: string, from: string, to: string) =>
    api.get<HourPoint[]>(`${base(siteId)}/hourly`, { params: { from, to } }).then((r) => r.data),
  folders: (siteId: string, from: string, to: string) =>
    api.get<{ rows: FolderRow[]; deleted: FolderRow[] }>(`${base(siteId)}/folders`, { params: { from, to } }).then((r) => r.data),
  contentRank: (siteId: string, params: { period?: string; metric?: string; contentTypeId?: string; limit?: number; from?: string; to?: string }) =>
    api.get<{ from: string; to: string; totalFrom: string; rows: ContentRankRow[] }>(
      `${base(siteId)}/contents/rank`, { params }).then((r) => r.data),
  contentTypes: (siteId: string, from: string, to: string) =>
    api.get<TypeRow[]>(`${base(siteId)}/content-types`, { params: { from, to } }).then((r) => r.data),
  urlRank: (siteId: string, from: string, to: string, limit = 20) =>
    api.get<UrlRow[]>(`${base(siteId)}/urls/rank`, { params: { from, to, limit } }).then((r) => r.data),
  sources: (siteId: string, from: string, to: string) =>
    api.get<SourceRow[]>(`${base(siteId)}/sources`, { params: { from, to } }).then((r) => r.data),
  searchTerms: (siteId: string, from: string, to: string, limit = 20) =>
    api.get<SearchTermRow[]>(`${base(siteId)}/search/terms`, { params: { from, to, limit } }).then((r) => r.data),
  clients: (siteId: string, dimension: string, from: string, to: string) =>
    api.get<ClientRow[]>(`${base(siteId)}/clients`, { params: { dimension, from, to } }).then((r) => r.data),
  loyalty: (siteId: string, kind: 'depth' | 'frequency', from: string, to: string) =>
    api.get<BucketRow[]>(`${base(siteId)}/loyalty/${kind}`, { params: { from, to } }).then((r) => r.data),
  pageRank: (siteId: string, kind: 'entry' | 'exit', from: string, to: string, limit = 20) =>
    api.get<{ bounceRate: number; rows: PageRankRow[] }>(
      `${base(siteId)}/pages/${kind}`, { params: { from, to, limit } }).then((r) => r.data),
  assetRank: (siteId: string, from: string, to: string, limit = 20) =>
    api.get<AssetRow[]>(`${base(siteId)}/assets/rank`, { params: { from, to, limit } }).then((r) => r.data),
  recentVisits: (siteId: string, limit = 100) =>
    api.get<RecentVisitRow[]>(`${base(siteId)}/recent-visits`, { params: { limit } }).then((r) => r.data),
  regions: (siteId: string, from: string, to: string, limit = 50) =>
    api.get<RegionRow[]>(`${base(siteId)}/regions`, { params: { from, to, limit } }).then((r) => r.data),
  visitLog: (siteId: string, params: { from: string; to: string; searchIn?: string; q?: string; visitorKind?: string; page?: number; size?: number }) =>
    api.get<{ total: number; rows: RecentVisitRow[] }>(`${base(siteId)}/visit-log`, { params }).then((r) => r.data),
  publishByUser: (siteId: string, from: string, to: string) =>
    api.get<PublishUserRow[]>(`${base(siteId)}/publish/by-user`, { params: { from, to } }).then((r) => r.data),
  publishByDepartment: (siteId: string, from: string, to: string) =>
    api.get<PublishDeptRow[]>(`${base(siteId)}/publish/by-department`, { params: { from, to } }).then((r) => r.data),
  publishByFolder: (siteId: string) =>
    api.get<PublishFolderRow[]>(`${base(siteId)}/publish/by-folder`).then((r) => r.data),
  publishTrend: (siteId: string, from: string, to: string) =>
    api.get<PublishTrendPoint[]>(`${base(siteId)}/publish/trend`, { params: { from, to } }).then((r) => r.data),
  realtimeSummary: (siteId: string, serverNode?: string) =>
    api.get<RealtimeSummary>(`${base(siteId)}/realtime/summary`,
      { params: serverNode ? { serverNode } : {} }).then((r) => r.data),
  realtimeTrend: (siteId: string, minutes = 60, serverNode?: string) =>
    api.get<MinutePoint[]>(`${base(siteId)}/realtime/trend`,
      { params: { minutes, ...(serverNode ? { serverNode } : {}) } }).then((r) => r.data),
  realtimeWatching: (siteId: string, params: { q?: string; searchIn?: string; serverNode?: string; page?: number; size?: number }) =>
    api.get<{ total: number; rows: WatchingRow[] }>(`${base(siteId)}/realtime/watching`, { params }).then((r) => r.data),
  nodes: (siteId: string) =>
    api.get<AnalyticsNode[]>(`${base(siteId)}/nodes`).then((r) => r.data),
  drainNode: (siteId: string, serverNode: string) =>
    api.post(`${base(siteId)}/nodes/${encodeURIComponent(serverNode)}/drain`).then((r) => r.data),
};

export const analyticsRange = { last7: () => [today(-6), today()], today: () => [today(), today()] } as const;
