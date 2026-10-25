import { Card, Col, Divider, Row, Space, Tabs, Tag, Typography } from 'antd';
import type { ContentType, FieldDef } from '../api/types';
import { buildModelFormNodes, nodeEmpty, type ModelFormItem, type ModelFormRow } from '../utils/modelFormLayout';
import { parseEnumOptions } from '../utils/enumOptions';
import { formatDateTime } from '../utils/datetime';
import ContentMediaValue from './ContentMediaValue';
import { t } from '../i18n/locale';

/**
 * 只读内容视图（工作流待办「点击标题 → 查看内容」）。
 *
 * <p>审核人需要**按内容模型的表单布局与字段顺序**核对提交的内容，而不是看一串键值对。
 * 本组件复用 {@link buildModelFormNodes} 的渲染树（模型设计器序列化的页签组 / 分区 / 行列 /
 * 12 栅格列宽 / 重复组），把每个字段渲染成「标签 + 只读值」：页签仍在页签里、多列仍并排、
 * 重复组仍按项列出 —— 与内容编辑器所见即所得的顺序完全一致。</p>
 *
 * <p>与 `ModelFormRenderer` 的区别：那边是**输入控件**（受控 Form.Item，禁用态仍会被误认为可编辑，
 * 富文本/媒体等控件在只读场景还会加载编辑器），这边只输出文本/标签/预览图，不挂任何表单控件，
 * 也不提交任何值 —— 审核弹窗不需要、也不应该能改动内容。</p>
 *
 * <p>媒体字段（IMAGE / MEDIA_REF）只给预览图，不显示资产编号：见 `ContentMediaValue`
 * （悬停提示 + 点击看大图 / 视频预览）。</p>
 */

/** 富文本/HTML → 纯文本：保留段落换行，丢弃标签，避免只读弹窗注入内容里的 HTML/脚本。 */
export function htmlToPlainText(html: string): string {
  return String(html || '')
    // 先整块去掉脚本/样式：剥标签会留下脚本文本，审核界面没有任何理由展示它。
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '· ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function enumLabel(field: FieldDef, value: unknown): string {
  const opts = parseEnumOptions(field.fieldConfig?.options);
  return opts.find((o) => o.value === String(value))?.label || String(value);
}

function boolValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * 字段取值的纯文本形式（列表/摘要/单测用）。
 * 富文本取正文文本、枚举取选项标签、日期按全站展示时区格式化，其余按原值。
 */
export function readOnlyValueText(field: FieldDef, value: unknown): string {
  if (isBlank(value)) return '';
  switch (field.fieldType) {
    case 'BOOLEAN':
      return boolValue(value) ? t('是') : t('否');
    case 'ENUM':
      return enumLabel(field, value);
    case 'MULTI_ENUM':
    case 'TAG':
      return (Array.isArray(value) ? value : [value]).map(String).join('、');
    case 'DATE_TIME':
      return formatDateTime(String(value));
    case 'RICH_TEXT':
    case 'BLOCK_EDITOR':
      return htmlToPlainText(String(value));
    case 'JSON':
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    default:
      if (typeof value === 'object') return JSON.stringify(value, null, 2);
      return String(value);
  }
}

function ReadOnlyValue({ field, siteId, value }: { field: FieldDef; siteId: string; value: unknown }) {
  if (isBlank(value)) return <Typography.Text type="secondary">—</Typography.Text>;

  if (field.fieldType === 'BOOLEAN') {
    const on = boolValue(value);
    return <Tag color={on ? 'green' : 'default'}>{on ? t('是') : t('否')}</Tag>;
  }
  if (field.fieldType === 'ENUM') {
    return <span>{enumLabel(field, value)}</span>;
  }
  if (field.fieldType === 'MULTI_ENUM' || field.fieldType === 'TAG') {
    const list = Array.isArray(value) ? value : [value];
    return (
      <Space wrap size={4}>
        {list.map((v) => (
          <Tag key={String(v)}>{field.fieldType === 'MULTI_ENUM' ? enumLabel(field, v) : String(v)}</Tag>
        ))}
      </Space>
    );
  }
  if (field.fieldType === 'DATE_TIME') {
    return <span>{formatDateTime(String(value))}</span>;
  }
  if (field.fieldType === 'COLOR') {
    return (
      <Space size={6}>
        <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 3, background: String(value), border: '1px solid #d9d9d9' }} />
        <span>{String(value)}</span>
      </Space>
    );
  }
  if (field.fieldType === 'IMAGE' || field.fieldType === 'MEDIA_REF') {
    // 只展示预览图（悬停提示 + 点击看大图/视频），不再把资产编号/UUID 摆在左侧
    return <ContentMediaValue siteId={siteId} fieldType={field.fieldType} value={value} />;
  }
  if (field.fieldType === 'RICH_TEXT' || field.fieldType === 'BLOCK_EDITOR') {
    return (
      <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {readOnlyValueText(field, value)}
      </Typography.Paragraph>
    );
  }
  const text = readOnlyValueText(field, value);
  if (field.fieldType === 'JSON' || typeof value === 'object') {
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12 }}>
        {text}
      </pre>
    );
  }
  if (/^https?:\/\//i.test(text)) {
    return <a href={text} target="_blank" rel="noreferrer">{text}</a>;
  }
  return <Typography.Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography.Text>;
}

function ReadOnlyField({ field, siteId, value }: { field: FieldDef; siteId: string; value: unknown }) {
  return (
    <div className="content-readonly-field" data-field-code={field.code} style={{ marginBottom: 12 }}>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
        {field.name}
      </Typography.Text>
      <ReadOnlyValue field={field} siteId={siteId} value={value} />
    </div>
  );
}

