import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 全站时间展示口径（域 11 `DEF-11-07` 的收尾治理）。
 *
 * <p>此前各页面直接用 `new Date(v).toLocaleString()`，输出的是「随浏览器区域设置变化」的
 * 美式 12 小时制（`9/19/2026, 10:03:04 AM`）：同一个后台在不同语言/区域的操作系统上会显示成
 * 不同格式，截图取证、跨端比对与用户沟通都对不上。通知中心与 AI 建议池已在 `DEF-11-07`
 * 改为 `dayjs(v).format('YYYY-MM-DD HH:mm')`，本工具把同口径收敛成唯一入口，供其余页面复用。</p>
 *
 * <p>取值约定：`null` / `undefined` / 空串一律回退（缺省 `—`），无法解析的时间串同样回退，
 * 避免把 `Invalid Date` 渲染到界面上。注意 dayjs 对**可解析但越界**的串是宽松的（如
 * `2026-13-45T99:99` 会进位成 2027-02-18），这里保持与全站既有 inline `dayjs` 用法一致，
 * 不再额外收紧——收紧会让历史脏数据从「显示偏移」变成「整列空白」，反而是更差的退化。</p>
 *
 * <p><b>展示时区（DEF-CFG-03）：</b>spec 5.5 的 `defaultTimezone` 语义是「后台展示时区
 * （**不**以浏览器时区为准）」。修复前该字段能存能读、无任何行为。现由管理端外壳在登录后把
 * 组织默认时区灌进 {@link setDisplayTimezone}，本工具的**全部**格式化入口即按该时区渲染。
 * 未配置 / 非法时区一律保持历史行为（浏览器本地时区），因此默认安装的显示结果不变。</p>
 */

/** 表格/详情的缺省占位符。 */
export const DATE_FALLBACK = '—';

/** 分钟级精度（列表、详情、审计流的统一口径）。 */
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

/** 秒级精度（实时消息、任务执行时间）。 */
export const DATETIME_SECONDS_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/**
 * 紧凑口径（`MM-DD HH:mm`，不显年份；用于会话轮次、统计轴标签等空间受限处）。
 *
 * <p>刻意保留「不显年份」的既有观感 —— 补这个入口是为了让这些位置也吃上展示时区，
 * 不是为了统一成完整口径；显不显年份是版面决策，与「按哪个时区渲染」是两件事。
 */
export const DATETIME_COMPACT_FORMAT = 'MM-DD HH:mm';

/** 仅日期（投放期、报表区间）。 */
export const DATE_FORMAT = 'YYYY-MM-DD';

/** 仅时分（`HH:mm`；实时分钟曲线的轴标签/表格等空间受限处）。 */
export const HOUR_MINUTE_FORMAT = 'HH:mm';

export type DateLike = string | number | Date | null | undefined;

let displayTimezone: string | null = null;

/**
 * 设置后台展示时区（IANA 名称，如 `America/New_York`）。
 *
 * <p>空值或非法时区**回退为 null**（= 浏览器本地时区），而不是让所有时间渲染炸掉：
 * 配置错误应当退化为「显示口径回到默认」，不应把整个列表变成空白。
 */
export function setDisplayTimezone(value: string | null | undefined): void {
  const candidate = typeof value === 'string' ? value.trim() : '';
  displayTimezone = candidate && isValidTimezone(candidate) ? candidate : null;
}

/** 当前生效的展示时区；null 表示浏览器本地时区。 */
export function getDisplayTimezone(): string | null {
  return displayTimezone;
}

/** 仅测试用：恢复默认（浏览器本地时区）。 */
export function resetDisplayTimezone(): void {
  displayTimezone = null;
}

/**
 * IANA 时区名合法性校验。用 `Intl` 而非 dayjs 试构造，因为 `Intl` 是时区数据的来源，
 * 对未知时区会抛 `RangeError`——这正是我们要拦住的输入。
 */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** 把任意可解析的时间值收敛为 `dayjs` 实例；无法解析时返回 `null`。 */
function parse(value: DateLike): dayjs.Dayjs | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  // 后端时间为带时区的 ISO 串，按展示时区重投影；naive 串沿用 dayjs 的本地解释。
  return displayTimezone ? parsed.tz(displayTimezone) : parsed;
}

/** `YYYY-MM-DD HH:mm`；缺省占位符 `—`。 */
export function formatDateTime(value: DateLike, fallback: string = DATE_FALLBACK): string {
  return parse(value)?.format(DATETIME_FORMAT) ?? fallback;
}

/** `YYYY-MM-DD HH:mm:ss`；缺省占位符 `—`。 */
export function formatDateTimeSeconds(value: DateLike, fallback: string = DATE_FALLBACK): string {
  return parse(value)?.format(DATETIME_SECONDS_FORMAT) ?? fallback;
}

/**
 * `MM-DD HH:mm`；缺省占位符 `—`。
 *
 * <p><b>DEF-CFG-04：</b>此前 `AgentWorkbench` / `AiCitationStatPanel` 直接对 ISO 串做
 * `dayjs(v).format('MM-DD HH:mm')`，绕过了 {@link parse} 的时区重投影，于是同一屏里
 * 「紧凑时间」与「完整时间」会差一个时区。补此入口后两者口径一致，且 `null` / 非法串
 * 统一回退占位符（旧写法会渲染出字面量 `Invalid Date`）。
 */
export function formatDateTimeCompact(value: DateLike, fallback: string = DATE_FALLBACK): string {
  return parse(value)?.format(DATETIME_COMPACT_FORMAT) ?? fallback;
}

/** `YYYY-MM-DD`；缺省占位符 `—`。 */
export function formatDate(value: DateLike, fallback: string = DATE_FALLBACK): string {
  return parse(value)?.format(DATE_FORMAT) ?? fallback;
}

/**
 * `HH:mm`（仅时分）。
 *
 * <p>补此入口是因为实时监控的分钟曲线此前对后端 ISO 串直接 `slice(11, 16)`：
 * 后端回的是带 `Z` 的 UTC 瞬时（`2026-10-22T12:58:00Z`），切片把 UTC 墙钟原样上屏，
 * 与本地时间差一个时区偏移（东八区差 8 小时）。经 {@link parse} 重投影后口径与
 * 全站其它时间列一致。</p>
 */
export function formatHourMinute(value: DateLike, fallback: string = DATE_FALLBACK): string {
  return parse(value)?.format(HOUR_MINUTE_FORMAT) ?? fallback;
}
