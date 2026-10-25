import { t } from '../i18n/locale';
/**
 * Declarative class-number composer driven by fieldConfig.compose.
 * Runtime does not require subdivision.json — only role values + config.
 */

export type ComposeRoleConfig = {
  field: string;
  /** Wrap code: ["<", ">"] | ["(", ")"] | ["{", "}"] */
  wrap?: [string, string];
  /** Prefix before code, e.g. "-" for 总论复分 */
  prefix?: string;
  /** Insert space before this segment unless previous ends with )]> */
  spaceBefore?: boolean;
  /** For imitation: strip this prefix from selected pathAlias */
  stripPrefix?: string;
  /** If true, use full pathAlias as segment (no strip) */
  useFullCode?: boolean;
};

export type ComposePreset = {
  whenBaseEquals?: string[];
  whenBasePrefix?: string[];
  order?: string[];
  roles?: Record<string, Partial<ComposeRoleConfig>>;
};

export type ComposeConfig = {
  mode?: 'declarative' | 'script' | 'declarative+script';
  order?: string[];
  roles?: Record<string, ComposeRoleConfig>;
  presets?: ComposePreset[];
  /** Client-side JS (preview / AutoCompose) */
  composeScript?: string;
  /** Server-side Groovy (content save + /class-compose/try) */
  composeScriptGroovy?: string;
  scriptLang?: 'javascript' | 'groovy';
};

export type RoleValue = {
  /** category id */
  id?: string;
  /** pathAlias / class code */
  code?: string;
  name?: string;
};

export type ComposeInput = {
  config: ComposeConfig;
  /** roleKey -> selected value */
  roles: Record<string, RoleValue | undefined>;
};

export type ComposeResult = {
  classNumber: string;
  classCaption: string;
  orderUsed: string[];
};

const DEFAULT_ORDER = ['base', 'imitation', 'special', 'world', 'china', 'nation', 'general'];

function matchPreset(baseCode: string | undefined, presets?: ComposePreset[]): ComposePreset | undefined {
  if (!baseCode || !presets?.length) return undefined;
  for (const p of presets) {
    if (p.whenBaseEquals?.includes(baseCode)) return p;
    if (p.whenBasePrefix?.some((pre) => baseCode.startsWith(pre))) return p;
  }
  return undefined;
}

function resolveRoleConfigs(
  config: ComposeConfig,
  baseCode?: string,
): { order: string[]; roles: Record<string, ComposeRoleConfig> } {
  const preset = matchPreset(baseCode, config.presets);
  const order = preset?.order?.length ? preset.order : config.order?.length ? config.order : DEFAULT_ORDER;
  const roles: Record<string, ComposeRoleConfig> = { ...(config.roles || {}) };
  if (preset?.roles) {
    for (const [k, patch] of Object.entries(preset.roles)) {
      roles[k] = { ...(roles[k] || { field: k }), ...patch };
    }
  }
  return { order, roles };
}

function segmentFromRole(roleCfg: ComposeRoleConfig, value?: RoleValue): { text: string; label?: string } | null {
  if (!value?.code) return null;
  let code = value.code;
  if (roleCfg.stripPrefix && code.startsWith(roleCfg.stripPrefix) && !roleCfg.useFullCode) {
    code = code.slice(roleCfg.stripPrefix.length);
  }
  if (!code) return null;

  if (roleCfg.wrap) {
    return { text: `${roleCfg.wrap[0]}${code}${roleCfg.wrap[1]}`, label: value.name };
  }
  if (roleCfg.prefix) {
    return { text: `${roleCfg.prefix}${code}`, label: value.name };
  }
  return { text: code, label: value.name };
}

/** Build class number from declarative compose config + role values. */
export function composeFromConfig(input: ComposeInput): ComposeResult {
  const baseCode = input.roles.base?.code || input.roles[input.config.roles?.base?.field || '']?.code;
  // Prefer explicit "base" role key
  const baseVal = input.roles.base;
  const resolved = resolveRoleConfigs(input.config, baseVal?.code || baseCode);
  let s = '';
  const labels: string[] = [];

  for (const roleKey of resolved.order) {
    const roleCfg = resolved.roles[roleKey];
    if (!roleCfg) continue;
    const value = input.roles[roleKey];
    const seg = segmentFromRole(roleCfg, value);
    if (!seg) continue;

    const spaceBefore =
      roleCfg.spaceBefore !== undefined
        ? roleCfg.spaceBefore
        : !roleCfg.wrap && !roleCfg.prefix && s.length > 0 && !/[>)\]]$/.test(s);

    if (s.length === 0) {
      s = seg.text;
    } else if (roleCfg.wrap || roleCfg.prefix) {
      // markers attach without leading space (F89<522>24 / N1217-09)
      const needSpace = spaceBefore === true;
      s += (needSpace ? ' ' : '') + seg.text;
    } else {
      const needSpace = spaceBefore !== false && !/[>)\]]$/.test(s);
      s += (needSpace ? ' ' : '') + seg.text;
    }
    if (seg.label) labels.push(seg.label);
  }

  return { classNumber: s, classCaption: labels.join(' '), orderUsed: resolved.order };
}

