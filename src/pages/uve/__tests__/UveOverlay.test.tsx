import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UveOverlay } from '../UveOverlay';
import type { UveComponentArea, UveZoneArea } from '../protocol';

function zone(overrides: Partial<UveZoneArea> = {}): UveZoneArea {
  return {
    zoneKey: 'header',
    x: 0, y: 0, width: 800, height: 400,
    components: [],
    ...overrides,
  };
}

function area(overrides: Partial<UveComponentArea> = {}): UveComponentArea {
  return {
    componentId: 'c1',
    zoneKey: 'header',
    index: 0,
    kind: 'EMBEDDED',
    x: 10, y: 10, width: 200, height: 80,
    ...overrides,
  };
}

const baseProps = {
  zones: [] as UveZoneArea[],
  hovered: null as UveComponentArea | null,
  selectedId: undefined as string | undefined,
  selectedZoneKey: null as string | null,
  inlineEditingId: null as string | null,
  titleOf: (a: UveComponentArea) => `Title-${a.componentId}`,
  dragActive: false,
  allowedZoneKeys: new Set<string>(),
  dropHint: null,
  canMoveUp: true,
  canMoveDown: true,
  onMove: vi.fn(),
  onEditJson: vi.fn(),
  onDelete: vi.fn(),
  onZoneMove: vi.fn(),
  onZoneEdit: vi.fn(),
  onZoneDelete: vi.fn(),
  zoneCanMoveUp: true,
  zoneCanMoveDown: true,
};

