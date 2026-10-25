import { describe, expect, it } from 'vitest';
import type { FieldDef, MediaAsset } from '../../api/types';
import { applyMediaAutofill, type MediaFillContext } from '../mediaAutofill';

/**
 * 媒体选择自动填写（需求 2026-10-23）：
 * 行内字段与表单级字段只补空白；取值按字段类型归一、只写模型已定义的字段。
 */

const field = (code: string, fieldType = 'STRING', extra: Partial<FieldDef> = {}): FieldDef => ({
  code,
  name: code,
  fieldType,
  required: false,
  sortOrder: 0,
  readOnly: false,
  i18n: false,
  adminIndex: false,
  publicIndex: false,
  sortable: false,
  filterable: false,
  highlight: false,
  ...extra,
});

const asset = (partial: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'asset-1',
  siteId: 's1',
  title: '产品演示.mp4',
  filename: '产品演示.mp4',
  mimeType: 'video/mp4',
  fileSize: 2048,
  contentHash: '',
  currentVersion: 1,
  kind: 'video',
  folderPath: '/研发部/宣传',
  metadata: JSON.stringify({ aiTags: ['演示', '产品'] }),
  ...partial,
});

/** 轻量表单桩：支持 NamePath 读取与顶层/嵌套写入。 */
function makeForm(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const get = (path: unknown): unknown => {
    if (Array.isArray(path)) {
      let cur: unknown = store;
      for (const p of path) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string | number, unknown>)[p as string | number];
      }
      return cur;
    }
    return store[String(path)];
  };
  return {
    store,
    getFieldValue: (path: unknown) => get(path),
    setFieldsValue: (values: Record<string, unknown>) => Object.assign(store, values),
  };
}

const TOP_FIELDS = [
  field('title_s'),
  field('asset_code_s'),
  field('asset_kind_s', 'ENUM', {
    fieldConfig: { options: [{ value: 'image', label: '图片' }, { value: 'video', label: '视频' }] },
  }),
  field('summary_t'),
  field('mime_type_s'),
  field('file_size_i', 'INTEGER'),
  field('thumbnail_url_s', 'IMAGE'),
  field('ai_tags_ss', 'TAG'),
  field('unrelated_s'),
];

const ROW_FIELDS = [
  field('media_storage_uri_s', 'MEDIA_REF'),
  field('media_title_s'),
  field('media_kind_s', 'ENUM', {
    fieldConfig: { options: [{ value: 'image', label: '图片' }, { value: 'video', label: '视频' }] },
  }),
  field('media_mime_type_s'),
  field('media_file_size_i', 'INTEGER'),
  field('media_thumbnail_url_s', 'IMAGE'),
];

const rowCtx = (): MediaFillContext => ({
  fieldCode: 'media_storage_uri_s',
  repeatCode: 'media_items',
  rowIndex: 0,
  childFields: ROW_FIELDS,
});

