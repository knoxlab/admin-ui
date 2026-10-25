import type { BrandingConfig } from '../api/types';

/**
 * 组织品牌解析（spec 5.5）。修复前 `parseBranding` 在 `LoginPage` 与 `SystemConfigPage`
 * 各写一份，品牌默认值也散在各处；这里收敛为唯一入口，供登录页与管理端外壳共用。
 */

export const DEFAULT_BRAND_PRIMARY = '#1677ff';
export const DEFAULT_BRAND_SECONDARY = '#2f54eb';
export const DEFAULT_LOGIN_BACKGROUND = '#1e3a5f';

/** 解析 `branding` JSON 列；非法 JSON / 非对象一律回退空配置（不抛）。 */
export function parseBranding(raw: string | null | undefined): BrandingConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as BrandingConfig) : {};
  } catch {
    return {};
  }
}

export interface ResolvedBrand {
  primary: string;
  secondary: string;
  loginBackground: string;
}

/** 品牌配置的缺省填充结果。 */
export function resolveBrand(brand: BrandingConfig | null | undefined): ResolvedBrand {
  const source = brand ?? {};
  return {
    primary: source.backendPrimaryColor || DEFAULT_BRAND_PRIMARY,
    secondary: source.backendSecondaryColor || DEFAULT_BRAND_SECONDARY,
    loginBackground: source.loginBackground || DEFAULT_LOGIN_BACKGROUND,
  };
}

/** CSS 变量名（与 `App.css` 中的消费点必须一致）。 */
export const BRAND_PRIMARY_VAR = '--pc-brand-primary';
export const BRAND_SECONDARY_VAR = '--pc-brand-secondary';

/**
 * 品牌色 → 外壳 CSS 变量（DEF-CFG-03）。
 *
 * <p>`backendPrimaryColor` / `backendSecondaryColor` 修复前只有登录页消费了主色，
 * 次色完全没有读取方。这里把两者下发到管理端外壳，由 `App.css` 的侧边栏
 * 选中态（主色）/ 悬停态（次色）取值 —— 品牌配置因此在**登录后的管理端**也可见。
 */
export function brandCssVars(brand: ResolvedBrand): Record<string, string> {
  return {
    [BRAND_PRIMARY_VAR]: brand.primary,
    [BRAND_SECONDARY_VAR]: brand.secondary,
  };
}
