import { describe, expect, it } from 'vitest';
import { runSandboxRequest, type SandboxCatalog, type SandboxResponse } from '../formSandbox';

/**
 * 客户端表单控制器沙箱（FR-CM-FORMCTRL-002/004）：
 * 脚本只产出「补丁」，合法性由平台按模型字段类型复核；脚本报错不抛到界面。
 */

const catalog: SandboxCatalog = {
  top: [
    { code: 'title_s', fieldType: 'STRING' },
    { code: 'asset_code_s', fieldType: 'STRING' },
    { code: 'asset_kind_s', fieldType: 'ENUM', options: [{ value: 'image', label: '图片' }, { value: 'video', label: '视频' }] },
    { code: 'summary_t', fieldType: 'LONG_TEXT' },
    { code: 'mime_type_s', fieldType: 'STRING' },
    { code: 'file_size_i', fieldType: 'INTEGER' },
    { code: 'thumbnail_url_s', fieldType: 'IMAGE' },
  { code: 'ai_tags_ss', fieldType: 'TAG' },
  { code: 'license_s', fieldType: 'ENUM', options: [{ value: 'cc-by', label: 'CC BY' }, { value: 'public-domain', label: '公有领域' }] },
  { code: 'copyright_owner_s', fieldType: 'STRING' },
  { code: 'copyright_until_dt', fieldType: 'DATE_TIME' },
  { code: 'readonly_s', fieldType: 'STRING', readOnly: true },
  ],
  repeats: {
    media_items: [
      { code: 'media_title_s', fieldType: 'STRING' },
      { code: 'media_kind_s', fieldType: 'ENUM', options: [{ value: 'image', label: '图片' }] },
      { code: 'media_file_size_i', fieldType: 'INTEGER' },
    ],
  },
};

const run = (source: string, hook = 'onMediaSelect', payload: unknown = null, values: Record<string, unknown> = {}): SandboxResponse =>
  runSandboxRequest({ source, hook, payload, values, catalog });

/** 补丁 → 「路径: 值」便于断言。 */
const patchMap = (res: SandboxResponse) =>
  Object.fromEntries(res.patches.map((p) => [p.path.join('.'), p.value]));

