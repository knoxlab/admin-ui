/**
 * 新标签页打开助手（回归缺陷 ④）。
 *
 * <p>{@code window.open} 只有发生在**用户手势同步调用链**内才不被浏览器弹窗拦截器拦截。
 * 先 {@code await} 取 token / 导出链接、再 {@code window.open} 的写法会丢失手势，
 * 新标签页被静默拦截（表现为「点了没反应」）。正确姿势：手势内**同步**开出空白页，
 * 异步拿到 URL 后再导航；开窗被拦（返回 null）时给出明确提示而不是无声失败。</p>
 *
 * @param fetchUrl  异步解析目标 URL（如换取预览 token / 导出 token）
 * @param onBlocked 弹窗被拦截时的回调（无手势、浏览器拦截器开启等）
 * @param onError   URL 解析失败时的回调（失败时自动关闭空白页，避免留下空标签）
 */
export function openInNewTab(
  fetchUrl: () => Promise<string>,
  onBlocked?: () => void,
  onError?: (e: unknown) => void,
): void {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    onBlocked?.();
    return;
  }
  fetchUrl()
    .then((url) => {
      win.location.href = url;
    })
    .catch((e) => {
      win.close();
      onError?.(e);
    });
}
