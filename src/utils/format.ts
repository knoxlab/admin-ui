/**
 * 展示用格式化小工具（纯函数，与 datetime.ts 同风格：非法值一律回退占位符，不渲染 `NaN`）。
 */

/** 字节数展示的缺省占位符（与 datetime.ts 的 DATE_FALLBACK 同形，但独立引入避免循环依赖）。 */
export const FORMAT_FALLBACK = '—';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * 字节数可读化（1024 进制，单位间一位小数；B 不带小数）。
 *
 * <p>统计页的流量列原先直接把 `traffic_bytes` 原始字节数上屏（`48265008`），
 * 运营读不出量级；本入口统一为 `46.0 MB` 形态。null / undefined / 非数字 / 负数
 * 一律回退占位符，避免 `NaN B` 上屏。</p>
 */
export function formatBytes(value: number | null | undefined, fallback: string = FORMAT_FALLBACK): string {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return fallback;
  if (value < 1024) return `${Math.round(value)} B`;
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${BYTE_UNITS[unit]}`;
}