describe('applyMediaAutofill · 行内 + 表单级自动填写', () => {
  it('选中媒体后补齐行内字段与表单级空白字段（只补空白）', () => {
    const form = makeForm({ media_items: [{}], asset_code_s: 'A-001' });
    const filled = applyMediaAutofill(form, asset(), rowCtx(), { fields: TOP_FIELDS });

    // 行内（media_ 前缀兄弟字段）
    expect(form.store.media_items).toEqual([
      {
        media_title_s: '产品演示.mp4',
        media_kind_s: 'video',
        media_mime_type_s: 'video/mp4',
        media_file_size_i: 2048,
        // 非图片素材不写缩略图（前台按类型回退图标）
        media_thumbnail_url_s: undefined,
      },
    ]);
    // 表单级：标题/摘要/正文/MIME/大小/AI 标签
    expect(form.store.title_s).toBe('产品演示.mp4');
    expect(form.store.summary_t).toBe('产品演示.mp4');
    expect(form.store.mime_type_s).toBe('video/mp4');
    expect(form.store.file_size_i).toBe(2048);
    expect(form.store.ai_tags_ss).toEqual(['演示', '产品']);
    // 已填写的字段不覆盖
    expect(form.store.asset_code_s).toBe('A-001');
    // 无匹配数据的字段不写（thumbnail 仅图片素材、模型未定义字段不写）
    expect(form.store.thumbnail_url_s).toBeUndefined();
    expect('unrelated_s' in form.store).toBe(false);
    expect(filled).not.toContain('asset_code_s');
    expect(filled).toContain('title_s');
  });

  it('资源编码取去扩展名的素材名（与前台口径一致）', () => {
    const form = makeForm({});
    applyMediaAutofill(form, asset(), rowCtx(), { fields: TOP_FIELDS });
    expect(form.store.asset_code_s).toBe('产品演示');
  });

  it('图片素材回填预览图（IMAGE 存资产编号），非图片不填', () => {
    const image = makeForm({});
    applyMediaAutofill(image, asset({ kind: 'image', mimeType: 'image/png' }), rowCtx(), { fields: TOP_FIELDS });
    expect(image.store.thumbnail_url_s).toBe('asset-1');
    expect((image.store.media_items as Record<string, unknown>[])[0].media_thumbnail_url_s).toBe('asset-1');

    const video = makeForm({});
    applyMediaAutofill(video, asset({ kind: 'video' }), rowCtx(), { fields: TOP_FIELDS });
    expect(video.store.thumbnail_url_s).toBeUndefined();
  });

  it('枚举值不在模型选项里时不填（如 font），避免保存被拒', () => {
    const form = makeForm({});
    applyMediaAutofill(form, asset({ kind: 'font' }), rowCtx(), { fields: TOP_FIELDS });
    expect(form.store.asset_kind_s).toBeUndefined();
    expect((form.store.media_items as Record<string, unknown>[])[0].media_kind_s).toBeUndefined();
  });

  it('行内填写不越界：其他行与未定义的子字段不动', () => {
    const form = makeForm({ media_items: [{ media_title_s: '已有' }, {}] });
    applyMediaAutofill(form, asset(), { ...rowCtx(), rowIndex: 1 }, { fields: TOP_FIELDS });
    const rows = form.store.media_items as Record<string, unknown>[];
    expect(rows[0].media_title_s).toBe('已有');
    expect(rows[1].media_title_s).toBe('产品演示.mp4');
    expect(rows[1].media_storage_uri_s).toBeUndefined();
  });

  it('顶层 MEDIA_REF（无重复组上下文）只填表单级字段', () => {
    const form = makeForm({});
    applyMediaAutofill(form, asset(), { fieldCode: 'cover_ref' }, { fields: TOP_FIELDS });
    expect(form.store.media_items).toBeUndefined();
    expect(form.store.title_s).toBe('产品演示.mp4');
  });

  it('无内置标题字段时回填内置 title 键（内容编辑器内置标题输入）', () => {
    const form = makeForm({});
    const fields = TOP_FIELDS.filter((f) => f.code !== 'title_s');
    applyMediaAutofill(form, asset(), { fieldCode: 'cover_ref' }, { fields });
    expect(form.store.title).toBe('产品演示.mp4');
    expect(form.store.title_s).toBeUndefined();
  });

  it('只读字段不被覆盖写入', () => {
    const form = makeForm({});
    const fields = [field('title_s', 'STRING', { readOnly: true })];
    applyMediaAutofill(form, asset(), { fieldCode: 'cover_ref' }, { fields });
    expect(form.store.title_s).toBeUndefined();
  });

  it('不把媒体库目录名写进表单（所属部门/资源组已退役，2026-10-23）', () => {
    const form = makeForm({});
    applyMediaAutofill(form, asset(), rowCtx(), { fields: TOP_FIELDS });
    expect('department_s' in form.store).toBe(false);
    expect('resource_group_s' in form.store).toBe(false);
  });
});
