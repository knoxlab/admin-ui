import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Input, InputNumber, Select, Space, Spin, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { contentsApi, modelsApi } from '../api';
import type { ContentType, FieldDef } from '../api/types';
import { t } from '../i18n/locale';
import CategorySelect from './CategorySelect';
import ContentRefPicker from './ContentRefPicker';

const SKIP_NESTED = new Set(['FORM_SECTION', 'TAB', 'COLUMN', 'DIVIDER', 'REPEAT_GROUP']);

function codesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

/** 内容引用：按允许的内容类型与多选，弹出内容列表选择。 */
export function ContentRefControl(props: {
  field: FieldDef;
  siteId: string;
  disabled?: boolean;
  id?: string;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  return <ContentRefPicker {...props} />;
}

/** 分类引用：从分类管理里的分类树选择节点。 */
export function TaxonomyRefControl({
  field,
  siteId,
  disabled,
  value,
  onChange,
}: {
  field: FieldDef;
  siteId: string;
  disabled?: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  const multiple = Boolean(field.fieldConfig?.allowMultiple);
  const selected = multiple
    ? (Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []))
    : (Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : undefined));
  return (
    <CategorySelect
      siteId={siteId}
      disabled={disabled}
      value={selected}
      taxonomyRoot={field.fieldConfig?.taxonomyRoot as string | undefined}
      maxDepth={Number(field.fieldConfig?.maxDepth) || undefined}
      singleSelect={!multiple}
      placeholder={t('选择分类')}
      onChange={(id) => onChange?.(id)}
    />
  );
}

type Pair = { key: string; value: string };

function pairsFrom(value: unknown): Pair[] {
  if (typeof value === 'string' && value.trim()) {
    try {
      return pairsFrom(JSON.parse(value));
    } catch {
      return [{ key: '', value }];
    }
  }
  if (Array.isArray(value)) {
    return value.map((row) => {
      if (row && typeof row === 'object') {
        const record = row as Record<string, unknown>;
        return { key: String(record.key ?? ''), value: record.value == null ? '' : String(record.value) };
      }
      return { key: '', value: '' };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: item == null ? '' : String(item),
    }));
  }
  return [];
}

function coerceValue(raw: string, valueType: string): unknown {
  if (valueType === 'INTEGER') {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? raw : n;
  }
  if (valueType === 'DECIMAL') {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (valueType === 'BOOLEAN') return raw === 'true';
  return raw;
}

function whitelistOf(field: FieldDef): Record<string, string[]> | null {
  const raw = field.fieldVariables?.whiteList ?? field.fieldConfig?.whiteList;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = Array.isArray(values) ? values.map(String) : [];
  }
  return out;
}

/** 键值对：按行编辑，保存为对象。 */
export function KeyValueControl({
  field,
  disabled,
  value,
  onChange,
}: {
  field: FieldDef;
  disabled?: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  const valueType = String(field.fieldConfig?.valueType || 'STRING');
  const whitelist = whitelistOf(field);
  const [rows, setRows] = useState<Pair[]>(() => pairsFrom(value));
  const incoming = JSON.stringify(pairsFrom(value));
  useEffect(() => {
    setRows(pairsFrom(value));
  }, [incoming]);

  const emit = (next: Pair[]) => {
    setRows(next);
    const obj: Record<string, unknown> = {};
    for (const row of next) {
      const key = row.key.trim();
      if (!key) continue;
      obj[key] = coerceValue(row.value, valueType);
    }
    onChange?.(obj);
  };

  const update = (index: number, patch: Partial<Pair>) => {
    emit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {rows.map((row, index) => {
        const preset = whitelist?.[row.key];
        return (
          <Space.Compact key={index} style={{ width: '100%' }}>
            {whitelist ? (
              <Select
                disabled={disabled}
                style={{ width: '40%' }}
                placeholder={t('键')}
                value={row.key || undefined}
                options={Object.keys(whitelist).map((key) => ({ value: key, label: key }))}
                onChange={(key) => update(index, { key, value: '' })}
              />
            ) : (
              <Input
                disabled={disabled}
                style={{ width: '40%' }}
                placeholder={t('键')}
                value={row.key}
                onChange={(e) => update(index, { key: e.target.value })}
              />
            )}
            {valueType === 'BOOLEAN' ? (
              <Select
                disabled={disabled}
                style={{ width: '50%' }}
                value={row.value || undefined}
                placeholder={t('值')}
                options={[{ value: 'true', label: t('是') }, { value: 'false', label: t('否') }]}
                onChange={(next) => update(index, { value: next })}
              />
            ) : preset && preset.length > 0 ? (
              <Select
                disabled={disabled}
                style={{ width: '50%' }}
                placeholder={t('值')}
                value={row.value || undefined}
                options={preset.map((item) => ({ value: item, label: item }))}
                onChange={(next) => update(index, { value: next })}
              />
            ) : valueType === 'INTEGER' || valueType === 'DECIMAL' ? (
              <InputNumber
                disabled={disabled}
                style={{ width: '50%' }}
                placeholder={t('值')}
                value={row.value === '' ? undefined : Number(row.value)}
                onChange={(next) => update(index, { value: next == null ? '' : String(next) })}
              />
            ) : (
              <Input
                disabled={disabled}
                style={{ width: '50%' }}
                placeholder={t('值')}
                value={row.value}
                onChange={(e) => update(index, { value: e.target.value })}
              />
            )}
            <Button
              disabled={disabled}
              icon={<DeleteOutlined />}
              onClick={() => emit(rows.filter((_, i) => i !== index))}
            />
          </Space.Compact>
        );
      })}
      <Button
        disabled={disabled}
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => setRows([...rows, { key: '', value: '' }])}
      >
        {t('添加键值')}
      </Button>
    </Space>
  );
}

