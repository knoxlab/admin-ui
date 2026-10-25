import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Divider, Form, Input, Row, Select, Space, Tabs, Tag, Tooltip, TreeSelect, Typography, message } from 'antd';
import { BarsOutlined, CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ContentItem, ContentType, FieldDef, MediaAsset, RelationDef, SiteFolder, VisualTemplate } from '../api/types';
import { contentsApi, foldersApi, relationsApi, visualLayoutApi } from '../api';
import { FieldControl } from './ContentFieldControl';
import type { MediaFillContext } from '../utils/mediaAutofill';
import ClassificationAutoCompose from './ClassificationAutoCompose';
import {
  ClassificationVisibilityHint,
  useClassificationRoleVisibility,
} from './ClassificationRoleVisibility';
import { ClassComposeTrigger } from './ClassNumberComposer';
import { t } from '../i18n/locale';
import {
  buildModelFormNodes,
  nodeEmpty,
  type ModelFormItem,
} from '../utils/modelFormLayout';
import { findComposeConfig, type ComposeConfig } from '../utils/classCompose';

/**
 * 模型驱动的表单渲染器（需求 2026-09-21）。
 *
 * <p>把 {@link buildModelFormNodes} 的渲染树（分区 / 页签组 / 行+列宽 / 输入项）渲染为表单内容。
 * 内容编辑对话框与页面管理新建/编辑对话框共用本组件 —— 页签下的字段出现在其页签页面，
 * 行列布局完全参照模型设计器（12 栅格列宽、多列并排）。</p>
 *
 * <p>关键约定：本组件**只渲染字段输入**，不渲染标题/路径/模板等编辑器自有控件；
 * `Form.Item` 的受控注入（value/onChange/checked）由各输入项自行承接 —— 与
 * `components/ContentFieldControl.test.tsx` 锁定的受控契约一致。</p>
 *
 * <p>例外（2026-09-22）：页面属性**绑定控件**（所属栏目/URL/页面模板/可视化模板，
 * `systemFieldType` = folder/route/template/visualTemplate 的 🔒 系统字段）在本组件内渲染
 * 专用控件（栏目树/输入框/可视化模板选择），值映射条目级实体列（folderId/routePath/
 * templatePath/页面组成绑定）、不入 fieldValues —— 取值映射由页面管理/内容编辑器的保存路径完成。</p>
 */

/** 页面属性绑定控件种类（值映射条目级实体列，不入 fieldValues）。 */
export const BINDING_CONTROL_KINDS = new Set(['folder', 'route', 'template', 'visualTemplate']);

export type FolderTreeData = { title: string; value: string; children?: FolderTreeData[] };

/** 栏目树 → TreeSelect 数据（与页面管理/数据源同构）。 */
export function folderTreeDataForSelect(folders: SiteFolder[]): FolderTreeData[] {
  return folders.map((f) => ({
    title: f.title,
    value: f.id,
    children: f.children?.length ? folderTreeDataForSelect(f.children) : undefined,
  }));
}

