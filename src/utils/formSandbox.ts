import { coerceFieldValue, isEmptyValue } from './fieldValue';

/**
 * 客户端表单控制器 · 沙箱执行核心（运行在 Worker 内，不接触 DOM / Cookie / 页面全局）。
 *
 * <p>脚本契约（FR-CM-FORMCTRL-002/003）：函数体，最后 `return` 一个钩子对象 ——</p>
 *
 * ```js
 * return {
 *   onInit(ctx) {},
 *   onFieldChange(ctx, { changed }) {},
 *   onMediaSelect(ctx, { assets, fieldCode, repeat, rowIndex }) {},
 *   onSave(ctx, values) {},
 * };
 * ```
 *
 * <p>脚本**不直接改表单**：它只通过 `ctx.setValue(path, value)` 追加补丁，由主线程按模型字段
 * 类型复核后写入。这样即使脚本乱写也不会把非法值塞进 fieldValues。</p>
 *
 * <p>安全边界：Worker 隔离（无 DOM、无页面全局），worker 入口处已把网络 API 抹掉；
 * 本模块再叠一层语法黑名单，用于挡住明显的越权写法。**黑名单不是安全边界**，
 * 真正兜底的是 Worker + 权限（只有能编辑模型的人才能写脚本）。</p>
 */

export type SandboxField = {
  code: string;
  fieldType: string;
  readOnly?: boolean;
  options?: { value: string; label: string }[];
};

/** 字段目录：顶层字段 + 重复组子字段（重复组以槽位码分组）。 */
export type SandboxCatalog = {
  top: SandboxField[];
  repeats: Record<string, SandboxField[]>;
};

export type SandboxPatch = { path: (string | number)[]; value: unknown };

export type SandboxRequest = {
  source: string;
  /** onInit / onFieldChange / onMediaSelect / onSave */
  hook: string;
  payload: unknown;
  values: Record<string, unknown>;
  catalog: SandboxCatalog;
};

export type SandboxResponse = {
  patches: SandboxPatch[];
  /** 本次事件后应当隐藏的字段码（整集替换，非增量）。 */
  hidden: string[];
  notices: string[];
  errors: string[];
  /** `ctx.fail()` 显式阻断保存（用于 onSave 校验）；脚本抛异常不算阻断。 */
  blocking: boolean;
  /** 脚本确实定义了本次事件的钩子（用于「脚本接管 vs 平台兜底」的判定）。 */
  hooked: boolean;
};

const MAX_SOURCE = 64 * 1024;

/**
 * 明显的越权写法（网络 / 存储 / 全局 / 动态编译）。
 *
 * <p>只拦「调用或取成员」形态（`fetch(`、`window.`、`localStorage.getItem`）：
 * 字段码 / 文案里出现 `document`、`self` 这类词是正常的，不能因为出现单词就拒绝。
 * 真正的兜底是 Worker 隔离 + 形参遮蔽（见 `SHADOWED`），这里只负责给出清楚的报错。</p>
 */
const HARD_FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /\beval\s*\(/, label: 'eval' },
  { re: /\bFunction\s*\(/, label: 'Function 构造器' },
  { re: /\.constructor\b/, label: 'constructor' },
  { re: /\bimport\s*\(/, label: '动态 import' },
  { re: /\bimportScripts\s*\(/, label: 'importScripts' },
  { re: /\brequire\s*\(/, label: 'require' },
  { re: /\bpostMessage\s*\(/, label: 'postMessage' },
];

/** 只拦 `名字(` / `名字.` / `名字[` —— 单纯出现同名标识符（如字段码 document）放行。 */
const USAGE_FORBIDDEN = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'BroadcastChannel',
  'indexedDB',
  'caches',
  'localStorage',
  'sessionStorage',
  'document',
  'window',
  'globalThis',
  'self',
  'Worker',
  'SharedWorker',
  'navigator',
  'location',
  'process',
  'WebAssembly',
];

const FORBIDDEN: { re: RegExp; label: string }[] = [
  ...HARD_FORBIDDEN,
  ...USAGE_FORBIDDEN.map((name) => ({
    re: new RegExp(`(^|[^\\w$.])(${name})\\s*[.[(]`),
    label: name,
  })),
];

export const EMPTY_RESPONSE: SandboxResponse = {
  patches: [],
  hidden: [],
  notices: [],
  errors: [],
  blocking: false,
  hooked: false,
};

/**
 * 去掉注释与字符串字面量后再做语法黑名单扫描 —— 否则「注释里提到 localStorage」也会被误判。
 * 只做保守的字符状态机（不追求完整词法），未知形态按普通代码处理。
 */
export function stripLiterals(source: string): string {
  const out: string[] = [];
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        out.push('  ');
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block';
        out.push('  ');
        i += 2;
        continue;
      }
      if (ch === "'") state = 'single';
      else if (ch === '"') state = 'double';
      else if (ch === '`') state = 'template';
      out.push(ch);
      i += 1;
      continue;
    }
    if (ch === '\\') {
      out.push('  ');
      i += 2;
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') {
        state = 'code';
        out.push('\n');
      } else {
        out.push(' ');
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out.push('  ');
        i += 2;
      } else {
        out.push(ch === '\n' ? '\n' : ' ');
        i += 1;
      }
      continue;
    }
    // 字符串内部：整段抹平，保留换行（模板字符串可能跨行）
    if ((state === 'single' && ch === "'") || (state === 'double' && ch === '"') || (state === 'template' && ch === '`')) {
      state = 'code';
      out.push(ch);
    } else {
      out.push(ch === '\n' ? '\n' : ' ');
    }
    i += 1;
  }
  return out.join('');
}

type Compiled = (...args: unknown[]) => unknown;

