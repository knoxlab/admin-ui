import {
  findImitationRule,
  resolveSpecialTables,
  type ImitationRule,
  type SpecialTable,
} from './gyz199Compose';
import { t } from '../i18n/locale';

/** Compose / form roles that can be gated after 主表分类 is chosen. */
export type GatedRole = 'imitation' | 'special' | 'world' | 'china' | 'nation' | 'general';

export const GATED_ROLE_FIELD: Record<GatedRole, string> = {
  imitation: 'class_imitation',
  special: 'class_special',
  world: 'class_world',
  china: 'class_china',
  nation: 'class_nation',
  general: 'class_general',
};

export const SPECIAL_TABLE_ROOT_ALIAS: Record<string, string> = {
  song: 'gyz199-special-song',
  instrumental: 'gyz199-special-instrumental',
  politics_country: 'gyz199-special-politics',
  hk_mo: 'gyz199-special-hkmo',
  tennis: 'gyz199-special-ball',
};

export type RoleVisibility = {
  ready: boolean;
  baseCode?: string;
  allowedRoles: GatedRole[];
  rule?: ImitationRule;
  specialTables: SpecialTable[];
  specialRootAlias?: string;
  hint: string;
};

const ALL_GATED: GatedRole[] = ['imitation', 'special', 'world', 'china', 'nation', 'general'];

/**
 * GY/Z 199：按主类号决定可出现的仿分 / 专类 / 地区·民族 / 总论复分输入项。
 * 有 imitationRules 时用其 order；否则开放地区·民族·总论，专类按 applies 匹配。
 */
export function resolveRoleVisibility(baseCode: string | undefined | null): RoleVisibility {
  const code = (baseCode || '').trim();
  if (!code) {
    return {
      ready: false,
      allowedRoles: [],
      specialTables: [],
      hint: t('请先选择主表分类，再按该类允许的复分项填写。'),
    };
  }

  const rule = findImitationRule(code);
  const specialTables = resolveSpecialTables(code);
  let allowed: GatedRole[];

  if (rule?.order?.length) {
    allowed = rule.order.filter((r): r is GatedRole => ALL_GATED.includes(r as GatedRole));
  } else {
    allowed = ['world', 'china', 'nation', 'general'];
    if (specialTables.length) allowed = ['special', ...allowed];
  }

  if (specialTables.length && !allowed.includes('special')) {
    allowed = [...allowed, 'special'];
  }

  const specialRootAlias = pickSpecialRootAlias(code, specialTables);

  const hint = rule
    ? `主类 ${code}：${rule.label}。可填：${allowed.map(roleLabel).join('、')}`
    : specialTables.length
      ? `主类 ${code}：可进行专类复分（${specialTables.map((t) => t.title).join('、')}）及地区·民族·总论复分。`
      : `主类 ${code}：可进行世界/中国地区、民族、总论复分（无专用仿分规则）。`;

  return {
    ready: true,
    baseCode: code,
    allowedRoles: allowed,
    rule,
    specialTables,
    specialRootAlias,
    hint,
  };
}

function pickSpecialRootAlias(baseCode: string, tables: SpecialTable[]): string | undefined {
  if (!tables.length) return undefined;
  if (/^J1619/.test(baseCode) || tables.some((t) => t.title.includes('歌曲'))) {
    return SPECIAL_TABLE_ROOT_ALIAS.song;
  }
  if (/^J1621|^J1635/.test(baseCode) || tables.some((t) => t.title.includes('器乐'))) {
    return SPECIAL_TABLE_ROOT_ALIAS.instrumental;
  }
  if (baseCode === 'A39' || tables.some((t) => t.title.includes('政治'))) {
    return SPECIAL_TABLE_ROOT_ALIAS.politics_country;
  }
  if (/^A3613|^A3623/.test(baseCode) || tables.some((t) => t.title.includes('港澳'))) {
    return SPECIAL_TABLE_ROOT_ALIAS.hk_mo;
  }
  if (tables.some((t) => t.title.includes('球'))) return SPECIAL_TABLE_ROOT_ALIAS.tennis;
  return SPECIAL_TABLE_ROOT_ALIAS.song;
}

export function roleLabel(role: GatedRole): string {
  switch (role) {
    case 'imitation':
      return t('仿分');
    case 'special':
      return t('专类复分');
    case 'world':
      return t('世界地区');
    case 'china':
      return t('中国地区');
    case 'nation':
      return t('中国民族');
    case 'general':
      return t('总论复分');
    default:
      return role;
  }
}

/** Whether a repeat-group child field should render for current visibility. */
export function isClassificationChildVisible(
  fieldCode: string,
  composeRole: string | undefined,
  visibility: RoleVisibility,
): boolean {
  if (
    fieldCode === 'program_class' ||
    composeRole === 'base' ||
    fieldCode === 'class_number' ||
    fieldCode === 'class_caption'
  ) {
    return true;
  }
  // Constraint CUSTOM_CODE drives logic but is not shown as an input (hint Alert instead)
  if (fieldCode === 'class_constraint') return false;
  if (!visibility.ready) {
    if (composeRole && ALL_GATED.includes(composeRole as GatedRole)) return false;
    if (Object.values(GATED_ROLE_FIELD).includes(fieldCode)) return false;
    return true;
  }
  const role =
    (composeRole as GatedRole | undefined) ||
    (Object.entries(GATED_ROLE_FIELD).find(([, code]) => code === fieldCode)?.[0] as
      | GatedRole
      | undefined);
  if (!role || !ALL_GATED.includes(role)) return true;
  return visibility.allowedRoles.includes(role);
}

export function gatedFieldCodes(): string[] {
  return Object.values(GATED_ROLE_FIELD);
}
