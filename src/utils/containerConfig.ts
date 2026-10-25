import type { ContainerDisplayConfig, VisualContainer } from '../api/types';

/**
 * 容器编辑器表单值。
 *
 * `maxContents` 决定形态（见 {@link writeContainerForm}）：
 * - `0` → 单一 Code 模式，渲染源是 `config.zeroContentFtl`，表单字段为 `code`；
 * - `> 0` → Content Type 绑定模式，per-type 渲染代码由 `containerStructures` 承载，
 *   表单字段为 `preLoopFtl` / `postLoopFtl`。
 */
export type ContainerFormValues = {
  name: string; description?: string; maxContents: number;
  preLoopFtl?: string; postLoopFtl?: string; zeroContentFtl?: string; code?: string;
};

export const CONTAINER_FORM_DEFAULTS: ContainerFormValues = {
  name: '', description: '', maxContents: 0, preLoopFtl: '', postLoopFtl: '', zeroContentFtl: '', code: '',
};

/** config JSON 解析：非对象或解析失败一律退化为空对象，避免编辑器因脏数据崩溃。 */
export function parseContainerConfig(config?: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(config || '{}') as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * config → 表单。
 *
 * 单一 Code 模式的渲染源是 `zeroContentFtl`，但脚本 / 预设 / MCP 创建的容器往往只写该字段、
 * 不写 `code`。编辑器若直接读 `code` 会显示空 Code 框，并在保存时把 `zeroContentFtl` 清空，
 * 因此这里必须回退到 `zeroContentFtl`（仅当 `code` 缺失或为空时）。
 */
export function readContainerForm(container?: VisualContainer): Partial<ContainerFormValues> {
  const config = parseContainerConfig(container?.config) as ContainerDisplayConfig & Record<string, unknown>;
  const ftl = config.zeroContentFtl || '';
  return {
    description: String(config.description || ''),
    maxContents: Number(config.maxContents || 0),
    preLoopFtl: config.preLoopFtl || '',
    postLoopFtl: config.postLoopFtl || '',
    zeroContentFtl: ftl,
    code: String(config.code || ftl),
  };
}

/**
 * 表单 → config JSON。
 *
 * `base` 为容器原始 config：服务端 `VisualLayoutService.saveContainer` 是**整份替换**、不做字段合并，
 * 而本表单只渲染 `description` / `maxContents` / `preLoopFtl` / `postLoopFtl` / `code`。
 * 因此必须先以 `base` 打底，保留 `query`（ZERO_CONTENT 的预查询，注入 `items`）、
 * `title_s` / `sub_s` 等表单不管理的键，否则保存会静默改写容器行为。
 *
 * 单一 Code 模式下 `zeroContentFtl` 与 `code` 同步写入（渲染读前者，编辑器读后者）；
 * Content Type 绑定模式下不触碰这两个键，避免切换形态时丢失已配置的单一 Code FTL。
 */
export function writeContainerForm(v: ContainerFormValues, base?: string): string {
  const merged: Record<string, unknown> = { ...parseContainerConfig(base) };
  merged.type = v.maxContents > 0 ? 'CONTENT' : 'ZERO_CONTENT';
  merged.description = v.description || '';
  merged.maxContents = v.maxContents || 0;
  merged.preLoopFtl = v.preLoopFtl || '';
  merged.postLoopFtl = v.postLoopFtl || '';
  if (v.maxContents === 0) {
    const code = v.code || '';
    merged.zeroContentFtl = code;
    merged.code = code;
  }
  return JSON.stringify(merged);
}
