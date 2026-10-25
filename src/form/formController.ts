import { templatesApi } from '../api';
import type { FieldDef } from '../api/types';
import { parseEnumOptions } from '../utils/enumOptions';
import type {
  SandboxCatalog,
  SandboxField,
  SandboxPatch,
  SandboxRequest,
  SandboxResponse,
} from '../utils/formSandbox';
import { EMPTY_RESPONSE, readPath } from '../utils/formSandbox';

/**
 * 客户端表单控制器 · 运行时（平台级，一次性实现；新建模型只需在模板工程里放一个 JS 文件）。
 *
 * <p>三段职责：</p>
 * <ul>
 *   <li><b>脚本解析</b>：`ContentType.formController` 存的是模板工程内的相对路径
 *       （可写 `<工程名>:scripts/x.js` 指定工程），按站点经 `templatesApi` 取文件并按
 *       `siteId + path` 缓存，改脚本后 60s 内自动生效；</li>
 *   <li><b>执行</b>：脚本丢进 Worker 里跑（见 `utils/formSandbox.*`），主线程有 3s 超时，
 *       死循环会被 terminate 掉，不会冻结表单界面；</li>
 *   <li><b>回写</b>：脚本不直接改表单，只返回 `setValue` 补丁，这里按模型字段类型复核后
 *       逐条回写（见 `host.applyValue`）。</li>
 * </ul>
 *
 * <p>设计目标：**新建内容类型 / 调整字段联动 = 改模板工程里的脚本，零后端、零 admin-ui 改动**。</p>
 */

export type FormControllerHook = 'onInit' | 'onFieldChange' | 'onMediaSelect' | 'onSave';

export type FormControllerRun = SandboxResponse & {
  /** 实际写入表单的补丁数。 */
  applied: number;
};

export type FormControllerHost = {
  /** 取当前表单全部值（含未挂载页签的 store 值）。 */
  getValues: () => Record<string, unknown>;
  /** 回写一个字段值；路径为 `[code]` 或 `[repeatCode, rowIndex, childCode]`。 */
  applyValue: (path: (string | number)[], value: unknown) => void;
  /** 脚本 `ctx.notify()` 的提示。 */
  notify?: (text: string) => void;
  /** 脚本报错 / 超时 / 找不到脚本。 */
  warn?: (text: string) => void;
};

export type FormControllerOptions = {
  siteId: string;
  /** 内容类型的 `formController`（模板工程内相对路径）；空值表示该模型不启用控制器。 */
  controllerPath?: string | null;
  getCatalog: () => SandboxCatalog;
  host: FormControllerHost;
};

export type FormController = {
  /** 是否配置了控制器脚本路径（不看脚本是否存在）。 */
  readonly configured: boolean;
  run: (hook: FormControllerHook, payload?: unknown) => Promise<FormControllerRun>;
  dispose: () => void;
};

/** 未配置控制器 / 脚本缺失时的空结果（`hooked: false` 表示平台兜底逻辑可继续执行）。 */
export const NOT_HANDLED: FormControllerRun = { ...EMPTY_RESPONSE, applied: 0 };

/** 单次事件上限：脚本死循环时 terminate，避免 UI 卡死。 */
const RUN_TIMEOUT_MS = 3000;

/** 连续超时 2 次即停用该控制器实例（脚本已确定有问题，继续重试只会反复卡 3s）。 */
const MAX_TIMEOUTS = 2;

const SCRIPT_TTL_MS = 60_000;

type CachedScript = { at: number; value: ResolvedScript | null };
const scriptCache = new Map<string, CachedScript>();
const inflight = new Map<string, Promise<ResolvedScript | null>>();

export type ResolvedScript = { content: string; projectId: string; path: string };

/** 清空脚本缓存（模板工程提交/发布后或测试用）。 */
export function clearControllerScriptCache(): void {
  scriptCache.clear();
  inflight.clear();
}

