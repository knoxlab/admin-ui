import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { templatesApi } from '../../api';
import type { FieldDef } from '../../api/types';
import {
  buildSandboxCatalog,
  clearControllerScriptCache,
  createFormController,
  resolveControllerScript,
  splitControllerPath,
  toPlainValues,
} from '../formController';

vi.mock('../../api', () => ({
  templatesApi: { list: vi.fn(), getFile: vi.fn() },
}));

const projects = [
  { id: 'p1', name: 'react-dam', projectType: 'REACT' },
  { id: 'p2', name: 'shared', projectType: 'STATIC' },
];

const field = (code: string, fieldType: string, extra: Partial<FieldDef> = {}): FieldDef => ({
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

describe('splitControllerPath', () => {
  it('支持工程名前缀与正反斜杠', () => {
    expect(splitControllerPath('scripts/a.js')).toEqual({ path: 'scripts/a.js' });
    expect(splitControllerPath('/scripts/a.js')).toEqual({ path: 'scripts/a.js' });
    expect(splitControllerPath('react-dam:/scripts/a.js')).toEqual({ project: 'react-dam', path: 'scripts/a.js' });
    expect(splitControllerPath('react-dam:scripts\\a.js')).toEqual({ project: 'react-dam', path: 'scripts/a.js' });
    expect(splitControllerPath('  ')).toEqual({ path: '' });
  });
});

describe('resolveControllerScript', () => {
  beforeEach(() => {
    clearControllerScriptCache();
    vi.mocked(templatesApi.list).mockReset();
    vi.mocked(templatesApi.getFile).mockReset();
  });

  afterEach(() => {
    clearControllerScriptCache();
  });

  it('按工程顺序找到第一个存在的脚本并缓存', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue(projects as never);
    vi.mocked(templatesApi.getFile)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ path: 'scripts/a.js', content: 'return {};', hash: 'h', updatedAt: '' });

    const first = await resolveControllerScript('site-1', 'scripts/a.js');
    expect(first).toEqual({ content: 'return {};', projectId: 'p2', path: 'scripts/a.js' });

    // 第二次命中缓存，不再请求
    const again = await resolveControllerScript('site-1', 'scripts/a.js');
    expect(again).toEqual(first);
    expect(templatesApi.list).toHaveBeenCalledTimes(1);
    expect(templatesApi.getFile).toHaveBeenCalledTimes(2);
  });

  it('工程名前缀只在该工程内查找，找不到返回 null', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue(projects as never);
    vi.mocked(templatesApi.getFile).mockRejectedValue(new Error('404'));

    const res = await resolveControllerScript('site-1', 'react-dam:scripts/missing.js');
    expect(res).toBeNull();
    expect(templatesApi.getFile).toHaveBeenCalledWith('p1', 'scripts/missing.js');
    expect(templatesApi.getFile).toHaveBeenCalledTimes(1);
  });

  it('空内容视为不存在', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue(projects as never);
    vi.mocked(templatesApi.getFile).mockResolvedValue({ path: 'x.js', content: '  ', hash: 'h', updatedAt: '' } as never);
    await expect(resolveControllerScript('site-1', 'x.js')).resolves.toBeNull();
  });
});

describe('buildSandboxCatalog', () => {
  it('顶层字段与重复组子字段都带 ENUM 选项，脚本才能按选项校验', () => {
    const catalog = buildSandboxCatalog(
      [field('asset_kind_s', 'ENUM', { fieldConfig: { options: [{ value: 'image', label: '图片' }] } })],
      new Map([['media_items', { children: [field('media_kind_s', 'STRING')] }]]),
    );
    expect(catalog.top[0].options).toEqual([{ value: 'image', label: '图片' }]);
    expect(catalog.repeats.media_items.map((f) => f.code)).toEqual(['media_kind_s']);
  });
});

describe('toPlainValues', () => {
  it('丢弃函数，保留嵌套结构（可结构化克隆）', () => {
    const plain = toPlainValues({ a: 1, fn: () => 1, rows: [{ b: 'x' }] });
    expect(plain).toEqual({ a: 1, rows: [{ b: 'x' }] });
  });
});

describe('createFormController', () => {
  beforeEach(() => {
    clearControllerScriptCache();
    vi.mocked(templatesApi.list).mockReset();
    vi.mocked(templatesApi.getFile).mockReset();
  });

  const host = () => ({
    getValues: () => ({}),
    applyValue: vi.fn(),
    notify: vi.fn(),
    warn: vi.fn(),
  });

  it('模型没配脚本时零请求、零副作用', async () => {
    const h = host();
    const ctrl = createFormController({ siteId: 'site-1', controllerPath: '', getCatalog: () => ({ top: [], repeats: {} }), host: h });
    expect(ctrl.configured).toBe(false);
    const res = await ctrl.run('onInit');
    expect(res.hooked).toBe(false);
    expect(templatesApi.list).not.toHaveBeenCalled();
    ctrl.dispose();
  });

  it('脚本缺失时告警一次并让平台兜底继续', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue([{ id: 'p1', name: 'react-dam' }] as never);
    vi.mocked(templatesApi.getFile).mockRejectedValue(new Error('404'));
    const h = host();
    const ctrl = createFormController({
      siteId: 'site-1',
      controllerPath: 'scripts/missing.js',
      getCatalog: () => ({ top: [], repeats: {} }),
      host: h,
    });
    const first = await ctrl.run('onInit');
    const second = await ctrl.run('onSave');
    expect(first.hooked).toBe(false);
    expect(second.hooked).toBe(false);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(h.warn).mock.calls[0][0])).toContain('scripts/missing.js');
    ctrl.dispose();
  });
});
