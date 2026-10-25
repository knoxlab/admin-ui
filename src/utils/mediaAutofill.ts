import type { FormInstance } from 'antd';
import type { FieldDef, MediaAsset } from '../api/types';
import { coerceFieldValue, isEmptyValue } from './fieldValue';

/**
 * 从媒体库选择媒体后的表单自动填写（需求 2026-10-23：
 * 「在关联媒体中从媒体库选择媒体后，其他表单可根据所选择的媒体自动填写」）。
 *
 * <p>两级填写，都遵循**只补空白、不覆盖用户已输入**：</p>
 * <ul>
 *   <li>行内（重复组行）：同前缀的行字段 —— 媒体标题 / 媒体类型 / MIME 类型 / 文件大小 / 媒体预览图；</li>
 *   <li>表单级：标题、资源编码、资源类型、摘要、正文、MIME 类型、文件大小、预览图、AI 标签等
 *       （字段不存在即跳过）。</li>
 * </ul>
 *
 * <p>取值按字段类型归一（ENUM 必须命中既有选项、INTEGER 转数字、TAG 转数组），
 * 且只写入**模型确实定义了的字段码**，避免把无效字段值塞进 fieldValues。</p>
 */

/** 选择发生在重复组行内时的上下文（由 ModelFormRenderer 逐行下发）。 */
export type MediaFillContext = {
  /** 触发选择的 MEDIA_REF 字段码（用于推断行内同前缀字段）。 */
  fieldCode: string;
  /** 重复组槽位（行内选择时有值）。 */
  repeatCode?: string;
  /** 行下标。 */
  rowIndex?: number;
  /** 该重复组的子字段定义（行内只填已定义的子字段）。 */
  childFields?: FieldDef[];
};

/** 只需要读写表单值，便于测试注入。 */
export type FillForm = Pick<FormInstance, 'getFieldValue' | 'setFieldsValue'>;

export type MediaFillOptions = {
  /** 模型顶层字段（含 title_s 等系统字段）—— 决定哪些表单级字段可以被填写。 */
  fields: FieldDef[];
};

/** 行内字段前缀：media_storage_uri_s → media_（无此前缀约定时不做行内填写）。 */
const MEDIA_REF_SUFFIX = '_storage_uri_s';

/** 取素材名去扩展名的编码基串（与前台 UploadPage 的资源编码口径一致）。 */
const stripExt = (s: string) => s.replace(/\.[^.]+$/, '');

/** 从资产 metadata JSON 里取 AI 标签（键 aiTags / ai_tags / tags）。 */
function metadataTags(metadata?: string): string[] | undefined {
  if (!metadata) return undefined;
  try {
    const m = JSON.parse(metadata) as Record<string, unknown>;
    const raw = m.aiTags ?? m.ai_tags ?? m.tags;
    const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw ? raw.split(/[,，\s]+/) : [];
    const tags = list.map((s) => s.trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 依所选媒体自动填写空白字段。
 *
 * @param form 表单实例（内容编辑器的 editorForm）
 * @param asset 所选媒体资产
 * @param ctx  选择上下文（行内选择时含重复组槽位与行下标）
 * @param opts 模型字段清单
 * @returns 实际被填写的字段码（用于提示「已自动填写 n 个字段」）
 */
export function applyMediaAutofill(
  form: FillForm,
  asset: MediaAsset,
  ctx: MediaFillContext,
  opts: MediaFillOptions,
): string[] {
  const filled: string[] = [];
  const name = (asset.title || asset.filename || '').trim();
  if (!name && !asset.mimeType && !asset.fileSize) return filled;
  const base = stripExt(name) || name;

  const fill = (path: (string | number)[], field: FieldDef, raw: unknown) => {
    if (field.readOnly) return;
    const value = coerceFieldValue(field, raw);
    if (value === undefined) return;
    if (!isEmptyValue(form.getFieldValue(path))) return;
    if (path.length === 1) {
      form.setFieldsValue({ [String(path[0])]: value });
    } else {
      const [root, idx, key] = [String(path[0]), Number(path[1]), String(path[2])];
      const rows = form.getFieldValue(root);
      const next = Array.isArray(rows) ? [...rows] : [];
      const cur = next[idx];
      next[idx] = { ...(cur && typeof cur === 'object' ? cur : {}), [key]: value };
      form.setFieldsValue({ [root]: next });
    }
    filled.push(String(path[path.length - 1]));
  };

  // ① 行内填写：同一行里带 media_ 等前缀的兄弟字段。
  const prefix =
    ctx.repeatCode !== undefined && ctx.rowIndex !== undefined && ctx.fieldCode.endsWith(MEDIA_REF_SUFFIX)
      ? ctx.fieldCode.slice(0, -MEDIA_REF_SUFFIX.length) + '_'
      : '';
  if (prefix && ctx.childFields?.length) {
    const byCode = new Map(ctx.childFields.map((f) => [f.code, f]));
    const rowFill = (suffix: string, raw: unknown) => {
      const code = `${prefix}${suffix}`;
      const field = byCode.get(code);
      if (field && ctx.repeatCode !== undefined && ctx.rowIndex !== undefined) {
        fill([ctx.repeatCode, ctx.rowIndex, code], field, raw);
      }
    };
    rowFill('title_s', name);
    rowFill('kind_s', asset.kind);
    rowFill('mime_type_s', asset.mimeType);
    rowFill('file_size_i', asset.fileSize);
    rowFill('thumbnail_url_s', asset.kind === 'image' ? asset.id : undefined);
  }

  // ② 表单级填写：仅模型已定义的字段（title 走内置输入的兜底键）。
  const known = new Map(opts.fields.map((f) => [f.code, f]));
  const builtinTitle: FieldDef = {
    code: 'title',
    name: '标题',
    fieldType: 'STRING',
    required: false,
    sortOrder: 0,
    readOnly: false,
    i18n: false,
    adminIndex: false,
    publicIndex: false,
    sortable: false,
    filterable: false,
    highlight: false,
  };
  const topFill = (code: string, raw: unknown) => {
    const field = known.get(code) || (code === 'title' && !known.has('title_s') ? builtinTitle : undefined);
    if (field) fill([field.code], field, raw);
  };

  topFill('title_s', name);
  topFill('title', name);
  topFill('asset_code_s', base);
  topFill('asset_kind_s', asset.kind);
  topFill('summary_t', name);
  topFill('body_t', name);
  topFill('mime_type_s', asset.mimeType);
  topFill('file_size_i', asset.fileSize);
  // 预览图是 IMAGE 字段（存媒体资产编号）：仅图片素材有缩略图语义，其他类型交给前台按类型回退图标。
  topFill('thumbnail_url_s', asset.kind === 'image' ? asset.id : undefined);
  topFill('ai_tags_ss', metadataTags(asset.metadata));

  return filled;
}
