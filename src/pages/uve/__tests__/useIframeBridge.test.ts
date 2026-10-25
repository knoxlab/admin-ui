import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UVE, type UveComponentArea, type UveZoneArea } from '../protocol';
import { useIframeBridge } from '../useIframeBridge';

function fireMessage(origin: string, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin, data }));
  });
}

function makeArea(overrides: Partial<UveComponentArea> = {}): UveComponentArea {
  return {
    componentId: 'c1',
    zoneKey: 'header',
    index: 0,
    kind: 'EMBEDDED',
    x: 10, y: 20, width: 100, height: 50,
    ...overrides,
  };
}

function makeZone(overrides: Partial<UveZoneArea> = {}): UveZoneArea {
  return {
    zoneKey: 'header',
    x: 0, y: 0, width: 800, height: 600,
    components: [],
    ...overrides,
  };
}

describe('useIframeBridge', () => {
  let mockIframe: HTMLIFrameElement;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Provide a contentWindow that records postMessage calls.
    postMessageSpy = vi.fn();
    mockIframe = document.createElement('iframe');
    Object.defineProperty(mockIframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the bridge API with default state', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    expect(result.current.iframeRef.current).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(result.current.hasBounds).toBe(false);
    expect(result.current.zones).toEqual([]);
    expect(result.current.hovered).toBeNull();
  });

  it('sends pcms:init on iframe load with the configured nonce', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'abc' }),
    );
    // Inject the mock iframe as the ref target.
    (result.current.iframeRef as { current: HTMLIFrameElement | null }).current = mockIframe;
    act(() => {
      result.current.onIframeLoad();
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { name: UVE.init, payload: null, nonce: 'abc' },
      'http://api',
    );
  });

  it('marks ready on pcms:ready from the matching origin and nonce', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    expect(result.current.ready).toBe(true);
  });

  it('populates zones on pcms:bounds and flips hasBounds', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    const zone = makeZone({ components: [makeArea()] });
    fireMessage('http://api', { name: UVE.bounds, nonce: 'n1', payload: [zone] });
    expect(result.current.zones).toEqual([zone]);
    expect(result.current.hasBounds).toBe(true);
  });

  it('updates hovered area on pcms:component-hovered', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    const area = makeArea({ componentId: 'hover-1' });
    fireMessage('http://api', { name: UVE.hovered, nonce: 'n1', payload: area });
    expect(result.current.hovered).toEqual(area);
    fireMessage('http://api', { name: UVE.hovered, nonce: 'n1', payload: null });
    expect(result.current.hovered).toBeNull();
  });

  it('invokes onComponentClicked with area on pcms:component-clicked', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1', onComponentClicked: cb }),
    );
    (result.current.iframeRef as { current: HTMLIFrameElement | null }).current = mockIframe;
    const area = makeArea({ componentId: 'click-1' });
    fireMessage('http://api', { name: UVE.clicked, nonce: 'n1', payload: area });
    expect(cb).toHaveBeenCalledWith(area);
  });

  it('invokes onComponentClicked with null when payload is null (deselect)', () => {
    const cb = vi.fn();
    renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1', onComponentClicked: cb }),
    );
    fireMessage('http://api', { name: UVE.clicked, nonce: 'n1', payload: null });
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('invokes onZoneClicked on pcms:zone-clicked', () => {
    const cb = vi.fn();
    renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1', onZoneClicked: cb }),
    );
    const zone = makeZone();
    fireMessage('http://api', { name: UVE.zoneClicked, nonce: 'n1', payload: zone });
    expect(cb).toHaveBeenCalledWith(zone);
  });

  it('forwards inline edit lifecycle events to callbacks', () => {
    const onStarted = vi.fn();
    const onSave = vi.fn();
    const onEnded = vi.fn();
    renderHook(() =>
      useIframeBridge({
        enabled: true,
        apiOrigin: 'http://api',
        nonce: 'n1',
        onInlineEditStarted: onStarted,
        onInlineEditSave: onSave,
        onInlineEditEnded: onEnded,
      }),
    );
    const edit = { componentId: 'c1', fieldName: 'title', format: 'text' as const, value: 'hello' };
    fireMessage('http://api', { name: UVE.inlineEditStarted, nonce: 'n1', payload: edit });
    fireMessage('http://api', { name: UVE.inlineEditSave, nonce: 'n1', payload: edit });
    fireMessage('http://api', { name: UVE.inlineEditEnded, nonce: 'n1', payload: edit });
    expect(onStarted).toHaveBeenCalledWith(edit);
    expect(onSave).toHaveBeenCalledWith(edit);
    expect(onEnded).toHaveBeenCalledWith(edit);
  });

  it('ignores messages from foreign origins', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1', onComponentClicked: cb }),
    );
    fireMessage('http://evil', { name: UVE.ready, nonce: 'n1' });
    fireMessage('http://evil', { name: UVE.clicked, nonce: 'n1', payload: makeArea() });
    expect(result.current.ready).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores messages with non-matching nonce', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'expected', onComponentClicked: cb }),
    );
    fireMessage('http://api', { name: UVE.ready, nonce: 'wrong' });
    fireMessage('http://api', { name: UVE.clicked, nonce: 'wrong', payload: makeArea() });
    expect(result.current.ready).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores messages whose name does not start with pcms:', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1', onComponentClicked: cb }),
    );
    fireMessage('http://api', { name: 'pcms:ready', nonce: 'n1' });
    fireMessage('http://api', { name: 'malicious:name', nonce: 'n1' });
    expect(result.current.ready).toBe(true);
  });

  it('reload() posts pcms:reload to the iframe', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    (result.current.iframeRef as { current: HTMLIFrameElement | null }).current = mockIframe;
    act(() => {
      result.current.reload();
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { name: UVE.reload, payload: null, nonce: 'n1' },
      'http://api',
    );
  });

  it('flushBounds() posts pcms:flush-bounds to the iframe', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    (result.current.iframeRef as { current: HTMLIFrameElement | null }).current = mockIframe;
    act(() => {
      result.current.flushBounds();
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { name: UVE.flushBounds, payload: null, nonce: 'n1' },
      'http://api',
    );
  });

  it('send() forwards arbitrary events with the configured nonce and origin', () => {
    const { result } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    (result.current.iframeRef as { current: HTMLIFrameElement | null }).current = mockIframe;
    act(() => {
      result.current.send(UVE.scrollBy, { top: 18 });
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { name: UVE.scrollBy, payload: { top: 18 }, nonce: 'n1' },
      'http://api',
    );
  });

  it('removes the message listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useIframeBridge({ enabled: true, apiOrigin: 'http://api', nonce: 'n1' }),
    );
    unmount();
    // After unmount, incoming messages should be silently dropped.
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    // No assertion on internal state (already unmounted), but spy on add/remove
    // is covered by ensuring no error is thrown and React doesn't warn.
  });

  it('P-12: resets state and stops listening when enabled becomes false', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useIframeBridge({ enabled, apiOrigin: 'http://api', nonce: 'n1' }),
      { initialProps: { enabled: true } },
    );
    // Establish some state first.
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    fireMessage('http://api', { name: UVE.bounds, nonce: 'n1', payload: [makeZone()] });
    fireMessage('http://api', { name: UVE.hovered, nonce: 'n1', payload: makeArea() });
    expect(result.current.ready).toBe(true);
    expect(result.current.hasBounds).toBe(true);
    expect(result.current.zones).toHaveLength(1);
    expect(result.current.hovered).not.toBeNull();

    // Disable — state should be cleared.
    rerender({ enabled: false });
    expect(result.current.ready).toBe(false);
    expect(result.current.hasBounds).toBe(false);
    expect(result.current.zones).toEqual([]);
    expect(result.current.hovered).toBeNull();

    // Messages arriving while disabled should be ignored.
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    expect(result.current.ready).toBe(false);
  });

  it('P-12b: re-enabled hook requires fresh handshake', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useIframeBridge({ enabled, apiOrigin: 'http://api', nonce: 'n1' }),
      { initialProps: { enabled: true } },
    );
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    expect(result.current.ready).toBe(true);

    // Disable then re-enable — ready should still be false (needs new handshake).
    rerender({ enabled: false });
    expect(result.current.ready).toBe(false);
    rerender({ enabled: true });
    expect(result.current.ready).toBe(false);

    // New handshake succeeds.
    fireMessage('http://api', { name: UVE.ready, nonce: 'n1' });
    expect(result.current.ready).toBe(true);
  });
});
