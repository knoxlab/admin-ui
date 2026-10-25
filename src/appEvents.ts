/**
 * 跨组件应用事件名（`window` 上的 `CustomEvent`）。
 *
 * <p>用于「子页面处理完写操作后，通知 AppShell 刷新头部衍生数据」这类无状态共享场景，
 * 避免为此引入全局状态库。
 */

/** 内容菜单配置变化：模型页增删内容菜单后，AppShell 重新拉取动态菜单项（见 `Models.tsx`）。 */
export const CONTENT_MENU_CHANGED_EVENT = 'powercms:content-menu-changed';

/**
 * 通知已读状态变化：通知中心「标为已读 / 全部已读」成功后，AppShell 立即刷新未读角标，
 * 无需等待 60 秒轮询或手动刷新（DEF-11-05）。
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'powercms:notifications-changed';
