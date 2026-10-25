import type { Category, FieldDef } from '../api/types';
import { defaultGyz199ComposeConfig, type ComposeConfig } from './classCompose';
import { t } from '../i18n/locale';

const REPEAT_PARENT_KEY = '__repeatParent';

export type TaxonomyRoots = Partial<{
  program: string;
  general: string;
  world: string;
  china: string;
  nation: string;
  special_song: string;
}>;

const ROOT_ALIASES: { key: keyof TaxonomyRoots; alias: string }[] = [
  { key: 'program', alias: 'sarft-program-class' },
  { key: 'general', alias: 'gyz199-general' },
  { key: 'world', alias: 'gyz199-world' },
  { key: 'china', alias: 'gyz199-china' },
  { key: 'nation', alias: 'gyz199-nation' },
  { key: 'special_song', alias: 'gyz199-special-song' },
];

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

/** Resolve taxonomy root category ids from site tree by known pathAlias. */
export function resolveTaxonomyRootsFromTree(tree: Category[]): TaxonomyRoots {
  const flat = flattenCats(tree);
  const out: TaxonomyRoots = {};
  for (const { key, alias } of ROOT_ALIASES) {
    const hit = flat.find((c) => c.pathAlias === alias);
    if (hit) out[key] = hit.id;
  }
  return out;
}

function catChild(
  code: string,
  name: string,
  role: string,
  parentCode: string,
  rootId: string | undefined,
  sortOrder: number,
  helpText: string,
): FieldDef {
  return {
    code,
    name,
    fieldType: 'CATEGORY',
    required: false,
    sortOrder,
    readOnly: false,
    i18n: false,
    adminIndex: true,
    publicIndex: false,
    sensitive: false,
    sortable: false,
    filterable: true,
    highlight: false,
    uniqueField: false,
    helpText,
    fieldConfig: {
      singleSelect: true,
      maxDepth: 10,
      composeRole: role,
      ...(rootId ? { taxonomyRoot: rootId } : {}),
      [REPEAT_PARENT_KEY]: parentCode,
    },
  };
}

function strChild(
  code: string,
  name: string,
  parentCode: string,
  sortOrder: number,
  helpText: string,
  extraCfg?: Record<string, unknown>,
): FieldDef {
  return {
    code,
    name,
    fieldType: 'STRING',
    required: false,
    sortOrder,
    readOnly: false,
    i18n: false,
    adminIndex: true,
    publicIndex: false,
    sensitive: false,
    sortable: false,
    filterable: code === 'class_number',
    highlight: false,
    uniqueField: false,
    helpText,
    fieldConfig: {
      ...(extraCfg || {}),
      [REPEAT_PARENT_KEY]: parentCode,
    },
  };
}

/** Child field codes used by GY/Z 199 classification template. */
export const CLASSIFICATION_CHILD_CODES = [
  'program_class',
  'class_imitation',
  'class_special',
  'class_world',
  'class_china',
  'class_nation',
  'class_general',
  'class_number',
  'class_caption',
] as const;

/**
 * Build nested fields + compose config for a REPEAT_GROUP classification cataloguing template.
 */
export function buildClassificationTemplate(
  parentCode: string,
  roots: TaxonomyRoots,
): { children: FieldDef[]; compose: ComposeConfig } {
  const children: FieldDef[] = [
    catChild('program_class', t('主表分类'), 'base', parentCode, roots.program, 10, t('详表主类落点')),
    catChild(
      'class_imitation',
      t('仿分'),
      'imitation',
      parentCode,
      roots.program,
      20,
      t('从主表选被仿类目；按 compose.presets 取后缀'),
    ),
    catChild(
      'class_special',
      t('专类复分'),
      'special',
      parentCode,
      roots.special_song,
      30,
      t('专类复分表（可改 taxonomyRoot）'),
    ),
    catChild('class_world', t('世界地区'), 'world', parentCode, roots.world, 40, t('附录 B，组号自动包 <>')),
    catChild('class_china', t('中国地区'), 'china', parentCode, roots.china, 50, t('附录 C，组号自动包 ()')),
    catChild('class_nation', t('中国民族'), 'nation', parentCode, roots.nation, 60, t('附录 D，组号自动包 {}')),
    catChild('class_general', t('总论复分'), 'general', parentCode, roots.general, 70, t('附录 A，组号自动加 -')),
    strChild('class_number', t('分类号'), parentCode, 80, t('由 compose / 脚本自动生成，可手改'), {
      composeOutput: true,
    }),
    strChild('class_caption', t('类名说明'), parentCode, 90, t('由所选类名自动拼接，可手改'), {
      composeCaption: true,
    }),
  ];
  return { children, compose: defaultGyz199ComposeConfig() };
}

export const COMPOSE_SCRIPT_EXAMPLE = `// 可用: roles, composeDeclarative(), stripPrefix(code, prefix), wrap(code, left, right)
// 须 return { classNumber, classCaption }
var d = composeDeclarative();
var base = roles.base && roles.base.code;
if (base === 'F89' && roles.world && roles.world.code && roles.imitation && roles.imitation.code) {
  var suffix = stripPrefix(roles.imitation.code, 'F');
  return {
    classNumber: base + wrap(roles.world.code, '<', '>') + suffix,
    classCaption: (roles.base.name || '') + ' ' + (roles.world.name || '') + ' ' + (roles.imitation.name || '')
  };
}
return d;
`;

export const COMPOSE_GROOVY_EXAMPLE = `// 保存侧 Groovy。可用: roles / declarative / composeDeclarative() / stripPrefix / wrap
// 须返回 [classNumber: ..., classCaption: ...]
def base = roles.base?.code
def world = roles.world?.code
def im = roles.imitation?.code
if (base == 'F89' && world && im) {
  def suffix = stripPrefix(im, 'F')
  return [classNumber: base + wrap(world, '<', '>') + suffix, classCaption: roles.base?.name]
}
return composeDeclarative()
`;
