import { describe, expect, it } from 'vitest';
import {
  composeAuto,
  composeFromConfig,
  defaultGyz199ComposeConfig,
  findComposeConfig,
  rolesFromRow,
  runComposeScript,
  type ComposeConfig,
  type ComposeInput,
  type RoleValue,
} from '../classCompose';

const cfg = defaultGyz199ComposeConfig();

function makeInput(roles: Record<string, RoleValue | undefined>, config: ComposeConfig = cfg): ComposeInput {
  return { config, roles };
}

describe('composeFromConfig', () => {
  it('builds class number from default order', () => {
    const out = composeFromConfig(
      makeInput({
        base: { code: 'J1689' },
        imitation: { code: 'J1625' },
        general: { code: '09' },
      }),
    );
    expect(out.classNumber).toContain('J1689');
    // J1689 preset strips 'J16' from the imitation code, so J1625 becomes 25.
    expect(out.classNumber).toContain('25');
    expect(out.classNumber.endsWith('-09')).toBe(true);
    expect(out.orderUsed).toContain('base');
  });

  it('applies preset stripPrefix for J1689 imitation', () => {
    const out = composeFromConfig(
      makeInput({
        base: { code: 'J1689' },
        imitation: { code: 'J1625' },
        general: { code: '01' },
      }),
    );
    // J1689 preset has stripPrefix 'J16' on imitation; the resulting
    // segment should be '25' (not 'J1625').
    expect(out.classNumber).toContain(' 25');
    expect(out.classNumber).not.toContain('J1625');
  });

  it('respects preset order for F89 (world before imitation)', () => {
    const out = composeFromConfig(
      makeInput({
        base: { code: 'F89' },
        world: { code: 'US' },
        imitation: { code: 'F12' },
        general: { code: '01' },
      }),
    );
    expect(out.orderUsed).toEqual(['base', 'world', 'imitation', 'general']);
    // world segment uses <...>, general uses -, so we expect <US> and -01.
    expect(out.classNumber).toContain('<US>');
    expect(out.classNumber).toContain('-01');
  });

  it('omits role segments whose value is undefined', () => {
    const out = composeFromConfig(makeInput({ base: { code: 'X' } }));
    expect(out.classNumber).toBe('X');
    expect(out.classCaption).toBe('');
  });

  it('joins labels with spaces', () => {
    const out = composeFromConfig(
      makeInput({
        base: { code: 'J1689', name: '中国音乐' },
        imitation: { code: 'J1625', name: '民歌' },
      }),
    );
    expect(out.classCaption).toContain('中国音乐');
    expect(out.classCaption).toContain('民歌');
  });
});

describe('rolesFromRow', () => {
  it('maps row keys via compose.roles.*.field', () => {
    const row = {
      program_class: 'J1689',
      class_imitation: 'J1625',
      class_special: '',
    };
    const out = rolesFromRow(cfg, row);
    expect(out.base?.code).toBe('J1689');
    expect(out.imitation?.code).toBe('J1625');
    // class_special 空字符串 → undefined
    expect(out.special).toBeUndefined();
  });

  it('uses resolveCategory for string raw values when provided', () => {
    const row = { program_class: 'X' };
    const resolveCategory = (id: string): RoleValue | undefined =>
      id === 'X' ? { id: 'X', code: 'X', name: '主类' } : undefined;
    const out = rolesFromRow(cfg, row, resolveCategory);
    expect(out.base?.name).toBe('主类');
  });

  it('keeps object raw values as-is', () => {
    const row = { program_class: { id: 'X', code: 'X', name: '主类' } };
    const out = rolesFromRow(cfg, row);
    expect(out.base?.name).toBe('主类');
  });

  it('wraps non-string non-object values with code-only', () => {
    const row = { program_class: 42 };
    const out = rolesFromRow(cfg, row);
    expect(out.base?.code).toBe('42');
  });
});

