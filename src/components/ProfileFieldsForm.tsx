import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Space, Spin, Switch, Typography, message } from 'antd';
import { modelsApi, usersApi } from '../api';
import type { ContentType, FieldDef } from '../api/types';
import RichTextEditor from '../components/RichTextEditor';
import { t } from '../i18n/locale';

interface ProfileFieldsFormProps {
  /** system.user-profile 或 system.frontend-user */
  typeCode: string;
  /** 从该站点读取内容类型 schema */
  siteId: string;
  userId: string;
  /** 后台用户资料由 system-admin 编辑；会员资料由本站 admin 编辑 */
  operatorIsAdmin?: boolean;
  onChanged?: () => void;
}

function renderField(field: FieldDef, onChange: (v: unknown) => void, siteId?: string) {
  const disabled = field.readOnly;
  switch (field.fieldType) {
    case 'RICH_TEXT':
      return (
        <RichTextEditor
          rows={Number(field.fieldConfig?.rows) || 6}
          disabled={disabled}
          siteId={siteId}
          onChange={(v) => onChange(v)}
        />
      );
    case 'LONG_TEXT':
      return <Input.TextArea rows={3} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case 'INTEGER':
    case 'DECIMAL':
      return <InputNumber disabled={disabled} onChange={(v) => onChange(v)} style={{ width: '100%' }} />;
    case 'BOOLEAN':
      return <Switch disabled={disabled} onChange={(v) => onChange(v)} />;
    case 'ENUM': {
      const opts = (field.fieldConfig?.options as string[] | undefined) ?? [];
      return (
        <Select disabled={disabled} onChange={(v) => onChange(v)} allowClear options={opts.map((o) => ({ value: o, label: o }))} />
      );
    }
    case 'MULTI_ENUM': {
      const opts = (field.fieldConfig?.options as string[] | undefined) ?? [];
      return (
        <Select mode="multiple" disabled={disabled} onChange={(v) => onChange(v)} allowClear options={opts.map((o) => ({ value: o, label: o }))} />
      );
    }
    case 'DATE_TIME':
      return <Input disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={t('ISO 8601，例如 2026-08-29T00:00:00Z')} />;
    default:
      return <Input disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * 用户资料表单（spec 5.2 / 12.1-3 / 12.2）：按预置内容类型 schema 渲染字段，
 * 支持自定义扩展字段。字段值以 field code 为键存取（与 system.user-profile 内容字段一致）。
 */
export default function ProfileFieldsForm({ typeCode, siteId, userId, operatorIsAdmin, onChanged }: ProfileFieldsFormProps) {
  const [form] = Form.useForm();
  const [type, setType] = useState<ContentType | null>(null);
  const [initial, setInitial] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      modelsApi.list(siteId).then((list) => list.filter((t) => t.code === typeCode).sort((a, b) => b.version - a.version)[0] ?? null),
      usersApi.profile(userId),
    ])
      .then(([found, profile]) => {
        if (!active) return;
        setType(found);
        setInitial(profile ?? {});
        form.setFieldsValue(profile ?? {});
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : t('加载资料失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [typeCode, siteId, userId, form]);

  const editableFields = useMemo(
    () => (type?.fields ?? []).filter((f) => !f.readOnly).sort((a, b) => a.sortOrder - b.sortOrder),
    [type],
  );

  const save = async () => {
    if (!operatorIsAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const values = await form.validateFields();
      await usersApi.updateProfile(userId, values);
      message.success(t('资料已保存'));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin size="small" />;
  if (error) return <Alert type="error" message={error} showIcon />;
  if (!type) return <Typography.Text type="secondary">{t('未找到内容类型')} {typeCode}</Typography.Text>;

  return (
    <Form form={form} layout="vertical">
      {editableFields.length === 0 && <Typography.Text type="secondary">{t('该资料类型没有可编辑字段')}</Typography.Text>}
      {editableFields.map((field) => (
        <Form.Item key={field.code} name={field.code} label={field.name} required={field.required} style={{ marginBottom: 12 }}>
          {renderField(field, () => undefined, siteId)}
        </Form.Item>
      ))}
      {operatorIsAdmin && editableFields.length > 0 && (
        <Space>
          <Button type="primary" size="small" loading={saving} onClick={save}>{t('保存资料')}</Button>
          <Button size="small" onClick={() => form.setFieldsValue(initial)}>{t('重置')}</Button>
        </Space>
      )}
    </Form>
  );
}
