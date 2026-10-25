import subdivision from '../data/gyz199/subdivision.json';

export type RegionNode = { code: string; name: string; children?: RegionNode[] };

export type ComposeParts = {
  baseCode: string;
  baseName?: string;
  imitationSuffix?: string;
  imitationName?: string;
  specialCode?: string;
  specialName?: string;
  worldCode?: string;
  worldName?: string;
  chinaCode?: string;
  chinaName?: string;
  nationCode?: string;
  nationName?: string;
  generalCode?: string;
  generalName?: string;
  order?: string[];
};

export type ImitationRule = {
  codes: string[];
  label: string;
  fromCode: string | null;
  toCode: string | null;
  stripPrefix: string | null;
  order: string[];
  specialAfterImitation?: boolean;
  specialTables?: string[];
};

export type SpecialTable = {
  title: string;
  appliesTo: string[];
  appliesPrefix: string[];
  items: { code: string; name: string }[];
};

const data = subdivision as {
  general: { title: string; items: { code: string; name: string }[] };
  world: { title: string; tree: RegionNode[] };
  china: { title: string; tree: RegionNode[]; subdiv: { code: string; name: string }[] };
  nation: { title: string; items: { code: string; name: string }[] };
  specialTables: Record<string, SpecialTable>;
  imitationRules: ImitationRule[];
  defaultOrder: string[];
};

export const gyz199Subdivision = data;

export function findImitationRule(baseCode: string): ImitationRule | undefined {
  return data.imitationRules.find((r) => r.codes.includes(baseCode));
}

/** Codes in [fromCode, toCode] inclusive by string compare within same letter family. */
export function codeInRange(code: string, fromCode: string, toCode: string): boolean {
  if (!code || code.length < 2) return false;
  if (code[0] !== fromCode[0]) return false;
  return code >= fromCode && code <= toCode;
}

export function imitationSuffix(fullCode: string, stripPrefix: string): string {
  if (fullCode.startsWith(stripPrefix)) return fullCode.slice(stripPrefix.length);
  return fullCode;
}

export function resolveSpecialTables(baseCode: string, imitationFullCode?: string): SpecialTable[] {
  const rule = findImitationRule(baseCode);
  const keys = new Set<string>();
  if (rule?.specialTables) rule.specialTables.forEach((k) => keys.add(k));

  const probe = imitationFullCode || baseCode;
  for (const [key, table] of Object.entries(data.specialTables)) {
    if (table.appliesTo.includes(probe) || table.appliesTo.includes(baseCode)) {
      keys.add(key);
      continue;
    }
    if (table.appliesPrefix.some((p) => probe.startsWith(p) || baseCode.startsWith(p))) {
      keys.add(key);
    }
  }
  // 仿分落到歌曲/器乐类时启用对应专类表
  if (imitationFullCode) {
    if (/^J1619/.test(imitationFullCode)) keys.add('song');
    if (/^J1621|^J1635/.test(imitationFullCode)) keys.add('instrumental');
  }
  if (/^J1619/.test(baseCode)) keys.add('song');
  if (/^J1621|^J1635/.test(baseCode)) keys.add('instrumental');
  if (/^A3613|^A3623/.test(baseCode)) keys.add('hk_mo');
  if (baseCode === 'A39') keys.add('politics_country');

  return [...keys].map((k) => data.specialTables[k]).filter(Boolean);
}

export function composeClassNumber(parts: ComposeParts): { classNumber: string; classCaption: string } {
  const order = parts.order?.length ? parts.order : data.defaultOrder;
  let s = parts.baseCode || '';
  const labels: string[] = [];
  if (parts.baseName) labels.push(parts.baseName);

  const appendSegment = (seg: string) => {
    if (!seg) return;
    const needSpace = s.length > 0 && !/[>)\]]$/.test(s);
    s += (needSpace ? ' ' : '') + seg;
  };

  for (const step of order) {
    if (step === 'imitation' && parts.imitationSuffix) {
      appendSegment(parts.imitationSuffix);
      if (parts.imitationName) labels.push(parts.imitationName);
    } else if (step === 'special' && parts.specialCode) {
      appendSegment(parts.specialCode);
      if (parts.specialName) labels.push(parts.specialName);
    } else if (step === 'world' && parts.worldCode) {
      s += `<${parts.worldCode}>`;
      if (parts.worldName) labels.push(parts.worldName);
    } else if (step === 'china' && parts.chinaCode) {
      s += `(${parts.chinaCode})`;
      if (parts.chinaName) labels.push(parts.chinaName);
    } else if (step === 'nation' && parts.nationCode) {
      s += `{${parts.nationCode}}`;
      if (parts.nationName) labels.push(parts.nationName);
    } else if (step === 'general' && parts.generalCode) {
      s += `-${parts.generalCode}`;
      if (parts.generalName) labels.push(parts.generalName);
    }
  }

  return { classNumber: s, classCaption: labels.filter(Boolean).join(' ') };
}

export function flattenRegionTree(nodes: RegionNode[], acc: RegionNode[] = []): RegionNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children?.length) flattenRegionTree(n.children, acc);
  }
  return acc;
}

export function regionToTreeData(nodes: RegionNode[]): { title: string; value: string; children?: ReturnType<typeof regionToTreeData> }[] {
  return nodes.map((n) => ({
    title: `${n.code} ${n.name}`,
    value: n.code,
    children: n.children?.length ? regionToTreeData(n.children) : undefined,
  }));
}
