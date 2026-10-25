import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UVE } from '../protocol';
import { useDragAutoScroll } from '../useDragAutoScroll';

function makeFrame(left: number, top: number, width: number, height: number): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
    left, top, right: left + width, bottom: top + height,
    width, height, x: left, y: top, toJSON: () => ({}),
  } as DOMRect);
  return frame;
}

describe('useDragAutoScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not start the timer when active=false', () => {
    const send = vi.fn();
    const frame = makeFrame(0, 0, 800, 600);
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: false, iframeRef, send }));
    // 5 ticks should be enough to cover the interval window.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends scroll-up when pointer is near the top edge of the iframe', () => {
    const send = vi.fn();
    const frame = makeFrame(100, 200, 800, 600);
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: true, iframeRef, send }));

    // Pointer at y=210 (top + 10), inside the 56px edge zone.
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 210 }));
    });
    // Allow one tick of the 50ms interval to fire.
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(send).toHaveBeenCalledWith(UVE.scrollBy, { top: -18 });
  });

  it('sends scroll-down when pointer is near the bottom edge of the iframe', () => {
    const send = vi.fn();
    const frame = makeFrame(100, 200, 800, 600); // bottom = 800
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: true, iframeRef, send }));

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 790 }));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(send).toHaveBeenCalledWith(UVE.scrollBy, { top: 18 });
  });

  it('does not scroll when pointer is in the middle of the iframe', () => {
    const send = vi.fn();
    const frame = makeFrame(0, 0, 800, 600);
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: true, iframeRef, send }));

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not scroll when pointer is outside the iframe', () => {
    const send = vi.fn();
    const frame = makeFrame(100, 200, 800, 600);
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: true, iframeRef, send }));

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops scrolling once the pointer leaves the edge', () => {
    const send = vi.fn();
    const frame = makeFrame(0, 0, 800, 600);
    const iframeRef = { current: frame } as React.RefObject<HTMLIFrameElement>;
    renderHook(() => useDragAutoScroll({ active: true, iframeRef, send }));

    // Move into top edge, fire one tick.
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 10 }));
      vi.advanceTimersByTime(50);
    });
    expect(send).toHaveBeenCalledTimes(1);
    // Move out of edge, fire another tick.
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
      vi.advanceTimersByTime(50);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