describe('UveOverlay', () => {
  it('renders nothing actionable when no zones and no selection', () => {
    const { container } = render(<UveOverlay {...baseProps} />);
    expect(container.querySelector('.uve-ov-selected')).toBeNull();
    expect(container.querySelector('.uve-ov-hover')).toBeNull();
  });

  it('shows selected overlay with badge and tools for the selected component', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" />,
    );
    expect(container.querySelector('.uve-ov-selected')).not.toBeNull();
    expect(container.querySelector('.uve-ov-badge.is-selected')?.textContent).toContain(
      'Title-c1',
    );
    // Without dragHandle, toolbar renders 4 buttons: up / down / edit-json / delete.
    expect(container.querySelectorAll('.uve-ov-tools button')).toHaveLength(4);
  });

  it('hides selected overlay while inline-editing the same component', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" inlineEditingId="c1" />,
    );
    expect(container.querySelector('.uve-ov-selected')).toBeNull();
  });

  it('shows hover overlay for a different component from the selected one', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' }), area({ componentId: 'c2', y: 100 })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" hovered={area({ componentId: 'c2' })} />,
    );
    const hover = container.querySelector('.uve-ov-hover');
    expect(hover).not.toBeNull();
    expect(hover?.textContent).toContain('Title-c2');
  });

  it('suppresses hover overlay during drag', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} hovered={area({ componentId: 'c1' })} dragActive />,
    );
    expect(container.querySelector('.uve-ov-hover')).toBeNull();
  });

  it('shows zone selection overlay with zone toolbar when no component is selected', () => {
    const zones = [zone({ zoneKey: 'main', components: [area({ componentId: 'a' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedZoneKey="main" />,
    );
    expect(container.querySelector('.uve-ov-selected-zone')).not.toBeNull();
    expect(container.querySelector('.uve-ov-badge.is-selected')?.textContent).toContain(
      'Container · main',
    );
    // Without zoneDragHandle, zone toolbar: up / down / edit-json / delete
    expect(container.querySelectorAll('.uve-ov-tools button')).toHaveLength(4);
  });

  it('renders all zones with allowed/blocked highlighting during drag', () => {
    const zones = [
      zone({ zoneKey: 'header', x: 0, y: 0, width: 800, height: 100 }),
      zone({ zoneKey: 'footer', x: 0, y: 500, width: 800, height: 100 }),
    ];
    const { container } = render(
      <UveOverlay
        {...baseProps}
        zones={zones}
        dragActive
        allowedZoneKeys={new Set(['header'])}
      />,
    );
    const zoneOverlays = container.querySelectorAll('.uve-ov-zone');
    expect(zoneOverlays).toHaveLength(2);
    expect(zoneOverlays[0].className).toContain('is-allowed');
    expect(zoneOverlays[1].className).toContain('is-blocked');
  });

  it('marks the active drop zone with is-over and renders the insert line', () => {
    const zones = [zone({ zoneKey: 'header', x: 0, y: 0, width: 800, height: 100 })];
    const dropHint = { zoneKey: 'header', index: 0, top: 12, left: 4, width: 792 };
    const { container } = render(
      <UveOverlay
        {...baseProps}
        zones={zones}
        dragActive
        allowedZoneKeys={new Set(['header'])}
        dropHint={dropHint}
      />,
    );
    expect(container.querySelector('.uve-ov-zone.is-over')).not.toBeNull();
    const line = container.querySelector('.uve-ov-insert-line') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.style.top).toBe('10px'); // top - 2
    expect(line.style.left).toBe('4px');
    expect(line.style.width).toBe('792px');
  });

  it('triggers onMove(-1)/onMove(1) when up/down buttons are clicked', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" />,
    );
    const toolsButtons = container.querySelectorAll('.uve-ov-selected .uve-ov-tools button');
    fireEvent.click(toolsButtons[0]); // up → onMove(-1)
    fireEvent.click(toolsButtons[1]); // down → onMove(1)
    expect(baseProps.onMove).toHaveBeenNthCalledWith(1, -1);
    expect(baseProps.onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it('triggers onEditJson and onDelete from the toolbar', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" />,
    );
    const toolsButtons = container.querySelectorAll('.uve-ov-selected .uve-ov-tools button');
    fireEvent.click(toolsButtons[2]); // edit-json
    fireEvent.click(toolsButtons[3]); // delete
    expect(baseProps.onEditJson).toHaveBeenCalled();
    expect(baseProps.onDelete).toHaveBeenCalled();
  });

  it('disables up/down buttons when cannot move', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay
        {...baseProps}
        zones={zones}
        selectedId="c1"
        canMoveUp={false}
        canMoveDown={false}
      />,
    );
    // Scope to the selected overlay's tools to avoid hover overlays or zone overlays.
    const toolsButtons = container.querySelectorAll('.uve-ov-selected .uve-ov-tools button');
    expect(toolsButtons.length).toBe(4);
    expect((toolsButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((toolsButtons[1] as HTMLButtonElement).disabled).toBe(true);
    expect((toolsButtons[2] as HTMLButtonElement).disabled).toBe(false);
    expect((toolsButtons[3] as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not show hover overlay when hovered component is the selected one', () => {
    const zones = [zone({ components: [area({ componentId: 'c1' })] })];
    const { container } = render(
      <UveOverlay {...baseProps} zones={zones} selectedId="c1" hovered={area({ componentId: 'c1' })} />,
    );
    expect(container.querySelector('.uve-ov-hover')).toBeNull();
  });

  it('triggers zone-level callbacks from the zone toolbar', () => {
    const zones = [zone({ zoneKey: 'main' })];
    const { container } = render(
      <UveOverlay
        {...baseProps}
        zones={zones}
        selectedZoneKey="main"
        zoneCanMoveUp
        zoneCanMoveDown
      />,
    );
    const toolsButtons = container.querySelectorAll('.uve-ov-selected-zone .uve-ov-tools button');
    expect(toolsButtons.length).toBe(4);
    fireEvent.click(toolsButtons[0]);
    fireEvent.click(toolsButtons[1]);
    fireEvent.click(toolsButtons[2]);
    fireEvent.click(toolsButtons[3]);
    expect(baseProps.onZoneMove).toHaveBeenNthCalledWith(1, -1);
    expect(baseProps.onZoneMove).toHaveBeenNthCalledWith(2, 1);
    expect(baseProps.onZoneEdit).toHaveBeenCalled();
    expect(baseProps.onZoneDelete).toHaveBeenCalled();
  });
});
