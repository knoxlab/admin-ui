// Vitest 全局测试 setup。
// 当前没有跨用例共享的全局 mock，保留扩展点。
import { vi } from 'vitest';
import { configure } from '@testing-library/react';

// antd + jsdom 渲染开销较大，全量并行时 Testing Library 默认 1s 异步等待偶发超时；
// 统一放宽异步工具超时，避免与业务代码无关的偶发失败。
configure({ asyncUtilTimeout: 15000 });

// antd 的 message 在 jsdom 下会尝试创建真实 DOM，单元测试里只需要 no-op。
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    message: {
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

// jsdom 缺 PointerEvent；useDragAutoScroll 等测试需要它。
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;
    public pressure: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
      this.pressure = params.pressure ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

// antd 组件依赖 window.matchMedia（响应式、Table 列宽测量等）。
if (typeof window.matchMedia !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// jsdom 不实现 getComputedStyle(elt, pseudoElt)；rc-table 测滚动条时调用。
// 用真实实现覆盖（jsdom 的 getComputedStyle(elt) 已可用，只缺伪元素分支）。
const originalGetComputedStyle = window.getComputedStyle.bind(window);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
  if (pseudoElt) {
    return originalGetComputedStyle(elt);
  }
  return originalGetComputedStyle(elt);
};

// i18n 依赖 localStorage；jsdom 已经提供，无需 mock。

