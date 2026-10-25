import type { SiteMember, User, Workflow, WorkflowActionInfo } from '../api/types';

/**
 * DEF-WF-01：「提交审核」入口的取值逻辑（纯函数，便于单测锁定契约）。
 *
 * 数据来源全部是后端既有接口，不新增后端耦合：
 * - 可用转换：`GET /contents/{id}/available-actions`（与工作流定义同源，UI 不硬编码状态）
 * - 工作流定义：`GET /sites/{siteId}/workflows`（只取已发布）
 * - 受理人候选：站点成员 + 用户目录（两者都需更高权限，取不到时退化为自由输入）
 */

/** 默认目标状态：优先「进入审核」，否则取定义顺序首个转换。 */
export function pickDefaultSubmitAction(actions: WorkflowActionInfo[]): WorkflowActionInfo | undefined {
  return actions.find((a) => a.targetStatus === 'IN_REVIEW') ?? actions[0];
}

/** 该转换所属的已发布工作流；找不到时回退到首个已发布工作流。 */
export function pickOwningWorkflow(
  workflows: Workflow[],
  action: WorkflowActionInfo | undefined,
): Workflow | undefined {
  const published = workflows.filter((w) => w.status === 'PUBLISHED');
  if (!action) return published[0];
  return published.find((w) => (w.transitions || []).some(
    (tr) => tr.sourceStatus === action.sourceStatus && tr.targetStatus === action.targetStatus,
  )) ?? published[0];
}

/**
 * DEF-UI-01：内容页动作 → 站点能力映射（纯函数，便于单测锁定与后端同源的契约）。
 *
 * 后端契约（`ContentController` / `WorkflowController` 的 `@PreAuthorize`）：
 * - 编辑内容、保存版本、内联字段、新建内容、批量 AI、提交审核 → 站点能力 `write`
 * - 发布 / 设为草稿 / 归档（`POST /contents/{id}/status`、批量状态）与删除已归档内容
 *   （`DELETE /contents/{id}`、批量删除）→ 站点能力 `review`
 * - 版本历史、查看权限面板 → `read`，因此不受本映射裁剪
 *
 * UI 据此直接裁剪入口，避免「点了才 403」的噪音；服务端仍是最终校验方，
 * 前端裁剪只影响可见性，不承担安全职责。
 */
export interface ContentActionAccess {
  /** 打开编辑器 / 保存草稿（write）。 */
  edit: boolean;
  /** 页面画布编辑器（write）。 */
  pageCanvas: boolean;
  /** 新建内容（write）。 */
  create: boolean;
  /** 批量 AI 处理（write）。 */
  batchAi: boolean;
  /** 提交审核（write）。 */
  submitReview: boolean;
  /** 发布（review）。 */
  publish: boolean;
  /** 设为草稿（review）。 */
  setDraft: boolean;
  /** 归档（review）：归档同时是「删除已归档内容」的前置条件。 */
  archive: boolean;
  /** 删除已归档内容（review）：仅 ARCHIVED 条目可删，服务端最终校验。 */
  remove: boolean;
}

export function contentActionAccess(canWrite: boolean, canReview: boolean): ContentActionAccess {
  return {
    edit: canWrite,
    pageCanvas: canWrite,
    create: canWrite,
    batchAi: canWrite,
    submitReview: canWrite,
    publish: canReview,
    setDraft: canReview,
    archive: canReview,
    remove: canReview,
  };
}

/** 合并站点成员与用户目录为受理人候选，按用户名去重（成员优先，可携带角色信息）。 */
export function assigneeCandidates(
  members: SiteMember[],
  users: User[],
): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  const push = (value: string, label: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ value, label });
  };
  for (const m of members) {
    const roles = (m.roles || []).map((r) => r.roleCode).filter(Boolean).join('/');
    push(m.username, `${m.displayName || m.username} (${m.username})${roles ? ` · ${roles}` : ''}`);
  }
  for (const u of users) {
    push(u.username, `${u.displayName || u.username} (${u.username})`);
  }
  return out;
}