/** 重复组：按「第 N 项」逐项列出子字段（顺序与模型一致）。 */
function ReadOnlyRepeat({
  item, siteId, value,
}: {
  item: Extract<ModelFormItem, { kind: 'repeat' }>;
  siteId: string;
  value: unknown;
}) {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return (
    <Card size="small" style={{ marginBottom: 12 }} title={item.title}>
      {rows.length === 0 ? (
        <Typography.Text type="secondary">{t('无数据')}</Typography.Text>
      ) : rows.map((row, i) => {
        const record = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
        return (
          <div key={i} style={{ borderTop: i === 0 ? undefined : '1px solid #f0f0f0', paddingTop: i === 0 ? 0 : 8 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>{t('第')} {i + 1} {t('项')}</Typography.Text>
            <Row gutter={16} style={{ marginTop: 6 }}>
              {item.children.map((child) => (
                <Col key={child.code} xs={24} md={item.children.length > 1 ? 12 : 24}>
                  <ReadOnlyField field={child} siteId={siteId} value={record[child.code]} />
                </Col>
              ))}
            </Row>
          </div>
        );
      })}
    </Card>
  );
}

function renderItem(
  item: ModelFormItem,
  key: string,
  span: number,
  siteId: string,
  values: Record<string, unknown>,
) {
  if (item.kind === 'divider') {
    return <Col key={key} xs={24} md={span * 2}><Divider style={{ margin: '4px 0' }} /></Col>;
  }
  if (item.kind === 'tabs') {
    return (
      <Col key={key} xs={24} md={span * 2}>
        <Tabs
          size="small"
          items={item.tabs.map((tab) => ({
            key: tab.key,
            label: tab.title,
            children: renderRows(tab.rows, siteId, values),
          }))}
        />
      </Col>
    );
  }
  if (item.kind === 'repeat') {
    return (
      <Col key={key} xs={24} md={span * 2}>
        <ReadOnlyRepeat item={item} siteId={siteId} value={values[item.code]} />
      </Col>
    );
  }
  return (
    <Col key={key} xs={24} md={span * 2}>
      <ReadOnlyField field={item.field} siteId={siteId} value={values[item.field.code]} />
    </Col>
  );
}

function renderRows(rows: ModelFormRow[], siteId: string, values: Record<string, unknown>) {
  return rows.map((row) => {
    const body = (
      <Row gutter={16}>
        {row.columns.map((col) => col.items.map((item) => renderItem(
          item,
          `${row.key}:${col.key}:${item.kind === 'field' ? item.field.code : item.kind === 'repeat' ? item.code : item.key}`,
          col.span,
          siteId,
          values,
        )))}
      </Row>
    );
    return row.title ? (
      <Card key={row.key} size="small" title={row.title} style={{ marginBottom: 12 }}>{body}</Card>
    ) : <div key={row.key} style={{ marginBottom: 4 }}>{body}</div>;
  });
}

/** 布局已覆盖的字段码（含重复组子字段），用于兜底展示「未入布局」的已提交字段。 */
function layoutFieldCodes(nodes: ReturnType<typeof buildModelFormNodes>): Set<string> {
  const codes = new Set<string>();
  const walk = (rows: ModelFormRow[]) => {
    for (const row of rows) {
      for (const col of row.columns) {
        for (const item of col.items) {
          if (item.kind === 'field') codes.add(item.field.code);
          else if (item.kind === 'repeat') {
            codes.add(item.code);
            item.children.forEach((c) => codes.add(c.code));
          } else if (item.kind === 'tabs') {
            for (const tab of item.tabs) walk(tab.rows);
          }
        }
      }
    }
  };
  for (const node of nodes) {
    if (node.kind === 'section') walk(node.rows);
    else for (const tab of node.tabs) walk(tab.rows);
  }
  return codes;
}

export type ContentReadOnlyViewProps = {
  type: ContentType;
  siteId: string;
  /** 解析后的 `field_values`。 */
  values: Record<string, unknown>;
};

/**
 * 按内容模型布局只读渲染一条内容的字段。
 * 布局未覆盖但确有取值的模型字段追加在末尾「其他字段」，避免审核时漏看已提交的数据。
 */
export default function ContentReadOnlyView({ type, siteId, values }: ContentReadOnlyViewProps) {
  const nodes = buildModelFormNodes(type).filter((n) => !nodeEmpty(n));

  if (!nodes.length) {
    return <Typography.Text type="secondary">{t('该模型暂无字段定义，仅保存标题。')}</Typography.Text>;
  }

  const covered = layoutFieldCodes(nodes);
  const uncovered = (type.fields || []).filter(
    (f) => !covered.has(f.code) && !isBlank(values[f.code]),
  );

  return (
    <div className="content-readonly-view">
      {nodes.map((node) => {
        if (node.kind === 'tabs') {
          return (
            <Card key={node.key} size="small" style={{ marginBottom: 12 }}>
              <Tabs
                items={node.tabs.map((tab) => ({
                  key: tab.key,
                  label: tab.title,
                  children: renderRows(tab.rows, siteId, values),
                }))}
              />
            </Card>
          );
        }
        return <div key={node.key}>{renderRows(node.rows, siteId, values)}</div>;
      })}
      {uncovered.length > 0 && (
        <Card key="__uncovered" size="small" title={t('其他字段')} style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            {uncovered.map((field) => (
              <Col key={field.code} xs={24} md={12}>
                <ReadOnlyField field={field} siteId={siteId} value={values[field.code]} />
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
}
