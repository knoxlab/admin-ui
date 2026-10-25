import type { CSSProperties } from 'react';
import { contentPreviewSrc, defaultPreviewImage } from '../utils/contentPreview';

/**
 * 内容列表预览图（缩略图/列表视图共用）：无预览图、预览图地址无法识别或加载失败时，
 * 统一回退到默认图片，避免列表出现空白格或浏览器破图图标。
 */
export default function ContentPreviewImage({
  siteId,
  value,
  alt,
  width = '100%',
  height = 150,
  className,
  style,
}: {
  siteId?: string;
  value?: string | null;
  alt?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      className={className}
      src={contentPreviewSrc(siteId, value)}
      alt={alt ?? ''}
      loading="lazy"
      onError={(event) => {
        // 只回退一次，避免默认图自身异常时反复触发 onError
        event.currentTarget.onerror = null;
        event.currentTarget.src = defaultPreviewImage;
      }}
      style={{
        width,
        height,
        objectFit: 'cover',
        display: 'block',
        background: '#f5f5f5',
        ...style,
      }}
    />
  );
}
