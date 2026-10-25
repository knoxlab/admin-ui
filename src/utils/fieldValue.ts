import type { FieldDef } from '../api/types';
import { parseEnumOptions } from './enumOptions';

/**
 * 字段值口径（保存归一 / 媒体自动填写 / 客户端表单控制器共用）。
 *
 * <p>把外部来源（媒体资产属性、控制器脚本的返回值）归一成可写入表单的值；
 * **不合法时返回 `undefined` 表示「不写」** —— 例如 ENUM 值不在模型选项里时宁可不填，
 * 也不要把一个保存时会被服务端拒绝的值塞进 fieldValues。</p>
 *
 * <p>从 `utils/mediaAutofill.ts` 提取：自动填写与表单控制器必须使用同一份口径，
 * 否则同一份模型在两处会得到不同的表单值。</p>
 */

export type CoercibleField = Pick<FieldDef, 'fieldType' | 'fieldConfig'>;

/** 空值判定：`0` / `false` 视为已填（布尔与数字字段的合法值）。 */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** 按字段类型归一取值；不合法时返回 `undefined`（调用方应跳过写入）。 */
export function coerceFieldValue(field: CoercibleField, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  switch (field.fieldType) {
    case 'ENUM':
    case 'MULTI_ENUM': {
      const opts = parseEnumOptions(field.fieldConfig?.options);
      const value = String(raw);
      // 素材类型枚举可能比模型选项更细（如 font）—— 不命中选项就不填，避免保存时被拒。
      return opts.some((o) => o.value === value) ? value : undefined;
    }
    case 'INTEGER':
    case 'DECIMAL': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'BOOLEAN':
      return raw === true || raw === 'true';
    case 'TAG': {
      const list = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      return list.map((s) => s.trim()).filter(Boolean);
    }
    case 'IMAGE':
    case 'MEDIA_REF':
      return String(raw);
    default:
      return typeof raw === 'number' ? String(raw) : raw;
  }
}
