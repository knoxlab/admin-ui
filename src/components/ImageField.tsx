import { useEffect, useState } from 'react';
import { Button, Space, Upload, message } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { t } from '../i18n/locale';
import { uploadToLibrary } from './mediaUpload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 图片字段存的是 Knox 媒体资产编号，也兼容带 assetId 的 JSON。 */
export function imageAssetId(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (UUID.test(text)) return text;
  if (!text.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(text) as { assetId?: string };
    return parsed.assetId && UUID.test(parsed.assetId) ? parsed.assetId : '';
  } catch {
    return '';
  }
}

function uploadMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'response' in reason) {
    const data = (reason as { response?: { data?: { message?: string } } }).response?.data;
    if (data?.message) return data.message;
  }
  return reason instanceof Error ? reason.message : t('图片上传失败');
}

/**
 * 图片字段：选择本地图片后写入媒体库（本地盘或 Knox 由服务端决定），表单值保存资产编号。
 * 资源预览图（digital_asset.thumbnail_url_s）复用本控件——编辑时可本地「更换图片」。
 * 表单内预览走 /media-thumb 代理（图片缩略/音视频海报/文档封面全类型回源，
 * 覆盖服务端同步进来的非图片原件资产编号）；代理无图时隐藏预览，不影响再次上传。
 */
export default function ImageField({
  siteId,
  disabled,
  id,
  value,
  onChange,
}: {
  siteId: string;
  disabled?: boolean;
  id?: string;
  value?: unknown;
  onChange?: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const assetId = imageAssetId(value);
  useEffect(() => setPreviewBroken(false), [assetId]);
  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const image = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    if (!image) {
      message.warning(t('请选择图片文件'));
      return Upload.LIST_IGNORE;
    }
    if (!siteId) {
      message.warning(t('缺少站点，无法上传'));
      return Upload.LIST_IGNORE;
    }
    setBusy(true);
    void uploadToLibrary(siteId, file)
      .then((stored) => {
        onChange?.(stored.assetId);
        message.success(t('图片已上传'));
      })
      .catch((reason: unknown) => message.error(uploadMessage(reason)))
      .finally(() => setBusy(false));
    return Upload.LIST_IGNORE;
  };
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {assetId && !previewBroken ? (
        <img
          alt=""
          src={`/media-thumb/${siteId}/${assetId}`}
          onError={() => setPreviewBroken(true)}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 220, objectFit: 'contain', background: '#f5f5f5' }}
        />
      ) : null}
      <Space>
        <Upload accept="image/*" showUploadList={false} disabled={disabled || busy} beforeUpload={beforeUpload}>
          <Button id={id} icon={<UploadOutlined />} loading={busy} disabled={disabled}>
            {assetId ? t('更换图片') : t('上传图片')}
          </Button>
        </Upload>
        {assetId && !disabled ? (
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => onChange?.('')}>
            {t('移除')}
          </Button>
        ) : null}
      </Space>
    </Space>
  );
}
