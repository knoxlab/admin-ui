import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import frFR from 'antd/locale/fr_FR';
import esES from 'antd/locale/es_ES';
import { getStoredLanguage, setStoredLanguage } from './storage';
import { UI_MESSAGES } from './messages';

export const DEFAULT_LANGUAGE = 'zh-CN';
export const LANGUAGE_CHANGED_EVENT = 'powercms:language-changed';

export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (zh: string, vars?: TranslateVars) => string;

const ANTD_LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'fr-FR': frFR,
  'es-ES': esES,
} as const;

const DAYJS_LOCALES: Record<string, string> = {
  'zh-CN': 'zh-cn',
  'en-US': 'en',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'fr-FR': 'fr',
  'es-ES': 'es',
};

export function getAntdLocale(tag: string) {
  return ANTD_LOCALES[tag as keyof typeof ANTD_LOCALES] ?? zhCN;
}

export function initialLanguage(): string {
  return getStoredLanguage() || DEFAULT_LANGUAGE;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match,
  );
}

/** 中文原文即键；未知键或 zh-CN 原样返回。可在拦截器等非 React 路径使用。 */
export function translate(tag: string, zh: string, vars?: TranslateVars): string {
  if (!zh) return zh;
  const dict = tag === DEFAULT_LANGUAGE ? undefined : UI_MESSAGES[tag];
  return interpolate((dict && dict[zh]) || zh, vars);
}

export function t(zh: string, vars?: TranslateVars): string {
  return translate(getStoredLanguage() || DEFAULT_LANGUAGE, zh, vars);
}

export function applyUiLocale(tag: string) {
  dayjs.locale(DAYJS_LOCALES[tag] || 'zh-cn');
  if (typeof document !== 'undefined') {
    document.documentElement.lang = tag;
  }
}

/**
 * 本地语言切换的唯一入口：
 * 写入 localStorage（axios 拦截器随之给每个请求加 X-Language），
 * 同步 dayjs / html lang，并广播事件让界面与 antd 文案包重渲染。
 */
export function setLocale(tag: string) {
  setStoredLanguage(tag);
  applyUiLocale(tag);
  window.dispatchEvent(new CustomEvent<string>(LANGUAGE_CHANGED_EVENT, { detail: tag }));
}

applyUiLocale(initialLanguage());
