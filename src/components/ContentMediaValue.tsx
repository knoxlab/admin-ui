import { useState } from 'react';
import { Image, Modal, Space, Tooltip, Typography } from 'antd';
import {
  FileTextOutlined, PlayCircleFilled, SoundOutlined, PictureOutlined,
} from '@ant-design/icons';
import { t } from '../i18n/locale';

/**
 * 只读媒体取值（工作流待办「内容明细」里的 IMAGE / MEDIA_REF 字段）。
 *
 * <p>审核人要看的是**媒体本身**，不是数据库里的资产编号：此前这里先输出原始值（裸 UUID 或
 * mediaRef JSON）再附一行缩略图，左侧那串 UUID 既不可读也占地方。现在只保留预览图：
 * 悬停给出「点击查看大图 / 视频」提示，点击打开大图（可缩放）或视频/文档预览。</p>
 *
 * <p>取值形态与 {@link MediaRefPicker} 保存的一致（裸 UUID、`{assetId,kind}` JSON、外部 URL），
 * 也兼容历史脏数据（JSON 数组、纯文本）。缩略图统一走 `/media-thumb` 代理：图片回源流、
 * 音视频回 poster 截帧、文档回封面 —— 任意种类的字段都能给出一张可点开的预览图。</p>
 */

const ASSET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|bmp|svg|avif|tiff?)(?:[?#].*)?$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpe?g|ts|m3u8)(?:[?#].*)?$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|wma)(?:[?#].*)?$/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf|odt|ods|odp)(?:[?#].*)?$/i;

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'other' | 'unknown';

/** 媒体引用条目：`assetId` 与 `url` 互斥；`text` 是无法识别的原始文本（不展示 UUID）。 */
export type MediaEntry = {
  assetId?: string;
  url?: string;
  kind?: string;
  filename?: string;
  text?: string;
};

const THUMB_SIZE = 96;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kindFromExtension(text?: string): MediaKind | undefined {
  if (!text) return undefined;
  if (IMAGE_EXT.test(text)) return 'image';
  if (VIDEO_EXT.test(text)) return 'video';
  if (AUDIO_EXT.test(text)) return 'audio';
  if (DOC_EXT.test(text)) return 'document';
  return undefined;
}

function normalizeKind(raw?: string): MediaKind | undefined {
  const value = textOf(raw).toLowerCase();
  if (!value) return undefined;
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'document') return value;
  if (value === 'font') return 'other';
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  if (value === 'application/pdf' || value.startsWith('application/vnd.openxmlformats')
    || value.startsWith('application/msword') || value.startsWith('text/')) return 'document';
  return undefined;
}

/**
 * 解析字段值 → 媒体条目列表。
 * 支持：裸 UUID、`{assetId, kind, filename}` / `{url}` JSON、JSON 数组、外部 http(s) URL、
 * 站内绝对路径；无法识别的文本按原样保留（不猜测、不吞掉审核人该看到的信息）。
 */
export function parseMediaEntries(value: unknown): MediaEntry[] {
  const out: MediaEntry[] = [];
  const walk = (item: unknown) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const rawId = textOf(obj.assetId);
      const assetId = ASSET_ID.test(rawId) ? rawId : undefined;
      const url = textOf(obj.url);
      if (!assetId && !url) return;
      out.push({
        assetId,
        url: url || undefined,
        kind: textOf(obj.kind) || textOf(obj.mimeType) || undefined,
        filename: textOf(obj.filename) || textOf(obj.name) || undefined,
      });
      return;
    }
    const text = String(item).trim();
    if (!text) return;
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        walk(JSON.parse(text));
      } catch {
        // 不是合法 JSON：按普通文本处理，别因为一个坏值丢掉整组媒体
        out.push({ text });
      }
      return;
    }
    if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
      out.push({ url: text });
      return;
    }
    if (ASSET_ID.test(text)) {
      out.push({ assetId: text });
      return;
    }
    out.push({ text });
  };
  walk(value);
  return out;
}

/** 条目种类：优先取保存时记录的 kind/mimeType，其次按文件名/URL 扩展名推断。 */
export function mediaEntryKind(entry: MediaEntry, fieldType?: string): MediaKind {
  const declared = normalizeKind(entry.kind);
  if (declared) return declared;
  const byName = kindFromExtension(entry.filename);
  if (byName) return byName;
  const byUrl = kindFromExtension(entry.url);
  if (byUrl) return byUrl;
  // IMAGE 字段存的就是图片资产编号，无需额外元数据即可断定是图片
  if (fieldType === 'IMAGE') return 'image';
  return 'unknown';
}

const HINTS: Record<MediaKind, string> = {
  image: '点击查看大图',
  video: '点击查看视频',
  audio: '点击收听音频',
  document: '点击查看文档',
  other: '点击查看预览',
  // 历史数据常常只存资产编号、不带 kind：预览页会按种类自己渲染，提示按「大图/视频」覆盖两种情况
  unknown: '点击查看大图 / 视频预览',
};

function hintOf(kind: MediaKind): string {
  return t(HINTS[kind]);
}

function thumbSrcOf(siteId: string, entry: MediaEntry): string {
  if (entry.assetId) {
    return `/media-thumb/${encodeURIComponent(siteId)}/${encodeURIComponent(entry.assetId)}`;
  }
  return entry.url ?? '';
}

