import type { CSSProperties } from 'react';
import { Spin } from 'antd';
import type { UveBridge } from './useIframeBridge';
import { UveOverlay, type UveOverlayProps } from './UveOverlay';
import { t } from '../../i18n/locale';

interface UveCanvasProps {
  url?: string;
  width: number;
  zoom: number;
  bridge: UveBridge;
  overlay: Omit<UveOverlayProps, 'zones' | 'hovered'>;
}

/**
 * 缩放实现：视觉盒子（设备宽度）不变，iframe 与覆盖层按 1/zoom 放大尺寸后
 * 再 scale(zoom)，坐标系保持一致，缩小时可看到更多页面内容。
 */
function zoomStyle(zoom: number): CSSProperties | undefined {
  if (zoom === 1) return undefined;
  const size = `${100 / zoom}%`;
  return { position: 'absolute', top: 0, left: 0, width: size, height: size, transform: `scale(${zoom})`, transformOrigin: '0 0' };
}

/** 可视化画布：真实页面 iframe + 覆盖层（选中/悬浮/拖拽落点）。 */
export function UveCanvas({ url, width, zoom, bridge, overlay }: UveCanvasProps) {
  const style = zoomStyle(zoom);
  return (
    <div className="uve-device-frame uve-visual-frame" style={{ width }}>
      {url && (
        <iframe
          ref={bridge.iframeRef}
          title="uve-canvas"
          className="uve-visual-iframe"
          src={url}
          style={style}
          onLoad={bridge.onIframeLoad}
        />
      )}
      {url && <UveOverlay zones={bridge.zones} hovered={bridge.hovered} rootStyle={style} {...overlay} />}
      {(!url || !bridge.ready) && (
        <div className="uve-visual-loading"><Spin tip={t('正在加载可视化画布')} /></div>
      )}
    </div>
  );
}
