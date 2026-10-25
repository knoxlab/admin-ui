import type { UveZoneArea } from './protocol';
import type { UveDropHint } from './UveOverlay';

/**
 * 纯函数：根据指针坐标计算拖拽落点提示（投放区、插入索引、指示线几何）。
 * 从 PageDesigner.tsx pointermove 处理器抽取，便于单元测试。
 *
 * @param zones   当前画布所有 zone 坐标
 * @param point   指针在 iframe 内容坐标系中的位置（已除以 zoom）
 * @param allowed 当前拖拽允许投放的 zone key 集合
 * @returns 命中时返回 UveDropHint，否则 null
 */
export function computeDropHint(
  zones: UveZoneArea[],
  point: { x: number; y: number },
  allowed: Set<string>,
): UveDropHint | null {
  const { x: px, y: py } = point;
  if (px < 0 || py < 0) return null;

  for (const zone of zones) {
    if (!allowed.has(zone.zoneKey)) continue;
    if (px < zone.x || px > zone.x + zone.width || py < zone.y || py > zone.y + zone.height) continue;

    let index = zone.components.length;
    const last = zone.components[zone.components.length - 1];
    let top = last ? last.y + last.height : zone.y + 6;

    for (let i = 0; i < zone.components.length; i++) {
      const c = zone.components[i];
      if (py < c.y + c.height / 2) {
        index = i;
        top = c.y;
        break;
      }
    }

    return {
      zoneKey: zone.zoneKey,
      index,
      top,
      left: zone.x + 4,
      width: Math.max(zone.width - 8, 0),
    };
  }

  return null;
}
