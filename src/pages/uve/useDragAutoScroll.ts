import { useEffect } from 'react';
import { UVE } from './protocol';

const EDGE_PX = 56;
const STEP_PX = 18;
const TICK_MS = 50;

/** 拖拽期间指针靠近画布上下边缘时，命令 iframe 内页面自动滚动。 */
export function useDragAutoScroll(options: {
  active: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  send: (name: string, payload?: unknown) => void;
}) {
  const { active, iframeRef, send } = options;
  useEffect(() => {
    if (!active) return;
    let direction = 0;
    const onMove = (event: PointerEvent) => {
      const frame = iframeRef.current;
      if (!frame) { direction = 0; return; }
      const rect = frame.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) { direction = 0; return; }
      if (event.clientY < rect.top + EDGE_PX) direction = -1;
      else if (event.clientY > rect.bottom - EDGE_PX) direction = 1;
      else direction = 0;
    };
    const timer = window.setInterval(() => {
      if (direction !== 0) send(UVE.scrollBy, { top: direction * STEP_PX });
    }, TICK_MS);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearInterval(timer);
    };
  }, [active, iframeRef, send]);
}
