// PowerCMS UVE postMessage 协议，与 server 端 resources/uve/bridge.js 保持一致。

export const UVE = {
  init: 'pcms:init',
  ready: 'pcms:ready',
  bounds: 'pcms:bounds',
  clicked: 'pcms:component-clicked',
  zoneClicked: 'pcms:zone-clicked',
  hovered: 'pcms:component-hovered',
  flushBounds: 'pcms:flush-bounds',
  reload: 'pcms:reload',
  replaceComponent: 'pcms:replace-component',
  scrollBy: 'pcms:scroll-by',
  inlineEditStarted: 'pcms:inline-edit-started',
  inlineEditSave: 'pcms:inline-edit-save',
  inlineEditEnded: 'pcms:inline-edit-ended',
} as const;

export interface UveComponentArea {
  componentId: string;
  zoneKey: string;
  index: number;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UveZoneArea {
  zoneKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  components: UveComponentArea[];
}

export interface UveInlineEdit {
  componentId: string;
  fieldName: string;
  format: 'text' | 'html';
  contentItemId?: string;
  contentVersion?: number;
  value: string;
}
