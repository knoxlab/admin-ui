import { useCallback, useEffect, useRef } from 'react';
import type { FormInstance } from 'antd';
import type { ContentType } from '../api/types';
import type { SandboxCatalog } from '../utils/formSandbox';
import {
  NOT_HANDLED,
  createFormController,
  type FormController,
  type FormControllerHook,
  type FormControllerRun,
} from './formController';

/**
 * 把客户端表单控制器接到 AntD 表单上（`Content.tsx` 只需 4 处调用）：
 * `run(type, 'onInit')` / `run(type, 'onFieldChange', …)` / `run(type, 'onMediaSelect', …)` /
 * `run(type, 'onSave', …)`。
 *
 * <p>控制器实例按 `siteId + contentTypeId + controllerPath` 复用，切模型 / 切站点自动 dispose，
 * 不会把上一个模型的脚本留在内存里继续跑。</p>
 */

export type UseFormControllerOptions = {
  siteId?: string | null;
  form: FormInstance;
  /** 字段目录：随模型变化，按需读取（不参与控制器实例 key，避免重建）。 */
  getCatalog: () => SandboxCatalog;
  /** 脚本 `ctx.notify()`。 */
  onNotice?: (text: string) => void;
  /** 脚本报错 / 超时 / 缺脚本。 */
  onWarn?: (text: string) => void;
  /** 脚本确实写入了字段（用于置脏）。 */
  onApplied?: (run: FormControllerRun) => void;
  /** 脚本本次声明的隐藏字段（整集；仅在脚本实现了该钩子时回调）。 */
  onVisibility?: (hidden: string[]) => void;
};

export type FormControllerApi = {
  run: (
    type: ContentType | null | undefined,
    hook: FormControllerHook,
    payload?: unknown,
  ) => Promise<FormControllerRun>;
  /** 当前是否有脚本正在执行（避免「脚本写值 → 触发字段变更 → 再跑脚本」的自激循环）。 */
  busy: () => boolean;
  /** 释放当前实例（切换模型 / 关闭编辑器）。 */
  reset: () => void;
};

type Slot = { key: string; ctrl: FormController | null };

export function useFormController(opts: UseFormControllerOptions): FormControllerApi {
  const { siteId, form } = opts;
  const latest = useRef(opts);
  latest.current = opts;

  const slot = useRef<Slot>({ key: '\u0000', ctrl: null });
  const running = useRef(0);

  const ensure = useCallback(
    (type: ContentType | null | undefined): FormController | null => {
      const path = String(type?.formController || '').trim();
      const key = `${siteId || ''}|${type?.id || ''}|${path}`;
      if (slot.current.key === key) return slot.current.ctrl;
      slot.current.ctrl?.dispose();
      let ctrl: FormController | null = null;
      if (siteId && path && type) {
        ctrl = createFormController({
          siteId,
          controllerPath: path,
          getCatalog: () => latest.current.getCatalog(),
          host: {
            getValues: () => form.getFieldsValue(true) as Record<string, unknown>,
            applyValue: (path2, value) => {
              if (!path2.length) return;
              if (path2.length === 1) {
                form.setFieldsValue({ [String(path2[0])]: value });
                return;
              }
              // 只支持「重复组行」两级路径；其它形态由脚本写错，忽略即可
              if (path2.length !== 3) return;
              // 重复组行：按 mediaAutofill 的口径整体回写数组，保证 Form.List 行渲染同步
              const [root, idx, key2] = [String(path2[0]), Number(path2[1]), String(path2[2])];
              const rows = form.getFieldValue(root) as unknown;
              const next = Array.isArray(rows) ? [...rows] : [];
              if (!(idx >= 0 && idx < next.length)) return;
              const cur = next[idx];
              next[idx] = { ...(cur && typeof cur === 'object' ? cur : {}), [key2]: value };
              form.setFieldsValue({ [root]: next });
            },
            notify: (text) => latest.current.onNotice?.(text),
            warn: (text) => latest.current.onWarn?.(text),
          },
        });
      }
      slot.current = { key, ctrl };
      return ctrl;
    },
    [siteId, form],
  );

  const run = useCallback<FormControllerApi['run']>(
    async (type, hook, payload) => {
      const ctrl = ensure(type);
      if (!ctrl) return NOT_HANDLED;
      running.current += 1;
      try {
        const res = await ctrl.run(hook, payload);
        if (res.applied) latest.current.onApplied?.(res);
        // 可见性：只有脚本实现了该钩子才整体替换（未实现 = 保持上一次结果，不清空）
        if (res.hooked) latest.current.onVisibility?.(res.hidden);
        return res;
      } finally {
        running.current -= 1;
      }
    },
    [ensure],
  );

  const reset = useCallback(() => {
    slot.current.ctrl?.dispose();
    slot.current = { key: '\u0000', ctrl: null };
  }, []);

  // 站点切换：旧站点的脚本（可能已无权限）立即失效
  useEffect(() => {
    reset();
  }, [siteId, reset]);

  useEffect(() => () => reset(), [reset]);

  return {
    run,
    busy: () => running.current > 0,
    reset,
  };
}