/** Default GY/Z 199 compose config (field codes match seed class_rg). */
export function defaultGyz199ComposeConfig(): ComposeConfig {
  return {
    mode: 'declarative',
    order: ['base', 'imitation', 'special', 'world', 'china', 'nation', 'general'],
    roles: {
      base: { field: 'program_class' },
      imitation: { field: 'class_imitation', spaceBefore: true },
      special: { field: 'class_special', spaceBefore: true },
      world: { field: 'class_world', wrap: ['<', '>'] },
      china: { field: 'class_china', wrap: ['(', ')'] },
      nation: { field: 'class_nation', wrap: ['{', '}'] },
      general: { field: 'class_general', prefix: '-' },
    },
    presets: [
      {
        whenBaseEquals: ['J1689'],
        order: ['base', 'imitation', 'special', 'world', 'general'],
        roles: { imitation: { stripPrefix: 'J16', spaceBefore: true } },
      },
      {
        whenBaseEquals: ['F89'],
        order: ['base', 'world', 'imitation', 'general'],
        roles: { imitation: { stripPrefix: 'F', spaceBefore: false } },
      },
      {
        whenBaseEquals: ['A39'],
        order: ['base', 'world', 'special', 'general'],
      },
      {
        whenBasePrefix: ['G1689', 'G1289', 'D89', 'E89', 'S89', 'T89', 'T1289'],
        order: ['base', 'world', 'general'],
      },
    ],
  };
}

/** Map form row values + field defs to role bag using compose.roles.*.field */
export function rolesFromRow(
  config: ComposeConfig,
  row: Record<string, unknown>,
  resolveCategory?: (id: string) => RoleValue | undefined,
): Record<string, RoleValue | undefined> {
  const out: Record<string, RoleValue | undefined> = {};
  for (const [roleKey, roleCfg] of Object.entries(config.roles || {})) {
    const raw = row[roleCfg.field];
    if (raw == null || raw === '') {
      out[roleKey] = undefined;
      continue;
    }
    if (typeof raw === 'string' && resolveCategory) {
      out[roleKey] = resolveCategory(raw) || { id: raw, code: raw };
    } else if (typeof raw === 'object' && raw !== null) {
      const o = raw as RoleValue;
      out[roleKey] = o;
    } else {
      out[roleKey] = { code: String(raw) };
    }
  }
  return out;
}

export function findComposeConfig(
  fieldConfig?: Record<string, unknown> | null,
  fallback?: ComposeConfig,
): ComposeConfig {
  if (!fieldConfig) return fallback || defaultGyz199ComposeConfig();
  const nested = fieldConfig.compose as ComposeConfig | undefined;
  if (nested && (nested.roles || nested.order || nested.presets || nested.composeScript || nested.composeScriptGroovy || nested.mode)) {
    return nested;
  }
  if (fieldConfig.roles || fieldConfig.order || fieldConfig.presets || fieldConfig.composeScript || fieldConfig.composeScriptGroovy) {
    return fieldConfig as unknown as ComposeConfig;
  }
  return fallback || defaultGyz199ComposeConfig();
}

const SCRIPT_FORBIDDEN = [
  /\bimport\b/i,
  /\brequire\s*\(/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bglobalThis\b/,
  /\bprocess\b/,
  /\bDeno\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
];

/**
 * Run optional composeScript (browser). Script may use:
 * roles, composeDeclarative(), stripPrefix(code, prefix), wrap(code, left, right)
 * and must return { classNumber, classCaption }.
 */
export function runComposeScript(
  script: string,
  roles: Record<string, RoleValue | undefined>,
  declarative: ComposeResult,
): ComposeResult {
  const src = script.trim();
  if (!src) return declarative;
  if (src.length > 16_384) throw new Error(t('composeScript 过长（上限 16384）'));
  for (const re of SCRIPT_FORBIDDEN) {
    if (re.test(src)) throw new Error(`composeScript 含禁止模式: ${re}`);
  }
  const stripPrefix = (code: string, prefix: string) =>
    typeof code === 'string' && code.startsWith(prefix) ? code.slice(prefix.length) : String(code ?? '');
  const wrap = (code: string, left: string, right: string) => `${left}${code}${right}`;
  const composeDeclarative = () => ({
    classNumber: declarative.classNumber,
    classCaption: declarative.classCaption,
    orderUsed: declarative.orderUsed,
  });
  // Sandboxed Function — no this, no free globals beyond injected args
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'roles',
    'composeDeclarative',
    'stripPrefix',
    'wrap',
    `"use strict";\n${src}`,
  );
  const out = fn(roles, composeDeclarative, stripPrefix, wrap) as
    | { classNumber?: unknown; classCaption?: unknown }
    | null
    | undefined;
  if (!out || typeof out !== 'object') return declarative;
  return {
    classNumber: out.classNumber != null ? String(out.classNumber) : '',
    classCaption: out.classCaption != null ? String(out.classCaption) : '',
    orderUsed: declarative.orderUsed,
  };
}

/** Declarative first; then optional JS when mode is script / declarative+script. */
export function composeAuto(input: ComposeInput): ComposeResult {
  const declarative = composeFromConfig(input);
  const mode = input.config.mode || 'declarative';
  const script = input.config.composeScript;
  if ((mode === 'script' || mode === 'declarative+script') && script?.trim()) {
    try {
      return runComposeScript(script, input.roles, declarative);
    } catch (e) {
      if (mode === 'script') {
        return { classNumber: '', classCaption: '', orderUsed: [] };
      }
      console.warn('[composeAuto] composeScript failed, fallback declarative', e);
      return declarative;
    }
  }
  return declarative;
}
