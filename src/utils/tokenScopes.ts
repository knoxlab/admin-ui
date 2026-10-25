import type { TranslateFn } from '../i18n/locale';

export type ScopeOption = { value: string; label: string };
export type ScopeOptionGroup = { label: string; options: ScopeOption[] };

/** 站点能力 scope（与后端 `SiteCapabilities.ALL` 对应）。 */
export const CAPABILITY_SCOPE_VALUES = [
  'read', 'write', 'review', 'deploy', 'model', 'template', 'migrate', 'admin',
];

/** 「API Token → Scope」下拉的分组选项：仅站点能力（社区版不提供 Agent/MCP 接入）。 */
export function tokenScopeOptionGroups(t: TranslateFn): ScopeOptionGroup[] {
  return [
    { label: t('站点能力'), options: CAPABILITY_SCOPE_VALUES.map((c) => ({ value: c, label: c })) },
  ];
}
