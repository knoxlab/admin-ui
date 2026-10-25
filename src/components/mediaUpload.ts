/**
 * 媒体库上传编排（富文本/图片字段复用）：社区版为本地存储，multipart 直传
 * `/sites/:siteId/media/upload`，服务端写入 `powercms.media.storage-root` 并登记资产。
 */
import { mediaApi } from '../api';
import type { MediaAsset } from '../api/types';

export interface UploadedAsset {
  assetId: string;
  status: string;
}

/** 上传文件至媒体库（本地存储），返回资产 ID 与状态。 */
export async function uploadToLibrary(
  siteId: string,
  file: File,
  onPct?: (pct: number) => void,
): Promise<UploadedAsset> {
  const progress = onPct ?? (() => undefined);
  const result = await mediaApi.upload(siteId, file, progress);
  progress(100);
  return result;
}

/** 兼容旧调用：上传后直接取资产行。 */
export async function uploadAndFetchAsset(siteId: string, file: File): Promise<MediaAsset | null> {
  const result = await uploadToLibrary(siteId, file);
  const detail = await mediaApi.detail(siteId, result.assetId).catch(() => null);
  return detail?.asset ?? null;
}