/** `project:/scripts/x.js` 或 `project:scripts/x.js` → 工程名 + 工程内路径。 */
export function splitControllerPath(raw: string): { project?: string; path: string } {
  const clean = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const idx = clean.indexOf(':');
  if (idx > 0) {
    const project = clean.slice(0, idx).trim();
    const rest = clean.slice(idx + 1).replace(/^\/+/, '');
    if (project && rest) return { project, path: rest };
  }
  return { path: clean };
}

/**
 * 解析控制器脚本：按站点列模板工程，找到第一个含该路径文件的工程。
 *
 * <p>路径可带工程名前缀；不带前缀时按工程列表顺序探测（工程数量是个位数，成本可接受）。</p>
 */
export async function resolveControllerScript(
  siteId: string,
  controllerPath: string,
): Promise<ResolvedScript | null> {
  const { project, path } = splitControllerPath(controllerPath);
  if (!siteId || !path) return null;

  const key = `${siteId}\u0000${project || ''}\u0000${path}`;
  const cached = scriptCache.get(key);
  if (cached && Date.now() - cached.at < SCRIPT_TTL_MS) return cached.value;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<ResolvedScript | null> => {
    let projects: { id: string; name: string }[] = [];
    try {
      projects = await templatesApi.list(siteId);
    } catch {
      return null;
    }
    const candidates = project
      ? projects.filter((p) => p.name === project || p.id === project)
      : projects;
    for (const p of candidates) {
      try {
        const file = await templatesApi.getFile(p.id, path);
        if (file && typeof file.content === 'string' && file.content.trim()) {
          return { content: file.content, projectId: p.id, path };
        }
      } catch {
        // 该工程没有这个文件 / 无权限 —— 继续探下一个
      }
    }
    return null;
  })()
    .then((value) => {
      scriptCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

/** 表单值 → 可结构化克隆的纯 JSON（Date/dayjs/File 等一并归一，函数丢弃）。 */
export function toPlainValues(values: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(values, (_k, v) => (typeof v === 'function' ? undefined : v));
    return json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    // fall back to a shallow copy: never hand an empty object to the script
    return { ...values };
  }
}

/** 事件负载 → 可结构化克隆的纯 JSON（媒体资产 / 变更值里可能夹带 dayjs、File 等）。 */
function plainPayload(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  try {
    const json = JSON.stringify(value, (_k, v) => (typeof v === 'function' ? undefined : v));
    return json === undefined ? null : (JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/** 幂等比较：脚本重复写同一个值时不回写，避免「写值 → 字段变更 → 再跑脚本」自激。 */
function sameValue(current: unknown, next: unknown): boolean {
  if (current === next) return true;
  const curObj = current !== null && typeof current === 'object';
  const nextObj = next !== null && typeof next === 'object';
  if (curObj || nextObj) {
    if (!curObj || !nextObj) return false;
    try {
      return JSON.stringify(current) === JSON.stringify(next);
    } catch {
      return false;
    }
  }
  if (current === undefined || current === null || next === undefined || next === null) return false;
  return String(current) === String(next);
}

/** 模型字段 → 脚本侧字段描述（只给必要信息，不下发整个模型定义）。 */
export function toSandboxField(field: FieldDef): SandboxField {
  const options =
    field.fieldType === 'ENUM' || field.fieldType === 'MULTI_ENUM'
      ? parseEnumOptions(field.fieldConfig?.options)
      : undefined;
  return {
    code: field.code,
    fieldType: field.fieldType,
    readOnly: Boolean(field.readOnly),
    options,
  };
}

/** 顶层字段 + 重复组子字段 → 脚本可寻址的字段目录。 */
export function buildSandboxCatalog(
  topFields: FieldDef[],
  repeats: Iterable<readonly [string, { children: FieldDef[] }]>,
): SandboxCatalog {
  const repeatsOut: Record<string, SandboxField[]> = {};
  for (const [code, spec] of repeats) {
    repeatsOut[code] = spec.children.map(toSandboxField);
  }
  return { top: topFields.map(toSandboxField), repeats: repeatsOut };
}

type Pending = {
  resolve: (res: SandboxResponse) => void;
  reject: (err: Error) => void;
  timer: number;
};

/** Worker RPC 客户端：一次事件一个消息，超时即 terminate 并重建。 */
class SandboxClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private timeouts = 0;

  get disabled(): boolean {
    return this.timeouts >= MAX_TIMEOUTS;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') {
      throw new Error('当前环境不支持 Web Worker，客户端表单控制器未启用');
    }
    const worker = new Worker(new URL('../utils/formSandbox.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ id: number; res: SandboxResponse }>) => {
      const data = e.data;
      const item = data ? this.pending.get(data.id) : undefined;
      if (!item) return;
      this.pending.delete(data.id);
      clearTimeout(item.timer);
      item.resolve(data.res);
    };
    worker.onerror = (e) => {
      this.failAll(`控制器执行失败：${e.message || '未知错误'}`);
      this.terminate();
    };
    this.worker = worker;
    return worker;
  }

  private failAll(message: string): void {
    for (const [, item] of this.pending) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  run(req: SandboxRequest): Promise<SandboxResponse> {
    if (this.disabled) return Promise.reject(new Error('控制器已停用（多次执行超时）'));
    let worker: Worker;
    try {
      worker = this.ensure();
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const id = ++this.seq;
    return new Promise<SandboxResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        this.timeouts += 1;
        this.terminate();
        this.failAll('控制器执行超时');
        reject(new Error(`控制器脚本执行超时（${RUN_TIMEOUT_MS}ms）`));
      }, RUN_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ id, req });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  dispose(): void {
    this.failAll('控制器已关闭');
    this.terminate();
  }
}

/**
 * 创建控制器实例（每次打开编辑器 / 切换模型建一个，切模型时 dispose）。
 *
 * <p>脚本按需加载：没配 `formController` 的模型完全不发请求、不建 Worker。</p>
 */
export function createFormController(opts: FormControllerOptions): FormController {
  const client = new SandboxClient();
  const path = String(opts.controllerPath || '').trim();
  const reported = new Set<string>();

  const report = (text: string) => {
    if (!text || reported.has(text)) return;
    reported.add(text);
    opts.host.warn?.(text);
  };

  const run = async (hook: FormControllerHook, payload?: unknown): Promise<FormControllerRun> => {
    if (!path) return NOT_HANDLED;
    if (!opts.siteId) return NOT_HANDLED;

    let script: ResolvedScript | null;
    try {
      script = await resolveControllerScript(opts.siteId, path);
    } catch (err) {
      report(`控制器脚本加载失败：${err instanceof Error ? err.message : String(err)}`);
      return NOT_HANDLED;
    }
    if (!script) {
      report(`未找到客户端控制器脚本：${path}（请在模板工程中创建该文件）`);
      return NOT_HANDLED;
    }

    let res: SandboxResponse;
    try {
      res = await client.run({
        source: script.content,
        hook,
        payload: plainPayload(payload),
        values: toPlainValues(opts.host.getValues()),
        catalog: opts.getCatalog(),
      });
    } catch (err) {
      report(`控制器执行失败：${err instanceof Error ? err.message : String(err)}`);
      return NOT_HANDLED;
    }

    const current = opts.host.getValues();
    let applied = 0;
    for (const patch of res.patches as SandboxPatch[]) {
      // 幂等：脚本重复写同一个值就跳过，避免触发一轮又一轮的字段变更
      if (sameValue(readPath(current, patch.path), patch.value)) continue;
      try {
        opts.host.applyValue(patch.path, patch.value);
        applied += 1;
      } catch (err) {
        res.errors.push(
          `写入字段 ${patch.path.join('.')} 失败：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    for (const notice of res.notices) opts.host.notify?.(notice);
    for (const error of res.errors) report(`控制器：${error}`);

    return { ...res, applied };
  };

  return {
    configured: Boolean(path),
    run,
    dispose: () => client.dispose(),
  };
}
