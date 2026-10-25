import { describe, expect, it } from 'vitest';
import {
  GATED_ROLE_FIELD,
  SPECIAL_TABLE_ROOT_ALIAS,
  gatedFieldCodes,
  isClassificationChildVisible,
  resolveRoleVisibility,
  roleLabel,
} from '../gyz199Visibility';

describe('resolveRoleVisibility', () => {
  it('returns not-ready state when baseCode is empty', () => {
    const v = resolveRoleVisibility('');
    expect(v.ready).toBe(false);
    expect(v.allowedRoles).toEqual([]);
    expect(v.hint).toBeTruthy();
  });

  it('returns not-ready state for null/undefined baseCode', () => {
    expect(resolveRoleVisibility(null).ready).toBe(false);
    expect(resolveRoleVisibility(undefined).ready).toBe(false);
  });

  it('applies imitation rule order when a rule exists (J1689)', () => {
    const v = resolveRoleVisibility('J1689');
    expect(v.ready).toBe(true);
    expect(v.allowedRoles).toContain('imitation');
    expect(v.allowedRoles).toContain('world');
    expect(v.allowedRoles).toContain('general');
    expect(v.rule?.label).toContain('仿中国音乐');
  });

  it('uses world/china/nation/general as default for codes without rule', () => {
    const v = resolveRoleVisibility('B12');
    expect(v.ready).toBe(true);
    expect(v.allowedRoles).toEqual(['world', 'china', 'nation', 'general']);
  });

  it('adds special role when special tables match (A39)', () => {
    const v = resolveRoleVisibility('A39');
    expect(v.allowedRoles).toContain('special');
    expect(v.specialTables.length).toBeGreaterThan(0);
  });

  it('derives special root alias for song-based codes', () => {
    const v = resolveRoleVisibility('J1619');
    expect(v.specialRootAlias).toBe(SPECIAL_TABLE_ROOT_ALIAS.song);
  });

  it('derives special root alias for A39 politics', () => {
    const v = resolveRoleVisibility('A39');
    expect(v.specialRootAlias).toBe(SPECIAL_TABLE_ROOT_ALIAS.politics_country);
  });

  it('produces a hint mentioning the rule label when a rule is matched', () => {
    const v = resolveRoleVisibility('J1689');
    expect(v.hint).toContain('J1689');
    expect(v.hint).toContain('仿中国音乐');
  });

  it('produces a hint mentioning special tables when they apply', () => {
    const v = resolveRoleVisibility('A39');
    expect(v.hint).toContain('专类复分');
  });

  it('produces a default hint for plain base codes', () => {
    const v = resolveRoleVisibility('B12');
    expect(v.hint).toContain('世界/中国地区');
  });
});

describe('isClassificationChildVisible', () => {
  it('always shows program_class / class_number / class_caption / base compose role', () => {
    const v = resolveRoleVisibility('B12');
    expect(isClassificationChildVisible('program_class', undefined, v)).toBe(true);
    expect(isClassificationChildVisible('class_number', undefined, v)).toBe(true);
    expect(isClassificationChildVisible('class_caption', undefined, v)).toBe(true);
    expect(isClassificationChildVisible('class_imitation', 'base', v)).toBe(true);
  });

  it('hides class_constraint (drives logic only)', () => {
    const v = resolveRoleVisibility('B12');
    expect(isClassificationChildVisible('class_constraint', undefined, v)).toBe(false);
  });

  it('hides all gated fields when not ready', () => {
    const v = resolveRoleVisibility('');
    for (const fieldCode of Object.values(GATED_ROLE_FIELD)) {
      expect(isClassificationChildVisible(fieldCode, undefined, v)).toBe(false);
    }
  });

  it('shows only roles allowed by current visibility', () => {
    const v = resolveRoleVisibility('B12');
    // B12: only world/china/nation/general
    expect(isClassificationChildVisible(GATED_ROLE_FIELD.world, undefined, v)).toBe(true);
    expect(isClassificationChildVisible(GATED_ROLE_FIELD.china, undefined, v)).toBe(true);
    expect(isClassificationChildVisible(GATED_ROLE_FIELD.nation, undefined, v)).toBe(true);
    expect(isClassificationChildVisible(GATED_ROLE_FIELD.general, undefined, v)).toBe(true);
    // imitation is not in the allowed list for B12
    expect(isClassificationChildVisible(GATED_ROLE_FIELD.imitation, undefined, v)).toBe(false);
  });

  it('passes through unrelated field codes when ready', () => {
    const v = resolveRoleVisibility('B12');
    expect(isClassificationChildVisible('some_other_field', undefined, v)).toBe(true);
  });
});

describe('roleLabel', () => {
  it('returns Chinese labels for known roles', () => {
    expect(roleLabel('imitation')).toBeTruthy();
    expect(roleLabel('special')).toBeTruthy();
    expect(roleLabel('world')).toBeTruthy();
    expect(roleLabel('china')).toBeTruthy();
    expect(roleLabel('nation')).toBeTruthy();
    expect(roleLabel('general')).toBeTruthy();
  });

  it('falls back to the role key for unknown roles', () => {
    expect(roleLabel('unknown' as never)).toBe('unknown');
  });
});

describe('gatedFieldCodes', () => {
  it('returns one entry per gated role', () => {
    const codes = gatedFieldCodes();
    expect(codes).toContain('class_imitation');
    expect(codes).toContain('class_special');
    expect(codes).toContain('class_world');
    expect(codes).toContain('class_china');
    expect(codes).toContain('class_nation');
    expect(codes).toContain('class_general');
    expect(codes).toHaveLength(6);
  });
});