type ComponentInstance = {
  componentType?: string;
  componentTypeId?: string;
  order?: number;
  fieldValues?: Record<string, unknown>;
};

function asInstances(value: unknown): ComponentInstance[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object') as ComponentInstance[];
}

function editableFields(type: ContentType | undefined): FieldDef[] {
  if (!type?.fields?.length) return [];
  return [...type.fields]
    .filter((child) => !child.isSystem)
    .filter((child) => !SKIP_NESTED.has(child.fieldType))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * 组件引用。嵌入式在当前内容里填写组件字段；共享式选择已有组件内容。
 * 嵌套字段由调用方渲染，避免和字段控件互相引用。
 */
export function ComponentRefControl({
  field,
  siteId,
  disabled,
  value,
  onChange,
  renderField,
}: {
  field: FieldDef;
  siteId: string;
  disabled?: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
  renderField: (child: FieldDef, value: unknown, onChange: (next: unknown) => void, contentTypeId?: string) => ReactNode;
}) {
  const allowed = codesOf(field.fieldConfig?.allowedComponentTypes);
  const allowedKey = allowed.join('\n');
  const shared = String(field.fieldConfig?.bindingMode || 'EMBEDDED') === 'SHARED';
  const maxItems = field.fieldConfig?.maxItems == null || field.fieldConfig?.maxItems === ''
    ? -1
    : Number(field.fieldConfig?.maxItems);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [details, setDetails] = useState<Record<string, ContentType>>({});
  const [loading, setLoading] = useState(false);
  const [sharedOptions, setSharedOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const list = await modelsApi.list(siteId);
      const picked = list.filter((type) => {
        if (allowed.length > 0) return allowed.includes(type.code);
        return type.objectType === 'COMPONENT';
      });
      const loaded = await Promise.all(picked.map((type) => modelsApi.get(siteId, type.id).catch(() => type)));
      if (cancelled) return;
      setTypes(loaded);
      setDetails(Object.fromEntries(loaded.map((type) => [type.code, type])));
      if (shared) {
        const groups = await Promise.all(loaded.map(async (type) => {
          const items = await contentsApi.listByType(siteId, type.id).catch(() => []);
          return items.map((item) => ({
            value: item.id,
            label: `${item.title || item.id}（${type.name}）`,
          }));
        }));
        if (!cancelled) setSharedOptions(groups.flat());
      }
    })().catch(() => {
      if (!cancelled) {
        setTypes([]);
        setDetails({});
        setSharedOptions([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [siteId, allowedKey, shared]);

  const instances = asInstances(value);
  const atMax = maxItems >= 0 && instances.length >= maxItems;

  const write = (next: ComponentInstance[]) => {
    onChange?.(next.map((item, order) => ({ ...item, order })));
  };

  const typeOptions = useMemo(() => types.map((type) => ({
    value: type.code,
    label: `${type.name}（${type.code}）`,
  })), [types]);

  if (shared) {
    const selected = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
    return (
      <Select
        style={{ width: '100%' }}
        disabled={disabled || !siteId}
        loading={loading}
        mode="multiple"
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder={t('选择已有组件')}
        value={selected}
        options={sharedOptions}
        notFoundContent={loading ? <Spin size="small" /> : t('没有可引用的组件')}
        onChange={(next) => onChange?.(next)}
      />
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {loading && <Spin size="small" />}
      {!loading && types.length === 0 && (
        <Typography.Text type="secondary">{t('没有可嵌入的组件模型。请先创建组件类型，或在字段上填写允许的组件类型。')}</Typography.Text>
      )}
      {instances.map((item, index) => {
        const code = item.componentType && details[item.componentType] ? item.componentType : types[0]?.code;
        const detail = code ? details[code] : undefined;
        const children = editableFields(detail);
        return (
          <Card
            key={`${code || 'item'}-${index}`}
            size="small"
            title={detail?.name || code || t('组件')}
            extra={(
              <Button
                type="text"
                danger
                size="small"
                disabled={disabled}
                icon={<DeleteOutlined />}
                onClick={() => write(instances.filter((_, i) => i !== index))}
              />
            )}
          >
            {types.length > 1 && (
              <Select
                style={{ width: '100%', marginBottom: 8 }}
                disabled={disabled}
                value={code}
                options={typeOptions}
                onChange={(next) => {
                  const picked = details[next];
                  const copy = instances.slice();
                  copy[index] = {
                    componentType: next,
                    componentTypeId: picked?.id,
                    fieldValues: {},
                  };
                  write(copy);
                }}
              />
            )}
            {children.map((child) => (
              <div key={child.code} style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{child.name}</Typography.Text>
                {renderField(
                  child,
                  item.fieldValues?.[child.code],
                  (next) => {
                    const copy = instances.slice();
                    copy[index] = {
                      ...item,
                      componentType: code,
                      componentTypeId: detail?.id,
                      fieldValues: { ...(item.fieldValues || {}), [child.code]: next },
                    };
                    write(copy);
                  },
                  detail?.id,
                )}
              </div>
            ))}
          </Card>
        );
      })}
      <Button
        type="dashed"
        block
        disabled={disabled || atMax || types.length === 0}
        icon={<PlusOutlined />}
        onClick={() => {
          const first = types[0];
          write([...instances, { componentType: first.code, componentTypeId: first.id, fieldValues: {} }]);
        }}
      >
        {atMax ? t('已达上限') : t('添加组件')}
      </Button>
    </Space>
  );
}
