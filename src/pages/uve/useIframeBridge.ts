import { useCallback, useEffect, useRef, useState } from 'react';
import { UVE, type UveComponentArea, type UveInlineEdit, type UveZoneArea } from './protocol';

interface Options {
  enabled: boolean;
  apiOrigin: string;
  nonce: string;
  onComponentClicked?: (area: UveComponentArea | null) => void;
  onZoneClicked?: (area: UveZoneArea) => void;
  onInlineEditStarted?: (edit: UveInlineEdit) => void;
  onInlineEditSave?: (edit: UveInlineEdit) => void;
  onInlineEditEnded?: (edit: UveInlineEdit) => void;
}

export interface UveBridge {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  ready: boolean;
  hasBounds: boolean;
  zones: UveZoneArea[];
  hovered: UveComponentArea | null;
  onIframeLoad: () => void;
  send: (name: string, payload?: unknown) => void;
  reload: () => void;
  flushBounds: () => void;
}

export function useIframeBridge({ enabled, apiOrigin, nonce, onComponentClicked, onZoneClicked, onInlineEditStarted, onInlineEditSave, onInlineEditEnded }: Options): UveBridge {
  const iframeRef = useRef<HTMLIFrameElement>(null) as React.RefObject<HTMLIFrameElement>;
  const [ready, setReady] = useState(false);
  const [hasBounds, setHasBounds] = useState(false);
  const [zones, setZones] = useState<UveZoneArea[]>([]);
  const [hovered, setHovered] = useState<UveComponentArea | null>(null);
  const clickRef = useRef(onComponentClicked);
  const zoneClickRef = useRef(onZoneClicked);
  const inlineStartedRef = useRef(onInlineEditStarted);
  const inlineSaveRef = useRef(onInlineEditSave);
  const inlineEndedRef = useRef(onInlineEditEnded);
  clickRef.current = onComponentClicked;
  zoneClickRef.current = onZoneClicked;
  inlineStartedRef.current = onInlineEditStarted;
  inlineSaveRef.current = onInlineEditSave;
  inlineEndedRef.current = onInlineEditEnded;

  const send = useCallback((name: string, payload?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage({ name, payload: payload ?? null, nonce }, apiOrigin);
  }, [apiOrigin, nonce]);

  useEffect(() => {
    if (!enabled) {
      setReady(false); setHasBounds(false); setZones([]); setHovered(null);
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin) return;
      const data = event.data as { name?: string; payload?: unknown; nonce?: string } | null;
      if (data?.nonce !== nonce) return;
      const name = data.name;
      if (!name || !name.startsWith('pcms:')) return;
      if (name === UVE.ready) setReady(true);
      else if (name === UVE.bounds) { setZones((data?.payload as UveZoneArea[]) || []); setHasBounds(true); }
      else if (name === UVE.hovered) setHovered((data?.payload as UveComponentArea) || null);
      else if (name === UVE.clicked) clickRef.current?.((data?.payload as UveComponentArea) || null);
      else if (name === UVE.zoneClicked) zoneClickRef.current?.(data?.payload as UveZoneArea);
      else if (name === UVE.inlineEditStarted) inlineStartedRef.current?.(data?.payload as UveInlineEdit);
      else if (name === UVE.inlineEditSave) inlineSaveRef.current?.(data?.payload as UveInlineEdit);
      else if (name === UVE.inlineEditEnded) inlineEndedRef.current?.(data?.payload as UveInlineEdit);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [enabled, apiOrigin, nonce]);

  const onIframeLoad = useCallback(() => {
    setReady(false);
    setHasBounds(false);
    send(UVE.init);
  }, [send]);

  return {
    iframeRef, ready, hasBounds, zones, hovered, onIframeLoad, send,
    reload: useCallback(() => send(UVE.reload), [send]),
    flushBounds: useCallback(() => send(UVE.flushBounds), [send]),
  };
}
