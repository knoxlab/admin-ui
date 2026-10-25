import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormInstance } from 'antd';
import type { ContentType } from '../../api/types';
import { useFormController } from '../useFormController';
import { NOT_HANDLED, createFormController } from '../formController';

vi.mock('../formController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../formController')>();
  return { ...actual, createFormController: vi.fn() };
});

const mockCreate = vi.mocked(createFormController);

const type = (formController?: string) =>
  ({ id: 'ct-1', code: 'digital_asset', formController }) as unknown as ContentType;

/** 只记录写入，不模拟 antd 行为。 */
const fakeForm = () => {
  const store: Record<string, unknown> = {};
  const form = {
    getFieldsValue: () => ({ ...store }),
    getFieldValue: (name: string | (string | number)[]) =>
      Array.isArray(name) ? name.reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], store) : store[name],
    setFieldsValue: vi.fn((values: Record<string, unknown>) => Object.assign(store, values)),
  };
  return { form: form as unknown as FormInstance, store };
};

const ok = (extra: Partial<typeof NOT_HANDLED> = {}) => ({
  ...NOT_HANDLED,
  hooked: true,
  ...extra,
});

describe('useFormController', () => {
  beforeEach(() => mockCreate.mockReset());

  it('模型没配脚本时不创建控制器，run 直接返回未接管', async () => {
    const { form } = fakeForm();
    const { result } = renderHook(() =>
      useFormController({ siteId: 's1', form, getCatalog: () => ({ top: [], repeats: {} }) }),
    );
    const res = await result.current.run(type(), 'onInit');
    expect(res.hooked).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('脚本声明钩子时把隐藏集合整集交给 onVisibility', async () => {
    const run = vi.fn().mockResolvedValue(ok({ hidden: ['summary_t'] }));
    mockCreate.mockReturnValue({ configured: true, run, dispose: vi.fn() });
    const { form } = fakeForm();
    const onVisibility = vi.fn();
    const { result } = renderHook(() =>
      useFormController({
        siteId: 's1',
        form,
        getCatalog: () => ({ top: [], repeats: {} }),
        onVisibility,
      }),
    );

    await act(async () => {
      await result.current.run(type('scripts/a.js'), 'onInit');
    });
    expect(onVisibility).toHaveBeenCalledWith(['summary_t']);
  });

  it('脚本没实现该钩子时不清空已有隐藏结果', async () => {
    const run = vi.fn().mockResolvedValue({ ...NOT_HANDLED });
    mockCreate.mockReturnValue({ configured: true, run, dispose: vi.fn() });
    const { form } = fakeForm();
    const onVisibility = vi.fn();
    const { result } = renderHook(() =>
      useFormController({
        siteId: 's1',
        form,
        getCatalog: () => ({ top: [], repeats: {} }),
        onVisibility,
      }),
    );
    await act(async () => {
      await result.current.run(type('scripts/a.js'), 'onSave');
    });
    expect(onVisibility).not.toHaveBeenCalled();
  });

  it('host.applyValue：顶层字段直接写，重复组按行整体回写数组', () => {
    const run = vi.fn().mockResolvedValue(ok());
    mockCreate.mockReturnValue({ configured: true, run, dispose: vi.fn() });
    const { form, store } = fakeForm();
    store.media_items = [{}, {}];
    const { result } = renderHook(() =>
      useFormController({ siteId: 's1', form, getCatalog: () => ({ top: [], repeats: {} }) }),
    );
    void result.current.run(type('scripts/a.js'), 'onInit');

    const host = mockCreate.mock.calls[0][0].host;
    host.applyValue(['title_s'], '标题');
    expect(store.title_s).toBe('标题');

    host.applyValue(['media_items', 1, 'media_title_s'], '第二行');
    expect(store.media_items).toEqual([{}, { media_title_s: '第二行' }]);

    // 行号越界 / 路径层级不支持时静默忽略，不破坏数组
    host.applyValue(['media_items', 9, 'media_title_s'], '越界');
    host.applyValue(['a', 'b'], '层级不对');
    expect(store.media_items).toEqual([{}, { media_title_s: '第二行' }]);
  });

  it('切换模型时 dispose 旧实例（脚本不残留）', async () => {
    const dispose = vi.fn();
    mockCreate.mockReturnValue({ configured: true, run: vi.fn().mockResolvedValue(ok()), dispose });
    const { form } = fakeForm();
    const { result } = renderHook(() =>
      useFormController({ siteId: 's1', form, getCatalog: () => ({ top: [], repeats: {} }) }),
    );
    await act(async () => {
      await result.current.run(type('scripts/a.js'), 'onInit');
    });
    await act(async () => {
      await result.current.run(type('scripts/b.js'), 'onInit');
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
