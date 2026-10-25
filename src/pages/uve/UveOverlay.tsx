import type { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Button, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CodeOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import type { UveComponentArea, UveZoneArea } from './protocol';
import { t } from '../../i18n/locale';

/** 拖拽命中提示：目标投放区、插入位置与指示线几何信息（画布坐标系）。 */
export interface UveDropHint {
  zoneKey: string;
  index: number;
  top: number;
  left: number;
  width: number;
}

function box(area: { x: number; y: number; width: number; height: number }): CSSProperties {
  return { left: area.x, top: area.y, width: area.width, height: area.height };
}

function DragHandle({ id, data }: { id: string; data: Record<string, unknown> }) {
  const drag = useDraggable({ id, data });
  return (
    <Tooltip title={t('拖拽移动')}>
      <span
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        style={{ display: 'inline-flex', cursor: 'grab', touchAction: 'none' }}
      >
        <Button size="small" icon={<HolderOutlined />} />
      </span>
    </Tooltip>
  );
}

export interface UveOverlayProps {
  zones: UveZoneArea[];
  hovered: UveComponentArea | null;
  /** 画布缩放时由 UveCanvas 注入，与 iframe 保持同一坐标系。 */
  rootStyle?: CSSProperties;
  selectedId?: string;
  selectedZoneKey?: string | null;
  inlineEditingId?: string | null;
  titleOf: (area: UveComponentArea) => string;
  dragActive: boolean;
  allowedZoneKeys: Set<string>;
  dropHint: UveDropHint | null;
  dragHandle?: { id: string; data: Record<string, unknown> };
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
  onEditJson: () => void;
  onDelete: () => void;
  zoneDragHandle?: { id: string; data: Record<string, unknown> };
  zoneCanMoveUp?: boolean;
  zoneCanMoveDown?: boolean;
  onZoneMove?: (delta: number) => void;
  onZoneEdit?: () => void;
  onZoneDelete?: () => void;
}

export function UveOverlay(props: UveOverlayProps) {
  const { zones, hovered, rootStyle, selectedId, selectedZoneKey, inlineEditingId, titleOf, dragActive, allowedZoneKeys, dropHint, dragHandle, canMoveUp, canMoveDown, onMove, onEditJson, onDelete, zoneDragHandle, zoneCanMoveUp, zoneCanMoveDown, onZoneMove, onZoneEdit, onZoneDelete } = props;
  let selectedArea: UveComponentArea | undefined;
  if (selectedId) {
    for (const zone of zones) {
      const hit = zone.components.find((c) => c.componentId === selectedId);
      if (hit) { selectedArea = hit; break; }
    }
  }
  const hoverArea = !dragActive && hovered && hovered.componentId !== selectedId ? hovered : null;
  return (
    <div className={`uve-overlay${dragActive ? ' is-dragging' : ''}`} style={rootStyle}>
      {selectedZoneKey && !selectedArea && !dragActive && (() => {
        const zone = zones.find((item) => item.zoneKey === selectedZoneKey);
        return zone ? <div className="uve-ov-selected uve-ov-selected-zone" style={box(zone)}>
          <span className="uve-ov-badge is-selected">Container · {zone.zoneKey}</span>
          <span className="uve-ov-tools">
            {zoneDragHandle && <DragHandle id={zoneDragHandle.id} data={zoneDragHandle.data} />}
            <Tooltip title={t('上移区块')}><Button size="small" icon={<ArrowUpOutlined />} disabled={!zoneCanMoveUp} onClick={() => onZoneMove?.(-1)} /></Tooltip>
            <Tooltip title={t('下移区块')}><Button size="small" icon={<ArrowDownOutlined />} disabled={!zoneCanMoveDown} onClick={() => onZoneMove?.(1)} /></Tooltip>
            <Tooltip title={t('编辑 Container')}><Button size="small" icon={<CodeOutlined />} onClick={onZoneEdit} /></Tooltip>
            <Tooltip title={t('从模板隐藏区块')}><Button size="small" danger type="primary" icon={<DeleteOutlined />} onClick={onZoneDelete} /></Tooltip>
          </span>
        </div> : null;
      })()}
      {hoverArea && (
        <div className="uve-ov-hover" style={box(hoverArea)}>
          <span className="uve-ov-badge">{titleOf(hoverArea)}</span>
        </div>
      )}
      {selectedArea && !dragActive && selectedArea.componentId !== inlineEditingId && (
        <div className="uve-ov-selected" style={box(selectedArea)}>
          <span className="uve-ov-badge is-selected">{titleOf(selectedArea)}</span>
          <span className="uve-ov-tools">
            {dragHandle && <DragHandle id={dragHandle.id} data={dragHandle.data} />}
            <Tooltip title={t('上移')}><Button size="small" icon={<ArrowUpOutlined />} disabled={!canMoveUp} onClick={() => onMove(-1)} /></Tooltip>
            <Tooltip title={t('下移')}><Button size="small" icon={<ArrowDownOutlined />} disabled={!canMoveDown} onClick={() => onMove(1)} /></Tooltip>
            <Tooltip title={t('高级 JSON')}><Button size="small" icon={<CodeOutlined />} onClick={onEditJson} /></Tooltip>
            <Tooltip title={t('删除组件')}><Button size="small" danger type="primary" icon={<DeleteOutlined />} onClick={onDelete} /></Tooltip>
          </span>
        </div>
      )}
      {dragActive && zones.map((zone) => {
        const isAllowed = allowedZoneKeys.has(zone.zoneKey);
        const isOver = dropHint?.zoneKey === zone.zoneKey;
        return (
          <div key={zone.zoneKey} className={`uve-ov-zone${isAllowed ? ' is-allowed' : ' is-blocked'}${isOver ? ' is-over' : ''}`} style={box(zone)}>
            <span className="uve-ov-zone-label">{zone.zoneKey}</span>
          </div>
        );
      })}
      {dragActive && dropHint && (
        <div className="uve-ov-insert-line" style={{ left: dropHint.left, top: dropHint.top - 2, width: dropHint.width }} />
      )}
    </div>
  );
}
