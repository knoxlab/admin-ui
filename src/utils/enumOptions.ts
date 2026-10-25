export type EnumOption = { label: string; value: string };

/** Parse ENUM/MULTI_ENUM options from API array or designer textarea text. */
export function parseEnumOptions(raw: unknown): EnumOption[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          const value = String(o.value ?? o.label ?? '').trim();
          const label = String(o.label ?? o.value ?? '').trim() || value;
          return value ? { label, value } : null;
        }
        const value = String(item ?? '').trim();
        return value ? { label: value, value } : null;
      })
      .filter((x): x is EnumOption => Boolean(x));
  }
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return { label: line, value: line };
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim() || label;
      return { label, value };
    })
    .filter((o) => o.value);
}

/** Textarea representation: `label:value` per line (value-only when equal). */
export function enumOptionsToText(raw: unknown): string {
  return parseEnumOptions(raw)
    .map((o) => (o.label === o.value ? o.value : `${o.label}:${o.value}`))
    .join('\n');
}
