import { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Input, InputNumber, Select, Space, Switch, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { modelsApi, tagsApi } from '../api';
import type { FieldDef, MediaAsset } from '../api/types';
import { parseEnumOptions } from '../utils/enumOptions';
import type { MediaFillContext } from '../utils/mediaAutofill';
import { t } from '../i18n/locale';
import BlockEditor from './BlockEditor';
import CategorySelect from './CategorySelect';
import MediaRefPicker from './MediaRefPicker';
import ImageField from './ImageField';
import { ComponentRefControl, ContentRefControl, KeyValueControl, TaxonomyRefControl } from './RefFieldControls';
import RichTextEditor from './RichTextEditor';

/**
 * 内容字段控件（模型驱动的受控输入）。
 *
 * 关键约定：本组件必须原样承接 {@code Form.Item} 注入的受控 props
 * （`value` / `checked` / `onChange` / `id`）。
 *
 * 历史缺陷：/pages、/page-designer、/site-browser 三处曾各自实现一个
 * `FieldInput`，只接收 `{ field }` 并只透传 `disabled`，把 Form.Item
 * 注入的 `value`/`onChange` 全部丢弃 —— 表现为自定义字段填不进去、
 * 必填校验永远不过、创建页被永久拦截。现统一收敛到本组件，消除该缺陷面。
 */

/** DATE_TIME 取值容错：接受 dayjs 实例、ISO 字符串或空值。 */
function dateValue(value: unknown) {
  if (!value) return undefined;
  return dayjs.isDayjs(value) ? value : dayjs(String(value));
}

function TagSelect({
  siteId,
  disabled,
  value,
  onChange,
}: {
  siteId: string;
  disabled?: boolean;
  value?: string[];
  onChange?: (v: string[]) => void;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSuggestions = useCallback(
    async (prefix?: string) => {
      if (!siteId) return;
      setLoading(true);
      try {
        const tags = await tagsApi.suggestions(siteId, prefix);
        setOptions(tags.map((t) => ({ value: t, label: t })));
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [siteId],
  );

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  return (
    <Select
      mode="tags"
      tokenSeparators={[',', ' ']}
      disabled={disabled}
      value={value}
      onChange={onChange}
      loading={loading}
      onSearch={(v) => void loadSuggestions(v)}
      options={options}
      placeholder={t('输入标签，回车确认')}
      allowClear
    />
  );
}

function CustomCodeControl({
  siteId,
  contentTypeId,
  field,
  value,
  onChange,
}: {
  siteId: string;
  contentTypeId: string;
  field: FieldDef;
  value?: string;
  onChange?: (v: unknown) => void;
}) {
  const [rendered, setRendered] = useState('');
  const [rendering, setRendering] = useState(false);
  const cfg = field.fieldConfig || {};
  const inputMode = (cfg.inputMode as string) || 'text';
  const placeholder = (cfg.placeholder as string) || t('字段值');
  const maxLength = cfg.maxLength as number | undefined;
  const pattern = (cfg.pattern as string) || '';
  const patternMessage = (cfg.patternMessage as string) || t('不符合输入约束');

  const applyChange = (next: string) => {
    if (pattern) {
      try {
        if (next && !new RegExp(pattern).test(next)) {
          message.warning(patternMessage);
        }
      } catch {
        /* invalid regex in config — ignore client-side */
      }
    }
    onChange?.(next);
  };

  const render = async () => {
    if (!field.id || !contentTypeId) {
      message.warning(t('保存模型后即可渲染预览'));
      return;
    }
    setRendering(true);
    try {
      const r = await modelsApi.renderCustomCode(siteId, contentTypeId, field.id, value ?? '');
      if (r.valid && r.executed) setRendered(r.output ?? '');
      else if (r.valid && !r.executed) setRendered(r.message || t('（无脚本引擎，仅校验通过）'));
      else message.error(r.errors?.join('；') || r.message);
    } catch {
      message.error(t('渲染失败'));
    } finally {
      setRendering(false);
    }
  };

  if (inputMode === 'hidden') {
    return (
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          
          {t('隐藏字段（由脚本处理）')}
        </Typography.Text>
        <Space style={{ marginTop: 8 }} wrap>
          <Button size="small" onClick={() => void render()} loading={rendering}>
            
            {t('渲染预览')}
          </Button>
        </Space>
        {rendered && (
          <div style={{ marginTop: 8, padding: 8, border: '1px dashed #d9d9d9', borderRadius: 4 }}>
            <Typography.Text>{rendered}</Typography.Text>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {inputMode === 'textarea' ? (
        <Input.TextArea
          disabled={field.readOnly}
          value={value}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => applyChange(e.target.value)}
        />
      ) : (
        <Input
          disabled={field.readOnly}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => applyChange(e.target.value)}
        />
      )}
      <Space style={{ marginTop: 8 }} wrap>
        <Button size="small" onClick={() => void render()} loading={rendering}>
          
          {t('渲染预览')}
        </Button>
        {Boolean(cfg.renderCode) && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            
            {t('渲染代码长度：')}{String(cfg.renderCode).length}
          </Typography.Text>
        )}
        {pattern ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            
            {t('约束：')}{pattern}
          </Typography.Text>
        ) : null}
      </Space>
      {rendered && (
        <div style={{ marginTop: 8, padding: 8, border: '1px dashed #d9d9d9', borderRadius: 4 }}>
          <Typography.Text>{rendered}</Typography.Text>
        </div>
      )}
    </div>
  );
}

export function FieldControl({
  field,
  siteId,
  contentTypeId,
  id,
  value,
  checked,
  onChange,
  onCategorySelect,
  onMediaSelect,
  mediaFillContext,
}: {
  field: FieldDef;
  /** 站点上下文：TAG / CATEGORY / MEDIA_REF / CUSTOM_CODE 需要（缺省降级为空串）。 */
  siteId?: string | null;
  /** 所属内容模型：CUSTOM_CODE 渲染预览需要（缺省降级为空串）。 */
  contentTypeId?: string | null;
  /** Form.Item 注入：把 <label htmlFor> 关联到真实控件，点击标签即可聚焦。 */
  id?: string;
  value?: unknown;
  /** BOOLEAN 字段经 Form.Item valuePropName="checked" 注入表单状态。 */
  checked?: boolean;
  onChange?: (v: unknown) => void;
  /** When CATEGORY selected, pass category id + pathAlias for sibling autofill. */
  onCategorySelect?: (categoryId: string | undefined, pathAlias: string | undefined) => void;
  /** MEDIA_REF 选中后回调资产（内容编辑器据此自动填写空白字段）。 */
  onMediaSelect?: (assets: MediaAsset[], ctx: MediaFillContext) => void;
  /** 重复组行内选择时的上下文（槽位/行下标/子字段），顶层字段缺省。 */
  mediaFillContext?: Omit<MediaFillContext, 'fieldCode'>;
}) {
  const opts = parseEnumOptions(field.fieldConfig?.options);

  if (field.fieldType === 'BOOLEAN') {
    const on = checked !== undefined ? Boolean(checked) : Boolean(value);
    return <Switch id={id} disabled={field.readOnly} checked={on} onChange={onChange} />;
  }
  if (field.fieldType === 'TAG') {
    return <TagSelect siteId={siteId || ''} disabled={field.readOnly} value={value as string[]} onChange={onChange as (v: string[]) => void} />;
  }
  if (field.fieldType === 'CATEGORY') {
    return (
      <CategorySelect
        siteId={siteId || ''}
        disabled={field.readOnly}
        value={value as string | undefined}
        taxonomyRoot={field.fieldConfig?.taxonomyRoot as string | undefined}
        maxDepth={Number(field.fieldConfig?.maxDepth) || undefined}
        singleSelect={field.fieldConfig?.singleSelect !== false}
        onChange={(selected, alias) => {
          onChange?.(selected);
          onCategorySelect?.(typeof selected === 'string' ? selected : undefined, alias);
        }}
      />
    );
  }
  if (field.fieldType === 'BLOCK_EDITOR') {
    return (
      <BlockEditor
        value={value as string}
        onChange={onChange as (v: string) => void}
        allowedBlocks={Array.isArray(field.fieldConfig?.allowedBlocks) ? (field.fieldConfig.allowedBlocks as string[]) : undefined}
        charLimit={Number(field.fieldConfig?.charLimit) || undefined}
      />
    );
  }
  if (field.fieldType === 'CUSTOM_CODE') {
    return <CustomCodeControl siteId={siteId || ''} contentTypeId={contentTypeId || ''} field={field} value={value as string} onChange={onChange} />;
  }
  if (['INTEGER', 'DECIMAL'].includes(field.fieldType)) {
    return <InputNumber id={id} style={{ width: '100%' }} disabled={field.readOnly} value={value as number} onChange={onChange} />;
  }
  if (field.fieldType === 'DATE_TIME') {
    return <DatePicker id={id} showTime style={{ width: '100%' }} disabled={field.readOnly} value={dateValue(value)} onChange={onChange} />;
  }
  if (field.fieldType === 'RICH_TEXT') {
    // FT-003 / TC-M65-008：富文本字段使用富文本编辑器（不再降级为普通 TextArea）。
    // 富媒体（图片/视频的媒体库上传与选择）依赖站点上下文。
    return (
      <RichTextEditor
        id={id}
        rows={Number(field.fieldConfig?.rows) || 8}
        disabled={field.readOnly}
        siteId={siteId || undefined}
        value={value as string}
        onChange={onChange as (v: string) => void}
      />
    );
  }
  if (['LONG_TEXT', 'JSON'].includes(field.fieldType)) {
    return (
      <Input.TextArea
        id={id}
        rows={Number(field.fieldConfig?.rows) || 4}
        disabled={field.readOnly}
        showCount={Boolean(field.fieldConfig?.maxLength)}
        maxLength={Number(field.fieldConfig?.maxLength) || undefined}
        value={value as string}
        onChange={onChange}
      />
    );
  }
  if (['ENUM', 'MULTI_ENUM'].includes(field.fieldType)) {
    return (
      <Select
        id={id}
        mode={field.fieldType === 'MULTI_ENUM' ? 'multiple' : undefined}
        disabled={field.readOnly}
        options={opts}
        showSearch
        allowClear
        value={value as unknown}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'COLOR') {
    return <Input id={id} type="color" disabled={field.readOnly} style={{ width: 64, padding: 2 }} value={value as string} onChange={onChange} />;
  }
  if (field.fieldType === 'CONTENT_REF') {
    return (
      <ContentRefControl
        field={field}
        siteId={siteId || ''}
        disabled={field.readOnly}
        id={id}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'TAXONOMY_REF') {
    return (
      <TaxonomyRefControl
        field={field}
        siteId={siteId || ''}
        disabled={field.readOnly}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (field.fieldType === 'KEY_VALUE') {
    return <KeyValueControl field={field} disabled={field.readOnly} value={value} onChange={onChange} />;
  }
  if (field.fieldType === 'COMPONENT_REF') {
    return (
      <ComponentRefControl
        field={field}
        siteId={siteId || ''}
        disabled={field.readOnly}
        value={value}
        onChange={onChange}
        renderField={(child, childValue, childChange, nestedTypeId) => (
          <FieldControl
            field={child}
            siteId={siteId}
            contentTypeId={nestedTypeId || contentTypeId}
            value={childValue}
            checked={child.fieldType === 'BOOLEAN' ? Boolean(childValue) : undefined}
            onChange={childChange}
          />
        )}
      />
    );
  }
  if (field.fieldType === 'IMAGE') {
    return (
      <ImageField
        id={id}
        siteId={siteId || ''}
        disabled={field.readOnly}
        value={value}
        onChange={onChange as (v: string) => void}
      />
    );
  }
  if (field.fieldType === 'MEDIA_REF') {
    const cfg = (field.fieldConfig ?? {}) as { allowMultiple?: boolean };
    return (
      <MediaRefPicker
        siteId={siteId || ''}
        disabled={field.readOnly}
        multiple={Boolean(cfg.allowMultiple)}
        value={value as string | string[] | undefined}
        onChange={onChange as (v: string | string[] | undefined) => void}
        onSelect={(assets) => onMediaSelect?.(assets, { fieldCode: field.code, ...mediaFillContext })}
      />
    );
  }
  return (
    <>
      <Input
        id={id}
        disabled={field.readOnly}
        showCount={Boolean(field.fieldConfig?.maxLength)}
        maxLength={Number(field.fieldConfig?.maxLength) || undefined}
        value={value as string}
        onChange={onChange}
        placeholder={field.code === 'playback_url_s' || field.code === 'stream_url_s' ? 'https://...' : undefined}
      />
      {typeof value === 'string' && value && (field.code === 'playback_url_s' || field.code === 'stream_url_s') ? (
        <video src={value} controls style={{ display: 'block', width: '100%', maxHeight: 240, marginTop: 8 }} />
      ) : null}
    </>
  );
}

export default FieldControl;
