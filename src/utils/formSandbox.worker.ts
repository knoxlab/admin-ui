/**
 * 客户端表单控制器 · Worker 入口。
 *
 * <p>只做消息收发，执行逻辑全在 `formSandbox.runSandboxRequest`（纯函数，可单测）。
 * 主线程用 `new Worker(new URL('./formSandbox.worker.ts', import.meta.url), { type: 'module' })` 创建。</p>
 */
import { runSandboxRequest, type SandboxRequest, type SandboxResponse } from './formSandbox';

type Incoming = { id: number; req: SandboxRequest };
type Outgoing = { id: number; res: SandboxResponse };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Incoming>) => void) | null;
  postMessage: (msg: Outgoing) => void;
};

scope.onmessage = (e: MessageEvent<Incoming>) => {
  const data = e.data;
  if (!data || typeof data.id !== 'number') return;
  try {
    scope.postMessage({ id: data.id, res: runSandboxRequest(data.req) });
  } catch (err) {
    scope.postMessage({
      id: data.id,
      res: {
        patches: [],
        hidden: [],
        notices: [],
        errors: [err instanceof Error ? err.message : String(err)],
        blocking: false,
        hooked: false,
      },
    });
  }
};