/** 大图地址：图片走 `/media-file` 原件（可缩放），其余走 `/media-preview` 预览页。 */
function fullSrcOf(siteId: string, entry: MediaEntry): string {
  if (entry.assetId) {
    return `/media-preview/${encodeURIComponent(siteId)}/${encodeURIComponent(entry.assetId)}`;
  }
  return entry.url ?? '';
}

function imageSrcOf(siteId: string, entry: MediaEntry): string {
  return entry.assetId
    ? `/media-file/${encodeURIComponent(siteId)}/${encodeURIComponent(entry.assetId)}`
    : entry.url ?? '';
}

function MediaThumb({
  siteId, entry, fieldType, onPreview,
}: {
  siteId: string;
  entry: MediaEntry;
  fieldType?: string;
  onPreview: (entry: MediaEntry) => void;
}) {
  const [broken, setBroken] = useState(false);
  const kind = mediaEntryKind(entry, fieldType);
  const hint = hintOf(kind);
  const label = entry.filename || '';
  const thumbSrc = thumbSrcOf(siteId, entry);

  // 图片：antd Image 自带大图灯箱（缩放/旋转），悬停遮罩直接给出提示文案
  if (kind === 'image') {
    return (
      <Image
        src={thumbSrc}
        alt={label || t('图片')}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        style={{
          objectFit: 'cover',
          borderRadius: 4,
          border: '1px solid #f0f0f0',
          background: '#fafafa',
          cursor: 'zoom-in',
        }}
        preview={{
          src: imageSrcOf(siteId, entry),
          mask: <span style={{ fontSize: 12 }}>{hint}</span>,
        }}
      />
    );
  }

  const overlay = kind === 'video' || kind === 'audio'
    ? (kind === 'video'
      ? <PlayCircleFilled style={{ fontSize: 32, color: '#fff' }} />
      : <SoundOutlined style={{ fontSize: 28, color: '#fff' }} />)
    : null;

  return (
    <Tooltip
      title={label ? <span>{hint}<br />{label}</span> : hint}
      placement="top"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={hint}
        onClick={() => onPreview(entry)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPreview(entry);
          }
        }}
        style={{
          position: 'relative',
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid #f0f0f0',
          background: '#fafafa',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumbSrc && !broken
          ? (
            <img
              src={thumbSrc}
              alt={label}
              onError={() => setBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
          : <FileTextOutlined style={{ fontSize: 28, color: '#bfbfbf' }} />}
        {overlay && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.28)',
              pointerEvents: 'none',
            }}
          >
            {overlay}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

export type ContentMediaValueProps = {
  siteId: string;
  /** 字段类型：IMAGE 字段没有 kind 元数据也能判定为图片。 */
  fieldType?: string;
  value: unknown;
};

/**
 * IMAGE / MEDIA_REF 字段的只读渲染：只给预览图（可选文件名），不显示资产编号。
 * 点击图片 → 大图灯箱；点击视频/文档等 → 预览弹窗（视频走播放器页）。
 */
export default function ContentMediaValue({ siteId, fieldType, value }: ContentMediaValueProps) {
  const entries = parseMediaEntries(value);
  const [preview, setPreview] = useState<MediaEntry | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  if (!entries.length) return <Typography.Text type="secondary">—</Typography.Text>;

  const openPreview = (entry: MediaEntry) => {
    setPreviewBroken(false);
    setPreview(entry);
  };
  const closePreview = () => setPreview(null);

  const previewKind = preview ? mediaEntryKind(preview, fieldType) : 'unknown';
  const previewSrc = preview ? fullSrcOf(siteId, preview) : '';
  // 外部 URL 的音频/视频直接交给原生控件：第三方站点基本都会用 X-Frame-Options 拦 iframe
  const nativeMedia = Boolean(preview && !preview.assetId && (previewKind === 'video' || previewKind === 'audio'));

  return (
    <div>
      <Space wrap size={8}>
        {entries.map((entry, index) => {
          if (entry.text) {
            return (
              <Typography.Text key={`${entry.text}:${index}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {entry.text}
              </Typography.Text>
            );
          }
          return (
            <MediaThumb
              key={entry.assetId || entry.url || index}
              siteId={siteId}
              entry={entry}
              fieldType={fieldType}
              onPreview={openPreview}
            />
          );
        })}
      </Space>
      <Modal
        open={preview !== null}
        title={preview?.filename || t('媒体预览')}
        footer={null}
        width={880}
        onCancel={closePreview}
        destroyOnHidden
      >
        {preview && previewSrc && (
          nativeMedia ? (
            previewKind === 'audio'
              ? <audio controls autoPlay src={previewSrc} style={{ width: '100%' }} />
              : <video controls autoPlay src={previewSrc} style={{ width: '100%', maxHeight: '70vh', background: '#000' }} />
          ) : previewBroken ? (
            <Space direction="vertical">
              <Typography.Text type="secondary">{t('该媒体暂无法预览。')}</Typography.Text>
              <a href={previewSrc} target="_blank" rel="noreferrer">{t('在新窗口打开')}</a>
            </Space>
          ) : (
            <iframe
              title={preview.filename || t('媒体预览')}
              src={previewSrc}
              width="100%"
              height={520}
              style={{ border: 0 }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              onError={() => setPreviewBroken(true)}
            />
          )
        )}
        {preview && !previewSrc && (
          <Space size={6}>
            <PictureOutlined />
            <Typography.Text type="secondary">{t('该媒体暂无法预览。')}</Typography.Text>
          </Space>
        )}
      </Modal>
    </div>
  );
}
