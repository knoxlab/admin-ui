/**
 * 菜单项 → 后台布局编码（spec 4.8 §11：由后台布局决定菜单可见性）。
 *
 * 抽成独立模块便于单测（`App.tsx` 体积大且依赖路由/页面组件）。约定：
 * - 返回 `null` 表示该菜单不参与布局过滤（如 `/dashboard`、`/settings` 等常显页）；
 * - 布局只决定**菜单可见性**，不等于 API 授权（能力校验仍在 `App.allow()` 中）。
 */
export function menuLayoutFor(key: string): string | null {
  if (key === '/content' || key === '/content?type=' || key.startsWith('/content?type=') || key === '/pages' || key === '/pages/editor') return 'content';
  // FR-CV-VER-009：时间机器属内容浏览工具（与 内容搜索 / 页面管理 同一后台布局）
  if (key === '/time-machine') return 'content';
  if (key === '/media') return 'media';
  if (['/browser', '/themes', '/templates', '/containers', '/template-designer'].includes(key)) return 'template';
  if (key === '/models' || key === '/categories' || key === '/tags') return 'model';
  if (key.startsWith('/publish')) return 'publish';
  // 「系统 › 工作流」属内置工具布局 `workflow`（BackendLayoutCatalog），
  // 未获得该布局的账号不应看到入口（OBS-11-09）。
  if (key === '/workflow') return 'workflow';
  if (key === '/sites' || key === '/search' || key === '/packages' || key === '/system-config') return 'site-settings';
  if (key.startsWith('/identity')) return 'users';
  return null;
}

/**
 * 按后台布局过滤菜单 key：`layouts` 为空数组表示「无任何后台布局」，此时除常显页面外一律不可见。
 */
export function isMenuAllowedByLayout(key: string, layouts: string[] | null | undefined): boolean {
  const layout = menuLayoutFor(key);
  if (!layout) return true;
  if (!layouts?.length) return false;
  return layouts.includes(layout);
}
