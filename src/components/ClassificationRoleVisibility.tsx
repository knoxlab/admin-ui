import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Form, Typography } from 'antd';
import { categoriesApi } from '../api';
import type { Category, FieldDef } from '../api/types';
import {
  gatedFieldCodes,
  isClassificationChildVisible,
  resolveRoleVisibility,
  type RoleVisibility,
} from '../utils/gyz199Visibility';
import { t } from '../i18n/locale';

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

function findConstraintField(childFields: FieldDef[]): FieldDef | undefined {
  return childFields.find(
    (f) =>
      f.fieldType === 'CUSTOM_CODE' &&
      (f.code === 'class_constraint' || Boolean(f.fieldConfig?.gyz199RoleVisibility)),
  );
}

/**
 * Watches 主表分类 and drives GY/Z 199 role visibility for a class_rg row.
 * Clears values of fields that become hidden. Driven when CUSTOM_CODE
 * class_constraint (or gyz199RoleVisibility) is present in the repeat group.
 */
export function useClassificationRoleVisibility(
  siteId: string,
  repeatCode: string,
  rowIndex: number,
  childFields: FieldDef[],
): {
  enabled: boolean;
  visibility: RoleVisibility;
  visibleChildren: FieldDef[];
  specialRootId?: string;
} {
  const form = Form.useFormInstance();
  const enabled = Boolean(findConstraintField(childFields));
  const baseField =
    childFields.find((c) => c.fieldConfig?.composeRole === 'base') ||
    childFields.find((c) => c.code === 'program_class');
  const baseCodeField = baseField?.code || 'program_class';
  const baseId = Form.useWatch([repeatCode, rowIndex, baseCodeField], form) as string | undefined;

  const catMapRef = useRef<Map<string, { pathAlias?: string; id: string }>>(new Map());
  const aliasToIdRef = useRef<Map<string, string>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const lastCleared = useRef<string>('');

  useEffect(() => {
    if (!siteId || !enabled) return;
    setMapReady(false);
    void categoriesApi.tree(siteId).then((tree) => {
      const map = new Map<string, { pathAlias?: string; id: string }>();
      const aliasMap = new Map<string, string>();
      for (const c of flattenCats(tree)) {
        map.set(c.id, { id: c.id, pathAlias: c.pathAlias || undefined });
        if (c.pathAlias) aliasMap.set(c.pathAlias, c.id);
      }
      catMapRef.current = map;
      aliasToIdRef.current = aliasMap;
      setMapReady(true);
    });
  }, [siteId, enabled]);

  const basePathAlias = useMemo(() => {
    if (!baseId) return undefined;
    return catMapRef.current.get(baseId)?.pathAlias || undefined;
  }, [baseId, mapReady]);

  const visibility = useMemo(
    () => resolveRoleVisibility(basePathAlias),
    [basePathAlias],
  );

  const specialRootId = useMemo(() => {
    if (!visibility.specialRootAlias) return undefined;
    return aliasToIdRef.current.get(visibility.specialRootAlias);
  }, [visibility.specialRootAlias, mapReady]);

  useEffect(() => {
    if (!enabled || !mapReady) return;
    const key = `${visibility.baseCode || ''}|${visibility.allowedRoles.join(',')}`;
    if (lastCleared.current === key) return;
    lastCleared.current = key;
    for (const code of gatedFieldCodes()) {
      const child = childFields.find((c) => c.code === code);
      if (!child) continue;
      const role = child.fieldConfig?.composeRole as string | undefined;
      if (isClassificationChildVisible(code, role, visibility)) continue;
      const cur = form.getFieldValue([repeatCode, rowIndex, code]);
      if (cur != null && cur !== '') {
        form.setFieldValue([repeatCode, rowIndex, code], undefined);
      }
    }
  }, [enabled, mapReady, visibility, form, repeatCode, rowIndex, childFields]);

  const visibleChildren = useMemo(() => {
    if (!enabled) return childFields;
    return childFields
      .filter((c) =>
        isClassificationChildVisible(c.code, c.fieldConfig?.composeRole as string | undefined, visibility),
      )
      .map((c) => {
        if (c.code !== 'class_special' && c.fieldConfig?.composeRole !== 'special') return c;
        if (!specialRootId) return c;
        return {
          ...c,
          fieldConfig: { ...(c.fieldConfig || {}), taxonomyRoot: specialRootId },
        };
      });
  }, [enabled, childFields, visibility, specialRootId]);

  return { enabled, visibility, visibleChildren, specialRootId };
}

export function ClassificationVisibilityHint({
  enabled,
  visibility,
}: {
  enabled: boolean;
  visibility: RoleVisibility;
}) {
  if (!enabled) return null;
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 8 }}
      message={t('GY/Z 199 复分约束')}
      description={
        <Typography.Text style={{ fontSize: 12 }}>
          {visibility.hint}
          {visibility.rule?.fromCode && visibility.rule?.toCode ? (
            <>
              <br />
              
              {t('仿分范围：')}{visibility.rule.fromCode}～{visibility.rule.toCode}
            </>
          ) : null}
        </Typography.Text>
      }
    />
  );
}
