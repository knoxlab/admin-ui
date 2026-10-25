import { describe, expect, it } from 'vitest';
import { UVE } from '../protocol';

/**
 * U4 — 协议常量完整性：验证前端 protocol.ts 定义的13个事件名
 * 与 bridge.js 中使用的事件名完全一致，防止前后端协议漂移。
 *
 * bridge.js 中出现的事件名（逐行扫描）：
 *   上行(8): pcms:ready, pcms:bounds, pcms:component-clicked,
 *            pcms:component-hovered, pcms:zone-clicked,
 *            pcms:inline-edit-started, pcms:inline-edit-save, pcms:inline-edit-ended
 *   下行(5): pcms:init, pcms:flush-bounds, pcms:reload,
 *            pcms:replace-component, pcms:scroll-by
 */
describe('UVE protocol constants', () => {
  const expectedUpstream = [
    'pcms:ready',
    'pcms:bounds',
    'pcms:component-clicked',
    'pcms:component-hovered',
    'pcms:zone-clicked',
    'pcms:inline-edit-started',
    'pcms:inline-edit-save',
    'pcms:inline-edit-ended',
  ] as const;

  const expectedDownstream = [
    'pcms:init',
    'pcms:flush-bounds',
    'pcms:reload',
    'pcms:replace-component',
    'pcms:scroll-by',
  ] as const;

  const allEvents = [...expectedUpstream, ...expectedDownstream];

  it('defines exactly 13 events', () => {
    const values = Object.values(UVE);
    expect(values).toHaveLength(13);
  });

  it.each(allEvents)('exports event "%s"', (eventName) => {
    const values = Object.values(UVE);
    expect(values).toContain(eventName);
  });

  it('all event names start with pcms:', () => {
    for (const value of Object.values(UVE)) {
      expect(value).toMatch(/^pcms:/);
    }
  });

  it('all event names are unique', () => {
    const values = Object.values(UVE);
    expect(new Set(values).size).toBe(values.length);
  });

  describe('upstream events (iframe → editor)', () => {
    it('UVE.ready = pcms:ready', () => { expect(UVE.ready).toBe('pcms:ready'); });
    it('UVE.bounds = pcms:bounds', () => { expect(UVE.bounds).toBe('pcms:bounds'); });
    it('UVE.clicked = pcms:component-clicked', () => { expect(UVE.clicked).toBe('pcms:component-clicked'); });
    it('UVE.hovered = pcms:component-hovered', () => { expect(UVE.hovered).toBe('pcms:component-hovered'); });
    it('UVE.zoneClicked = pcms:zone-clicked', () => { expect(UVE.zoneClicked).toBe('pcms:zone-clicked'); });
    it('UVE.inlineEditStarted = pcms:inline-edit-started', () => { expect(UVE.inlineEditStarted).toBe('pcms:inline-edit-started'); });
    it('UVE.inlineEditSave = pcms:inline-edit-save', () => { expect(UVE.inlineEditSave).toBe('pcms:inline-edit-save'); });
    it('UVE.inlineEditEnded = pcms:inline-edit-ended', () => { expect(UVE.inlineEditEnded).toBe('pcms:inline-edit-ended'); });
  });

  describe('downstream events (editor → iframe)', () => {
    it('UVE.init = pcms:init', () => { expect(UVE.init).toBe('pcms:init'); });
    it('UVE.flushBounds = pcms:flush-bounds', () => { expect(UVE.flushBounds).toBe('pcms:flush-bounds'); });
    it('UVE.reload = pcms:reload', () => { expect(UVE.reload).toBe('pcms:reload'); });
    it('UVE.replaceComponent = pcms:replace-component', () => { expect(UVE.replaceComponent).toBe('pcms:replace-component'); });
    it('UVE.scrollBy = pcms:scroll-by', () => { expect(UVE.scrollBy).toBe('pcms:scroll-by'); });
  });
});
