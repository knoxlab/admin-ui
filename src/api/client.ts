import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { t } from '../i18n/locale';
import { getStoredLanguage } from '../i18n/storage';

const CRED_KEY = 'powercms.auth';

/**
 * 页面自带失败提示时，用 `{ skipGlobalErrorToast: true }` 关闭全局兜底 toast，
 * 避免同一次失败弹两条（全局一条 + 页面一条，如「批量创建分集失败：<后端原因>」）。
 * 与 `CONTENT_VERSION_CONFLICT` 走豁免名单是同一意图，这里给调用方更细粒度的控制。
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipGlobalErrorToast?: boolean;
  }
}

/** Drop leftover HTTP Basic passwords from the P0 client. */
export function clearCredentials() {
  sessionStorage.removeItem(CRED_KEY);
}

/**
 * 「尽力而为」的辅助查询用的请求配置：调用方会降级处理失败（如受理人候选取不到就退化为自由输入），
 * 因此不该再弹全局「没有权限」。典型数据：用户目录 / 站点成员 / 工作流定义。
 */
export const QUIET: AxiosRequestConfig = { skipGlobalErrorToast: true };

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  withCredentials: true,
});

/** 只读快照标记头（与后端 `TimeMachineReadOnlyInterceptor.HEADER` 对齐）。 */
export const READ_ONLY_SNAPSHOT_HEADER = 'X-PowerCMS-Read-Only-Snapshot';

/**
 * FR-CV-VER-010：当前是否处于「历史快照只读态」，值为所浏览的时间点（ISO-8601）。
 *
 * <p>时间机器页面挂载期间置位、卸载时清除；在此期间**每个** API 请求都会带上该头，
 * 服务端据此把写请求一律拒为 403 `TIME_MACHINE_READ_ONLY`。放在请求头而不是全局状态里，
 * 是为了让它严格跟随页面生命周期：用户关掉标签页或跳走都不会留下「写不了内容」的残留状态。</p>
 */
let readOnlySnapshotAt: string | null = null;

export function setReadOnlySnapshot(at: string | null) {
  readOnlySnapshotAt = at;
}

/** 供测试与断言使用：读取当前只读态时间点。 */
export function getReadOnlySnapshot(): string | null {
  return readOnlySnapshotAt;
}

api.interceptors.request.use((config) => {
  const lang = getStoredLanguage();
  if (lang) config.headers['X-Language'] = lang;
  if (readOnlySnapshotAt) config.headers[READ_ONLY_SNAPSHOT_HEADER] = readOnlySnapshotAt;
  return config;
});


api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.message || err.message || t('请求失败');
    const url = String(err.config?.url || '');
    if (status === 401) {
      clearCredentials();
      const onLoginPage = window.location.pathname.startsWith('/login');
      const loginCall = url.includes('/auth/login') || url.includes('/auth/backend/login');
      if (!onLoginPage && !loginCall) {
        window.location.href = '/login';
      }
    } else if (status && status !== 404 && data?.code !== 'CONTENT_VERSION_CONFLICT'
        && !err.config?.skipGlobalErrorToast) {
      message.error(msg);
    }
    return Promise.reject(err);
  },
);