describe('runSandboxRequest', () => {
  it('媒体选择后填充空白字段，并按类型归一取值', () => {
    const res = run(
      `return { onMediaSelect(ctx, e) {
         const a = e.assets[0];
         ctx.setValue(['title_s'], a.title);
         ctx.setValue(['file_size_i'], a.fileSize);
         ctx.setValue(['ai_tags_ss'], ['AI', ' 标签 ']);
       } };`,
      'onMediaSelect',
      { assets: [{ title: '城市夜景.jpg', fileSize: '2048' }] },
    );
    expect(res.hooked).toBe(true);
    expect(patchMap(res)).toEqual({
      title_s: '城市夜景.jpg',
      file_size_i: 2048,
      'ai_tags_ss': ['AI', '标签'],
    });
    expect(res.errors).toEqual([]);
  });

  it('ENUM 取值不在模型选项里时丢弃（避免保存被服务端拒绝）', () => {
    const res = run(`return { onMediaSelect(ctx) { ctx.setValue(['asset_kind_s'], 'font'); } };`);
    expect(res.patches).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  it('重复组按 [组码, 行号, 子字段] 写入', () => {
    const res = run(
      `return { onMediaSelect(ctx, e) { ctx.setValue([e.repeat, e.rowIndex, 'media_title_s'], '海报'); } };`,
      'onMediaSelect',
      { repeat: 'media_items', rowIndex: 2 },
    );
    expect(patchMap(res)).toEqual({ 'media_items.2.media_title_s': '海报' });
  });

  it('只读字段不写入；未知字段报错但不中断其它补丁', () => {
    const res = run(
      `return { onMediaSelect(ctx) {
         ctx.setValue(['readonly_s'], 'x');
         ctx.setValue(['nope_s'], 'y');
         ctx.setValue(['title_s'], 'ok');
       } };`,
    );
    expect(patchMap(res)).toEqual({ title_s: 'ok' });
    expect(res.errors.join()).toContain('nope_s');
  });

  it('没有声明对应钩子时 hooked=false（平台兜底逻辑可继续）', () => {
    const res = run(`return { onInit(ctx) {} };`, 'onMediaSelect');
    expect(res.hooked).toBe(false);
    expect(res.patches).toEqual([]);
  });

  it('脚本抛错只记录错误，不影响表单', () => {
    const res = run(`return { onSave() { throw new Error('规则坏了'); } };`, 'onSave');
    expect(res.hooked).toBe(true);
    expect(res.patches).toEqual([]);
    expect(res.errors).toEqual(['规则坏了']);
  });

  it('ctx.fail 阻断保存', () => {
    const res = run(`return { onSave(ctx) { ctx.fail('必须填写版权方'); } };`, 'onSave');
    expect(res.blocking).toBe(true);
    expect(res.errors).toEqual(['必须填写版权方']);
  });

  it('拒绝网络 / 全局访问写法', () => {
    const res = run(`return { onInit() { fetch('/api'); } };`, 'onInit');
    expect(res.hooked).toBe(false);
    expect(res.errors.join()).toContain('fetch');
  });

  it('屏蔽的全局在脚本体内是 undefined（形参遮蔽，不改 Worker 真实全局）', () => {
    const res = run(
      `return { onInit(ctx) { ctx.notify(typeof navigator + ',' + typeof location + ',' + typeof Function); } };`,
      'onInit',
    );
    expect(res.notices).toEqual(['undefined,undefined,undefined']);
  });

  it('显式引用 window / self 一律拒绝', () => {
    const res = run(`return { onInit() { window.alert(1); } };`, 'onInit');
    expect(res.hooked).toBe(false);
    expect(res.errors.join()).toContain('window');
  });

  it('ctx.notify 收集提示，空提示忽略', () => {
    const res = run(`return { onInit(ctx) { ctx.notify('提示'); ctx.notify('  '); } };`, 'onInit');
    expect(res.notices).toEqual(['提示']);
  });

  it('ctx.hide 返回本次应隐藏的字段；hide/show 在同一钩子内成对生效', () => {
    const hidden = run(
      `return { onInit(ctx) { ctx.hide('summary_t'); ctx.hide('mime_type_s'); } };`,
      'onInit',
    );
    expect(hidden.hidden).toEqual(['summary_t', 'mime_type_s']);

    const restored = run(
      `return { onInit(ctx) { ctx.hide('summary_t'); ctx.show('summary_t'); ctx.hide('mime_type_s'); } };`,
      'onInit',
    );
    expect(restored.hidden).toEqual(['mime_type_s']);
  });

  it('hide 未知字段报错且不隐藏（避免拼错字段码时静默失效）', () => {
    const res = run(`return { onInit(ctx) { ctx.hide('nope_s'); ctx.hide('title_s'); } };`, 'onInit');
    expect(res.hidden).toEqual(['title_s']);
    expect(res.errors.join()).toContain('nope_s');
  });

  it('每次事件的隐藏集合独立（调用方按「整集替换」语义使用）', () => {
    const first = run(`return { onInit(ctx) { ctx.hide('summary_t'); } };`, 'onInit');
    const second = run(`return { onInit(ctx) { ctx.hide('mime_type_s'); } };`, 'onInit');
    expect(first.hidden).toEqual(['summary_t']);
    expect(second.hidden).toEqual(['mime_type_s']);
  });

  it('重复组子字段也可以隐藏（按字段码寻址）', () => {
    const res = run(
      `return { onInit(ctx) { ctx.hide('media_kind_s'); } };`,
      'onInit',
    );
    expect(res.hidden).toEqual(['media_kind_s']);
  });

  it('ctx.clear 产生「清空」补丁（值为 undefined，与 setValue 的「不写」区分）', () => {
    const res = run(
      `return { onFieldChange(ctx) { ctx.clear(['summary_t']); ctx.clear(['media_items', 0, 'media_title_s']); } };`,
      'onFieldChange',
      null,
      { summary_t: '旧摘要' },
    );
    expect(res.patches).toEqual([
      { path: ['summary_t'], value: undefined },
      { path: ['media_items', 0, 'media_title_s'], value: undefined },
    ]);
  });

  it('clear 未知字段报错、只读字段静默忽略', () => {
    const res = run(
      `return { onInit(ctx) { ctx.clear(['nope_s']); ctx.clear(['readonly_s']); } };`,
      'onInit',
    );
    expect(res.patches).toEqual([]);
    expect(res.errors.join()).toContain('nope_s');
  });
});