/**
 * 以形参方式屏蔽危险全局：脚本体内这些名字都是 undefined，
 * 且不会改动 Worker 的真实全局（Vite 开发态 HMR 仍可正常工作）。
 */
const SHADOWED = [
  'self',
  'window',
  'document',
  'globalThis',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'Worker',
  'SharedWorker',
  'indexedDB',
  'caches',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'postMessage',
  'Function',
];

const SHADOW_ARGS: unknown[] = new Array(SHADOWED.length).fill(undefined);

/** 编译缓存：同一份脚本在多次事件之间复用 Function 对象（不保留脚本状态）。 */
let cachedSource = '';
let cachedFn: Compiled | null = null;

function compile(source: string): Compiled {
  if (cachedFn && cachedSource === source) return cachedFn;
  const code = stripLiterals(source);
  for (const item of FORBIDDEN) {
    if (item.re.test(code)) throw new Error(`脚本含不允许的写法：${item.label}`);
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('ctx', ...SHADOWED, `"use strict";\n${source}`) as Compiled;
  cachedSource = source;
  cachedFn = fn;
  return fn;
}

function callCompiled(fn: Compiled, ctx: unknown): unknown {
  return fn(ctx, ...SHADOW_ARGS);
}

/** 路径 → 字段定义（顶层 `[code]`；重复组 `[repeatCode, rowIndex, childCode]`）。 */
export function fieldForPath(catalog: SandboxCatalog, path: (string | number)[]): SandboxField | undefined {
  if (path.length === 1) return catalog.top.find((f) => f.code === path[0]);
  if (path.length === 3) return (catalog.repeats[String(path[0])] || []).find((f) => f.code === path[2]);
  return undefined;
}

export function readPath(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 执行一次控制器事件，返回「补丁 + 提示 + 错误」。
 *
 * <p>纯函数（除编译缓存外无副作用），便于单测直接调用；Worker 入口只是把它接到 onmessage。</p>
 */
export function runSandboxRequest(req: SandboxRequest): SandboxResponse {
  const patches: SandboxPatch[] = [];
  const hidden = new Set<string>();
  const notices: string[] = [];
  const errors: string[] = [];

  const source = String(req.source || '');
  if (!source.trim()) return { patches, hidden: [], notices, errors: ['控制器脚本为空'], blocking: false, hooked: false };
  if (source.length > MAX_SOURCE) {
    return {
      patches,
      hidden: [],
      notices,
      errors: [`控制器脚本过长（上限 ${MAX_SOURCE / 1024}KB）`],
      blocking: false,
      hooked: false,
    };
  }

  const catalog: SandboxCatalog = req.catalog || { top: [], repeats: {} };
  const allFields: SandboxField[] = [
    ...catalog.top,
    ...Object.values(catalog.repeats || {}).flat(),
  ];
  const fieldCodes = new Set(allFields.map((f) => f.code));
  let blocking = false;

  const ctx = {
    getValue: (path: (string | number)[]) => readPath(req.values, path),
    setValue: (path: (string | number)[], value: unknown) => {
      const field = fieldForPath(catalog, path);
      if (!field) {
        errors.push(`未知字段：${path.join('.')}`);
        return;
      }
      if (field.readOnly) return;
      const coerced = coerceFieldValue(
        { fieldType: field.fieldType, fieldConfig: { options: field.options } },
        value,
      );
      // undefined = 该类型不接受这个值（如 ENUM 未命中选项）→ 不写，避免保存被拒
      if (coerced === undefined) return;
      patches.push({ path, value: coerced });
    },
    coerce: (path: (string | number)[], value: unknown) => {
      const field = fieldForPath(catalog, path);
      if (!field) return undefined;
      return coerceFieldValue(
        { fieldType: field.fieldType, fieldConfig: { options: field.options } },
        value,
      );
    },
    isEmpty: isEmptyValue,
    fields: allFields,
    /** 清空字段（与 setValue 的「不写」区分开）：用于切换语义后丢弃不再适用的旧值。 */
    clear: (path: (string | number)[]) => {
      const field = fieldForPath(catalog, path);
      if (!field) {
        errors.push(`未知字段：${path.join('.')}`);
        return;
      }
      if (field.readOnly) return;
      patches.push({ path, value: undefined });
    },
    /** 隐藏字段（条件显示，FR-CM-FORMCTRL-003）；每次事件返回的是「整集」，不是增量。 */
    hide: (code: unknown) => {
      const key = String(code ?? '').trim();
      if (!key) return;
      if (!fieldCodes.has(key)) {
        errors.push(`未知字段：${key}`);
        return;
      }
      hidden.add(key);
    },
    /** 显式恢复显示（用于同一钩子里按条件二选一的写法）。 */
    show: (code: unknown) => {
      const key = String(code ?? '').trim();
      if (key) hidden.delete(key);
    },
    notify: (message: unknown) => {
      const text = String(message ?? '').trim();
      if (text) notices.push(text);
    },
    fail: (message: unknown) => {
      blocking = true;
      errors.push(String(message ?? '表单校验未通过'));
    },
  };

  let controller: Record<string, unknown> | null | undefined;
  try {
    controller = callCompiled(compile(source), ctx) as Record<string, unknown> | null | undefined;
  } catch (err) {
    errors.push(errorText(err));
    return { patches, hidden: [], notices, errors, blocking: false, hooked: false };
  }

  const hook = controller?.[req.hook];
  if (typeof hook !== 'function') {
    return { patches, hidden: [], notices, errors, blocking: false, hooked: false };
  }

  try {
    (hook as (this: unknown, ...args: unknown[]) => void).call(controller, ctx, req.payload);
  } catch (err) {
    errors.push(errorText(err));
  }
  return {
    patches,
    hidden: [...hidden],
    notices,
    errors,
    blocking,
    hooked: true,
  };
}
