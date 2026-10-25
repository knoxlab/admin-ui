import { describe, expect, it } from 'vitest';
import { computeDropHint } from '../dropHint';
import type { UveZoneArea } from '../protocol';

/**
 * U5 — dropHint 几何计算单元测试（D-01 ~ D-07）
 */

function makeZone(overrides: Partial<UveZoneArea> = {}): UveZoneArea {
  return {
    zoneKey: 'main',
    x: 0, y: 0, width: 800, height: 400,
    components: [],
    ...overrides,
  };
}

function makeComponent(overrides: { componentId?: string; zoneKey?: string; index?: number; x?: number; y?: number; width?: number; height?: number } = {}) {
  return {
    componentId: 'c1',
    zoneKey: 'main',
    index: 0,
    kind: 'EMBEDDED',
    x: 4, y: 10, width: 792, height: 80,
    ...overrides,
  };
}

describe('computeDropHint', () => {
  const allZones = new Set(['main']);

  it('D-01: pointer at top blank area of zone (above first component) → insert index=0, top=component.y', () => {
    const zone = makeZone({ components: [makeComponent({ y: 100, height: 80 })] });
    const hint = computeDropHint([zone], { x: 400, y: 50 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.zoneKey).toBe('main');
    expect(hint!.index).toBe(0);
    expect(hint!.top).toBe(100); // first component y
    expect(hint!.left).toBe(4); // zone.x(0) + 4
    expect(hint!.width).toBe(792); // zone.width(800) - 8
  });

  it('D-02: pointer above component midpoint → index=component index, top=component.y', () => {
    const zone = makeZone({
      components: [
        makeComponent({ componentId: 'a', y: 10, height: 80 }),
        makeComponent({ componentId: 'b', y: 100, height: 80 }),
      ],
    });
    // Component 'b' midpoint = 100 + 40 = 140. Pointer at y=110 < 140 → index=1
    const hint = computeDropHint([zone], { x: 400, y: 110 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.index).toBe(1);
    expect(hint!.top).toBe(100);
  });

  it('D-03: pointer at zone bottom → index=total components, top=last component bottom', () => {
    const zone = makeZone({
      components: [
        makeComponent({ componentId: 'a', y: 10, height: 80 }),
        makeComponent({ componentId: 'b', y: 100, height: 80 }),
      ],
    });
    // Pointer below all components
    const hint = computeDropHint([zone], { x: 400, y: 300 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.index).toBe(2);
    expect(hint!.top).toBe(180); // 100 + 80
  });

  it('D-04: pointer in zone not in allowedZoneKeys → no hit', () => {
    const zone = makeZone({ zoneKey: 'header' });
    const allowed = new Set(['footer']);
    const hint = computeDropHint([zone], { x: 400, y: 200 }, allowed);
    expect(hint).toBeNull();
  });

  it('D-05: pointer outside all zones → no hit', () => {
    const zone = makeZone({ x: 0, y: 0, width: 800, height: 400 });
    const hint = computeDropHint([zone], { x: 900, y: 500 }, allZones);
    expect(hint).toBeNull();
  });

  it('D-05b: pointer with negative coordinates → no hit', () => {
    const zone = makeZone();
    const hint = computeDropHint([zone], { x: -10, y: -10 }, allZones);
    expect(hint).toBeNull();
  });

  it('D-06: zoom=0.75 case — caller divides by zoom before calling, so coordinates are content-space', () => {
    // Simulates: screen pointer at (330, 180) with zoom=0.75 → content coords (440, 240)
    const zone = makeZone({ x: 0, y: 0, width: 800, height: 400 });
    const hint = computeDropHint([zone], { x: 440, y: 240 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.zoneKey).toBe('main');
    expect(hint!.index).toBe(0); // empty zone
  });

  it('D-07: empty zones array → no hit', () => {
    const hint = computeDropHint([], { x: 400, y: 200 }, allZones);
    expect(hint).toBeNull();
  });

  it('empty zone with no components → index=0, top=zone.y+6', () => {
    const zone = makeZone({ y: 50, height: 200 });
    const hint = computeDropHint([zone], { x: 400, y: 100 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.index).toBe(0);
    expect(hint!.top).toBe(56); // 50 + 6
  });

  it('pointer exactly on component midpoint → inserts above (index=component index)', () => {
    const zone = makeZone({
      components: [makeComponent({ y: 100, height: 80 })],
    });
    // midpoint = 100 + 40 = 140. py=140 is NOT < 140, so falls to bottom case.
    const hint = computeDropHint([zone], { x: 400, y: 140 }, allZones);
    expect(hint).not.toBeNull();
    // py=140 is not < midpoint (140), so index stays at components.length
    expect(hint!.index).toBe(1);
    expect(hint!.top).toBe(180);
  });

  it('pointer just above component midpoint → inserts at that index', () => {
    const zone = makeZone({
      components: [makeComponent({ y: 100, height: 80 })],
    });
    // midpoint = 140. py=139 < 140 → index=0, top=100
    const hint = computeDropHint([zone], { x: 400, y: 139 }, allZones);
    expect(hint).not.toBeNull();
    expect(hint!.index).toBe(0);
    expect(hint!.top).toBe(100);
  });

  it('multiple zones — returns the first matching allowed zone', () => {
    const zones = [
      makeZone({ zoneKey: 'header', x: 0, y: 0, width: 800, height: 100 }),
      makeZone({ zoneKey: 'main', x: 0, y: 120, width: 800, height: 400 }),
    ];
    const allowed = new Set(['header', 'main']);
    const hint = computeDropHint(zones, { x: 400, y: 50 }, allowed);
    expect(hint).not.toBeNull();
    expect(hint!.zoneKey).toBe('header');
  });
});