describe('findComposeConfig', () => {
  it('returns fallback when fieldConfig is null', () => {
    expect(findComposeConfig(null, cfg)).toBe(cfg);
  });

  it('uses nested fieldConfig.compose when present', () => {
    const nested: ComposeConfig = {
      mode: 'script',
      composeScript: 'return composeDeclarative();',
    };
    expect(findComposeConfig({ compose: nested })).toBe(nested);
  });

  it('uses fieldConfig directly when keys exist at top level', () => {
    const direct = { order: ['base', 'general'], roles: {} };
    expect(findComposeConfig(direct as unknown as Record<string, unknown>)).toBe(direct);
  });

  it('falls back when fieldConfig has no compose keys', () => {
    const other = { unrelated: true };
    expect(findComposeConfig(other, cfg)).toBe(cfg);
  });
});

describe('runComposeScript', () => {
  it('returns declarative result when script is empty', () => {
    const declarative = { classNumber: 'X', classCaption: 'main', orderUsed: ['base'] };
    const out = runComposeScript('', {}, declarative);
    expect(out).toBe(declarative);
  });

  it('runs an override script', () => {
    const declarative = { classNumber: 'X', classCaption: 'main', orderUsed: ['base'] };
    const out = runComposeScript(
      'return { classNumber: "Y", classCaption: "override" };',
      {},
      declarative,
    );
    expect(out.classNumber).toBe('Y');
    expect(out.classCaption).toBe('override');
    expect(out.orderUsed).toEqual(declarative.orderUsed);
  });

  it('rejects scripts containing import/require/eval/Function', () => {
    const declarative = { classNumber: 'X', classCaption: 'main', orderUsed: ['base'] };
    for (const bad of [
      'import("fs")',
      'require("fs")',
      'eval("1")',
      'Function("return 1")()',
      'fetch("/x")',
      'new XMLHttpRequest()',
      'window.location = "/"',
      'document.body',
      'globalThis.x',
      'process.env',
    ]) {
      expect(() => runComposeScript(bad, {}, declarative)).toThrow(/禁止模式/);
    }
  });

  it('rejects scripts longer than 16384 chars', () => {
    const declarative = { classNumber: 'X', classCaption: 'main', orderUsed: ['base'] };
    const long = 'a'.repeat(16385);
    expect(() => runComposeScript(long, {}, declarative)).toThrow(/过长/);
  });

  it('exposes composeDeclarative to the script', () => {
    const declarative = { classNumber: 'X', classCaption: 'main', orderUsed: ['base'] };
    const out = runComposeScript(
      'const d = composeDeclarative(); return { classNumber: d.classNumber + "!" };',
      {},
      declarative,
    );
    expect(out.classNumber).toBe('X!');
  });
});

describe('composeAuto', () => {
  it('returns declarative result when mode is declarative (default)', () => {
    const out = composeAuto(makeInput({ base: { code: 'J1689' } }));
    expect(out.classNumber).toContain('J1689');
  });

  it('applies override when mode is script', () => {
    const cfg: ComposeConfig = {
      mode: 'script',
      composeScript: 'return { classNumber: "SCRIPT", classCaption: "x" };',
      roles: { base: { field: 'program_class' } },
    };
    const out = composeAuto(makeInput({ base: { code: 'J1689' } }, cfg));
    expect(out.classNumber).toBe('SCRIPT');
  });

  it('returns empty result when script mode fails', () => {
    const cfg: ComposeConfig = {
      mode: 'script',
      composeScript: 'throw new Error("boom");',
      roles: { base: { field: 'program_class' } },
    };
    const out = composeAuto(makeInput({ base: { code: 'J1689' } }, cfg));
    expect(out.classNumber).toBe('');
    expect(out.orderUsed).toEqual([]);
  });

  it('falls back to declarative when declarative+script script fails', () => {
    const cfg: ComposeConfig = {
      mode: 'declarative+script',
      composeScript: 'throw new Error("boom");',
      roles: { base: { field: 'program_class' } },
    };
    const out = composeAuto(makeInput({ base: { code: 'J1689' } }, cfg));
    expect(out.classNumber).toContain('J1689');
  });
});
