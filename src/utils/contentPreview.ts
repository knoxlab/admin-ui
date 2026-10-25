import defaultPreviewImage from '../assets/content-placeholder.svg';

const ASSET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 图片字段约定值 → 媒体资产编号：裸 UUID 或带 assetId 的 mediaRef JSON。 */
function assetIdOf(value: string): string {
  if (ASSET_ID.test(value)) return value;
  if (!value.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(value) as { assetId?: string };
    return parsed.assetId && ASSET_ID.test(parsed.assetId) ? parsed.assetId : '';
  } catch {
    return '';
  }
}

/**
 * 内容列表预览图地址（内容搜索/页面管理的缩略图、列表视图）：
 * 1. 空值 → 默认预览图；
 * 2. 已保存的站内路径或外部 http(s) 地址 → 原样使用；
 * 3. 媒体资产编号/mediaRef → `/media-thumb/{siteId}/{assetId}` 代理（图片缩略/音视频海报/文档封面）；
 * 4. 其他无法识别的值 → 默认预览图。
 */
export function contentPreviewSrc(siteId: string | undefined, raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return defaultPreviewImage;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  const assetId = assetIdOf(value);
  if (assetId && siteId) {
    return `/media-thumb/${encodeURIComponent(siteId)}/${encodeURIComponent(assetId)}`;
  }
  return defaultPreviewImage;
}

export { defaultPreviewImage };
