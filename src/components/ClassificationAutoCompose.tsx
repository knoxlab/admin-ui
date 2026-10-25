import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, Typography } from 'antd';
import { categoriesApi } from '../api';
import type { Category, FieldDef } from '../api/types';
import {
  composeFromConfig,
  findComposeConfig,
  rolesFromRow,
  type ComposeConfig,
  type RoleValue,
} from '../utils/classCompose';
import { t } from '../i18n/locale';

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

/**
 * Watches a class_rg row and writes class_number / class_caption from
 * declarative compose only. Dynamic scripts belong on CUSTOM_CODE fields.
 */
export default function ClassificationAutoCompose({
  siteId,
  repeatCode,
  rowIndex,
  childFields,
  composeConfig,
}: {
  siteId: string;
  repeatCode: string;
  rowIndex: number;
  childFields: FieldDef[];
  composeConfig?: ComposeConfig;
}) {
  const form = Form.useFormInstance();
  const row = Form.useWatch([repeatCode, rowIndex], form) as Record<string, unknown> | undefined;
  const catMapRef = useRef<Map<string, RoleValue>>(new Map());
  const lastWritten = useRef<string>('');
  const [mapReady, setMapReady] = useState(false);

  const config = useMemo(() => {
    const fromRg = composeConfig;
    const fromNumber = childFields.find((f) => f.code === 'class_number')?.fieldConfig as
      | Record<string, unknown>
      | undefined;
    return findComposeConfig(fromRg as unknown as Record<string, unknown>, findComposeConfig(fromNumber));
  }, [composeConfig, childFields]);

  useEffect(() => {
    if (!siteId) return;
    setMapReady(false);
    void categoriesApi.tree(siteId).then((tree) => {
      const map = new Map<string, RoleValue>();
      for (const c of flattenCats(tree)) {
        map.set(c.id, { id: c.id, code: c.pathAlias || undefined, name: c.name });
      }
      catMapRef.current = map;
      setMapReady(true);
    });
  }, [siteId]);

  useEffect(() => {
    if (!mapReady || !row || typeof row !== 'object') return;
    const roles = rolesFromRow(config, row, (id) => catMapRef.current.get(id));
    const result = composeFromConfig({ config, roles });
    if (!result.classNumber) return;
    if (lastWritten.current === `${result.classNumber}|${result.classCaption}`) return;
    lastWritten.current = `${result.classNumber}|${result.classCaption}`;
    form.setFieldValue([repeatCode, rowIndex, 'class_number'], result.classNumber);
    if (childFields.some((f) => f.code === 'class_caption')) {
      form.setFieldValue([repeatCode, rowIndex, 'class_caption'], result.classCaption);
    }
  }, [row, config, form, repeatCode, rowIndex, childFields, mapReady]);

  const preview = useMemo(() => {
    if (!row) return '';
    const roles = rolesFromRow(config, row, (id) => catMapRef.current.get(id));
    return composeFromConfig({ config, roles }).classNumber;
  }, [row, config]);

  if (!preview) return null;
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
      
      {t('组号预览：')}<Typography.Text code>{preview}</Typography.Text>
    </Typography.Text>
  );
}