/** 绑定控件（按 systemFieldType 渲染专用控件；编辑态栏目不允许清空——folderId 语义 null=不变更）。 */
function BindingFieldControl({
  kind,
  contentId,
  folders,
  visualTemplates,
  id,
  value,
  onChange,
}: {
  kind: string;
  contentId?: string;
  folders: SiteFolder[];
  visualTemplates: VisualTemplate[];
  /** Form.Item 注入：把 <label htmlFor> 关联到真实控件，点击标签即可聚焦。 */
  id?: string;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  if (kind === 'folder') {
    return (
      <TreeSelect
        id={id}
        value={value as string}
        onChange={(v: unknown) => onChange?.(v)}
        allowClear={!contentId}
        placeholder={t('选择栏目（可选）')}
        treeData={folderTreeDataForSelect(folders)}
        treeLine
        showSearch
        treeNodeFilterProp="title"
      />
    );
  }
  if (kind === 'route') {
    return (
      <Input
        id={id}
        value={value as string}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="/news/example"
      />
    );
  }
  if (kind === 'template') {
    return (
      <Input
        id={id}
        value={value as string}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="/templates/article.ftl"
      />
    );
  }
  return (
    <Select
      id={id}
      value={value as string}
      onChange={(v: unknown) => onChange?.(v)}
      allowClear
      placeholder={t('选择可视化模板')}
      options={visualTemplates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
    />
  );
}

/** 重复组行（含 GY/Z 199 可见性与分类组号自动组号，与内容编辑器口径一致）。 */
export function RepeatGroupEditor({
  code,
  title,
  minItems,
  maxItems,
  childFields,
  siteId,
  contentTypeId,
  compose,
  onMediaSelect,
  hiddenFields,
}: {
  code: string;
  title: string;
  minItems: number;
  maxItems: number;
  childFields: FieldDef[];
  siteId: string;
  contentTypeId?: string;
  compose?: ComposeConfig;
  /** 行内 MEDIA_REF 选择后回调（内容编辑器据此自动填写行字段与表单空白字段）。 */
  onMediaSelect?: (assets: MediaAsset[], ctx: MediaFillContext) => void;
  /** 控制器隐藏的字段码（重复组子字段）。 */
  hiddenFields?: ReadonlySet<string>;
}) {
  const form = Form.useFormInstance();
  const initialRows = Math.max(minItems, 1);
  const hasClassCompose =
    childFields.some(
      (c) =>
        c.fieldType === 'CATEGORY' &&
        (c.fieldConfig?.composeRole === 'base' || c.code === 'program_class'),
    ) && childFields.some((c) => c.code === 'class_number');
  const programClassField =
    childFields.find((c) => c.fieldConfig?.composeRole === 'base') ||
    childFields.find((c) => c.code === 'program_class');
  const taxonomyRoot = programClassField?.fieldConfig?.taxonomyRoot as string | undefined;
  const composeConfig = compose || findComposeConfig(undefined);

  return (
    <div className="content-repeat-group">
      <div className="content-repeat-group-head">
        <BarsOutlined />
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {code}
        </Typography.Text>
      </div>
      <Form.List name={code} initialValue={Array.from({ length: initialRows }, () => ({}))}>
        {(items, { add, remove }) => {
          const atMax = maxItems >= 0 && items.length >= maxItems;
          const atMin = items.length <= minItems;
          return (
            <div className="content-repeat-list">
              {items.map((item) => (
                <ClassificationRepeatRow
                  key={item.key}
                  itemName={item.name}
                  code={code}
                  childFields={childFields}
                  siteId={siteId}
                  contentTypeId={contentTypeId}
                  hasClassCompose={hasClassCompose}
                  composeConfig={composeConfig}
                  taxonomyRoot={taxonomyRoot}
                  programClassField={programClassField}
                  atMin={atMin}
                  atMax={atMax}
                  itemCount={items.length}
                  minItems={minItems}
                  onMediaSelect={onMediaSelect}
                  hiddenFields={hiddenFields}
                  onCopy={() => {
                    const current = form.getFieldValue([code, item.name]) || {};
                    add({ ...current }, item.name + 1);
                  }}
                  onRemove={() => remove(item.name)}
                />
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} disabled={atMax} onClick={() => add({})}>
                {atMax ? `已达上限（${maxItems}）` : `添加${title}`}
              </Button>
            </div>
          );
        }}
      </Form.List>
    </div>
  );
}

/** 重复组单行（含分类角色可见性联动与组号自动合成触发器）。 */
function ClassificationRepeatRow({
  itemName,
  code,
  childFields,
  siteId,
  contentTypeId,
  hasClassCompose,
  composeConfig,
  taxonomyRoot,
  programClassField,
  atMin,
  atMax,
  itemCount,
  minItems,
  onMediaSelect,
  hiddenFields,
  onCopy,
  onRemove,
}: {
  itemName: number;
  code: string;
  childFields: FieldDef[];
  siteId: string;
  contentTypeId?: string;
  hasClassCompose: boolean;
  composeConfig: ComposeConfig;
  taxonomyRoot?: string;
  programClassField?: FieldDef;
  atMin: boolean;
  atMax: boolean;
  itemCount: number;
  minItems: number;
  onMediaSelect?: (assets: MediaAsset[], ctx: MediaFillContext) => void;
  hiddenFields?: ReadonlySet<string>;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const form = Form.useFormInstance();
  const { enabled, visibility, visibleChildren } = useClassificationRoleVisibility(
    siteId,
    code,
    itemName,
    childFields,
  );
  /** 分类角色可见性 ∩ 客户端控制器可见性（条件显示，FR-CM-FORMCTRL-003）。 */
  const shownChildren = hiddenFields
    ? visibleChildren.filter((c) => !hiddenFields.has(c.code))
    : visibleChildren;

  return (
    <div className="content-repeat-item">
      <div className="content-repeat-item-head">
        <Typography.Text strong>{t('第')} {itemName + 1}  {t('项')}</Typography.Text>
        <Space size={4}>
          <Tooltip title={t('复制此项')}>
            <Button type="text" size="small" icon={<CopyOutlined />} disabled={atMax} onClick={onCopy} />
          </Tooltip>
          <Tooltip title={atMin ? `至少保留 ${minItems} 项` : t('删除此项')}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={atMin || itemCount <= 1}
              onClick={onRemove}
            />
          </Tooltip>
        </Space>
      </div>
      <ClassificationVisibilityHint enabled={enabled} visibility={visibility} />
      {hasClassCompose && (
        <ClassificationAutoCompose
          siteId={siteId}
          repeatCode={code}
          rowIndex={itemName}
          childFields={childFields}
          composeConfig={composeConfig}
        />
      )}
      <Row gutter={16}>
        {shownChildren.map((child) => (
          <Col key={child.code} xs={24} md={shownChildren.length === 1 ? 24 : 12}>
            <Form.Item
              name={[itemName, child.code]}
              label={child.name}
              extra={
                (child.fieldConfig?.composeRole === 'base' || child.code === 'program_class') &&
                hasClassCompose ? (
                  <Space direction="vertical" size={0}>
                    {child.helpText && <span>{child.helpText}</span>}
                    <Form.Item noStyle shouldUpdate>
                      {() => {
                        const catId = form.getFieldValue([code, itemName, child.code]) as
                          | string
                          | undefined;
                        return (
                          <ClassComposeTrigger
                            siteId={siteId}
                            taxonomyRoot={taxonomyRoot || (programClassField?.fieldConfig?.taxonomyRoot as string)}
                            categoryId={catId}
                            onApply={(r) => {
                              form.setFieldValue([code, itemName, 'class_number'], r.classNumber);
                              if (childFields.some((c) => c.code === 'class_caption')) {
                                form.setFieldValue([code, itemName, 'class_caption'], r.classCaption);
                              }
                            }}
                          />
                        );
                      }}
                    </Form.Item>
                  </Space>
                ) : (
                  child.helpText
                )
              }
              rules={[{ required: child.required, message: `请填写${child.name}` }]}
              valuePropName={child.fieldType === 'BOOLEAN' ? 'checked' : 'value'}
            >
              <FieldControl
                field={child}
                siteId={siteId}
                contentTypeId={contentTypeId}
                onMediaSelect={onMediaSelect}
                mediaFillContext={{ repeatCode: code, rowIndex: itemName, childFields }}
              />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </div>
  );
}

/** RELATIONSHIP 字段编辑器（依赖内容已保存；新建态显示提示文案）。 */
export function RelationshipFieldEditor({
  siteId,
  field,
  contentId,
}: {
  siteId: string;
  field: FieldDef;
  contentId?: string;
}) {
  const relationId = String(field.fieldConfig?.relationId || '');
  const [defs, setDefs] = useState<RelationDef[]>([]);
  const [candidates, setCandidates] = useState<ContentItem[]>([]);
  const [linked, setLinked] = useState<{ id: string; title?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => defs.find((d) => d.id === relationId), [defs, relationId]);

  useEffect(() => {
    if (!siteId) return;
    void relationsApi
      .list(siteId)
      .then(setDefs)
      .catch(() => setDefs([]));
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !def) return;
    void contentsApi
      .listByType(siteId, def.targetTypeId)
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [siteId, def?.id, def?.targetTypeId]);

  const loadLinked = useCallback(async () => {
    if (!contentId || !def) return;
    try {
      const groups = await relationsApi.listForContent(contentId);
      const g = groups.find((x) => x.relationName === def.relationName);
      setLinked(g ? [...g.outgoing, ...g.incoming] : []);
    } catch {
      setLinked([]);
    }
  }, [contentId, def?.relationName]);

  useEffect(() => {
    void loadLinked();
  }, [loadLinked]);

  const remove = async (targetId: string) => {
    if (!contentId || !def) return;
    setBusy(true);
    try {
      await relationsApi.removeRelation(contentId, def.relationName, targetId);
      await loadLinked();
    } catch {
      message.error(t('取消关联失败'));
    } finally {
      setBusy(false);
    }
  };

  const add = async (targetId: string) => {
    if (!contentId || !def) return;
    setBusy(true);
    try {
      await relationsApi.add(contentId, def.relationName, targetId);
      await loadLinked();
    } catch {
      message.error(t('建立关联失败'));
    } finally {
      setBusy(false);
    }
  };

  if (!relationId) {
    return <Typography.Text type="secondary">{t('未配置关系定义（relationId）。')}</Typography.Text>;
  }
  if (!def) {
    return <Typography.Text type="secondary">{t('关系定义不存在：')}{relationId}</Typography.Text>;
  }
  if (!contentId) {
    return <Typography.Text type="secondary">{t('保存内容后即可配置关联关系。')}</Typography.Text>;
  }

  const linkedIds = new Set(linked.map((l) => l.id));
  const available = candidates.filter((c) => !linkedIds.has(c.id));

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        {linked.map((l) => (
          <Tag key={l.id} color="blue" closable onClose={() => void remove(l.id)}>
            {l.title || l.id.slice(0, 8)}
          </Tag>
        ))}
        {!linked.length && <Typography.Text type="secondary">{t('暂无关联内容')}</Typography.Text>}
      </Space>
      <Select
        showSearch
        allowClear
        loading={busy}
        disabled={busy}
        placeholder={t('选择要关联的内容')}
        optionFilterProp="label"
        style={{ width: '100%' }}
        value={null}
        onChange={(id) => id && void add(String(id))}
        options={available.map((c) => ({ value: c.id, label: c.title }))}
      />
      {Boolean(field.fieldConfig?.showFields) && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('关联列表列配置：')}{String(field.fieldConfig?.showFields)}
        </Typography.Text>
      )}
    </div>
  );
}

export type ModelFormRendererProps = {
  /** 内容模型（含 layout）；无布局时按 groupName 分组兜底。 */
  type: ContentType;
  siteId: string;
  /** 内容 id：RELATIONSHIP 字段依赖（新建态为空 → 渲染提示文案）。 */
  contentId?: string;
  /** CATEGORY 字段选中后回填组号的回调（分类组号联动）。 */
  onCategorySelect?: (categoryId: string | undefined, pathAlias: string | undefined) => void;
  /** 分区标题渲染回调（内容编辑器在标题旁显示必填进度 Tag；缺省仅标题）。 */
  renderSectionTitle?: (title: string, key: string) => React.ReactNode;
  /** 自定义重复组渲染（内容编辑器复用同一实现；缺省用本文件的 RepeatGroupEditor）。 */
  renderRepeat?: (item: Extract<ModelFormItem, { kind: 'repeat' }>) => React.ReactNode;
  /** 自定义 RELATIONSHIP 字段渲染（缺省用本文件的 RelationshipFieldEditor）。 */
  renderRelationship?: (field: FieldDef) => React.ReactNode;
  /** MEDIA_REF 选择媒体后回调（内容编辑器据此自动填写空白字段；缺省不填写）。 */
  onMediaSelect?: (assets: MediaAsset[], ctx: MediaFillContext) => void;
  /**
   * 客户端表单控制器隐藏的字段码（顶层字段或重复组子字段，FR-CM-FORMCTRL-003）。
   * 命中的输入项不渲染 —— 未挂载的 Form.Item 不参与前端校验，隐藏的必填项不会拦住保存；
   * 但**提交审核**时后端仍按模型 required 校验，隐藏必填项要么由脚本补值，要么别设 required。
   */
  hiddenFields?: ReadonlySet<string>;
};

/**
 * 模型驱动表单渲染器：分区 / 页签组 / 行（12 栅格列宽）逐级还原设计器布局。
 *
 * <p>页签组渲染为 antd `Tabs`，页签下的行与字段出现在其页签页面内；
 * 根级分区单行时直接渲染网格，多行时逐行渲染为卡片。</p>
 */
export default function ModelFormRenderer({
  type,
  siteId,
  contentId,
  onCategorySelect,
  renderSectionTitle,
  renderRepeat,
  renderRelationship,
  onMediaSelect,
  hiddenFields,
}: ModelFormRendererProps) {
  const nodes = useMemo(() => buildModelFormNodes(type).filter((n) => !nodeEmpty(n)), [type]);

  // 页面属性绑定控件的数据源（按需加载）：所属栏目树 / 可视化模板清单
  const bindingKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const f of type.fields || []) {
      if (f.isSystem && f.systemFieldType && BINDING_CONTROL_KINDS.has(f.systemFieldType)) {
        kinds.add(f.systemFieldType);
      }
    }
    return kinds;
  }, [type]);
  const [folders, setFolders] = useState<SiteFolder[]>([]);
  const [visualTemplates, setVisualTemplates] = useState<VisualTemplate[]>([]);
  const needFolders = bindingKinds.has('folder');
  const needVisualTemplates = bindingKinds.has('visualTemplate');
  useEffect(() => {
    if (!siteId || !needFolders) return;
    void foldersApi
      .tree(siteId)
      .then((data) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]));
  }, [siteId, needFolders]);
  useEffect(() => {
    if (!siteId || !needVisualTemplates) return;
    void visualLayoutApi
      .templates(siteId)
      .then((data) => setVisualTemplates(Array.isArray(data) ? data : []))
      .catch(() => setVisualTemplates([]));
  }, [siteId, needVisualTemplates]);

  const renderItem = (it: ModelFormItem, key: string, span: number) => {
    // 列内嵌套结构项（2026-09-22）：分隔线 / 页签组（设计器单元格内嵌结构）。
    if (it.kind === 'divider') {
      return (
        <Col key={key} xs={24} md={span * 2}>
          <Divider style={{ margin: '4px 0' }} />
        </Col>
      );
    }
    if (it.kind === 'tabs') {
      return (
        <Col key={key} xs={24} md={span * 2}>
          <div className="model-form-cell-tabs">
            <Tabs
              size="small"
              items={it.tabs.map((tab) => ({
                key: tab.key,
                label: tab.title,
                children: (
                  <div className="model-form-tab-body">
                    {tab.rows.map((row) => (
                      <Row key={row.key} gutter={8}>
                        {renderRowGrid([row])}
                      </Row>
                    ))}
                  </div>
                ),
              }))}
            />
          </div>
        </Col>
      );
    }
    if (it.kind === 'repeat') {
      // 重复组整组隐藏：脚本隐藏了该组或它的全部子字段（条件显示，FR-CM-FORMCTRL-003）
      const shownChildren = hiddenFields
        ? it.children.filter((c) => !hiddenFields.has(c.code))
        : it.children;
      if (!shownChildren.length) return null;
      if (renderRepeat) return <Col key={key} xs={24} md={span * 2}>{renderRepeat(it)}</Col>;
      return (
        <Col key={key} xs={24} md={span * 2}>
          <RepeatGroupEditor
            code={it.code}
            title={it.title}
            minItems={it.minItems}
            maxItems={it.maxItems}
            childFields={it.children}
            siteId={siteId}
            contentTypeId={type.id}
            compose={it.compose}
            onMediaSelect={onMediaSelect}
            hiddenFields={hiddenFields}
          />
        </Col>
      );
    }
    const f = it.field;
    if (hiddenFields?.has(f.code)) return null;
    if (f.fieldType === 'RELATIONSHIP') {
      if (renderRelationship) {
        return <Col key={key} xs={24} md={span * 2}>{renderRelationship(f)}</Col>;
      }
      return (
        <Col key={key} xs={24} md={span * 2}>
          <Form.Item label={f.name} extra={f.helpText}>
            <RelationshipFieldEditor siteId={siteId} field={f} contentId={contentId} />
          </Form.Item>
        </Col>
      );
    }
    // 页面属性绑定控件（2026-09-22）：值映射条目级实体列；渲染树任意位置（行/列/页签内）均可放置
    if (f.isSystem && f.systemFieldType && BINDING_CONTROL_KINDS.has(f.systemFieldType)) {
      return (
        <Col key={key} xs={24} md={span * 2}>
          <Form.Item
            name={f.code}
            label={f.name}
            extra={f.helpText}
            rules={[{ required: f.required, message: `请填写${f.name}` }]}
          >
            <BindingFieldControl
              kind={f.systemFieldType}
              contentId={contentId}
              folders={folders}
              visualTemplates={visualTemplates}
            />
          </Form.Item>
        </Col>
      );
    }
    return (
      <Col key={key} xs={24} md={span * 2}>
        <Form.Item
          name={f.code}
          label={f.name}
          extra={f.helpText}
          rules={[{ required: f.required, message: `请填写${f.name}` }]}
          valuePropName={f.fieldType === 'BOOLEAN' ? 'checked' : 'value'}
        >
          <FieldControl
            field={f}
            siteId={siteId}
            contentTypeId={type.id}
            onCategorySelect={onCategorySelect}
            onMediaSelect={onMediaSelect}
          />
        </Form.Item>
      </Col>
    );
  };

  const renderRowGrid = (rows: { key: string; columns: { key: string; span: number; items: ModelFormItem[] }[] }[]) =>
    rows.map((row) =>
      row.columns.map((col) =>
        col.items.map((it) =>
          renderItem(
            it,
            `${row.key}:${col.key}:${it.kind === 'repeat' ? it.code : it.kind === 'field' ? it.field.code : it.key}`,
            col.span,
          ),
        ),
      ),
    );

  if (!nodes.length) {
    return <Typography.Text type="secondary">{t('该模型暂无字段定义，仅保存标题。')}</Typography.Text>;
  }

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'tabs') {
          return (
            <Card key={node.key} size="small" className="model-form-tabs-card" style={{ marginBottom: 12 }}>
              <Tabs
                items={node.tabs.map((tab) => ({
                  key: tab.key,
                  label: tab.title,
                  children: (
                    <div className="model-form-tab-body">
                      {tab.rows.map((row) => (
                        <Card key={row.key} size="small" className="model-form-section" title={row.title || undefined} styles={{ body: { paddingBottom: 0 } }}>
                          <Row gutter={16}>{renderRowGrid([row])}</Row>
                        </Card>
                      ))}
                    </div>
                  ),
                }))}
              />
            </Card>
          );
        }
        if (node.rows.length === 1) {
          return (
            <div key={node.key} className="model-form-section-plain">
              <Row gutter={16}>{renderRowGrid(node.rows)}</Row>
            </div>
            );
        }
        return (
          <div key={node.key} className="model-form-section-plain">
            {node.rows.map((row) => (
              <Card key={row.key} size="small" className="model-form-section" title={renderSectionTitle ? renderSectionTitle(row.title || node.title, node.key) : row.title || node.title} styles={{ body: { paddingBottom: 0 } }}>
                <Row gutter={16}>{renderRowGrid([row])}</Row>
              </Card>
            ))}
          </div>
        );
      })}
    </>
  );
}
