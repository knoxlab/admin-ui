import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space, Switch,
  Table, Tabs, Tag, Typography, message,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useSearchParams } from 'react-router-dom';
import { rolesApi, usersApi, workflowApi } from '../api';
import { QUIET } from '../api/client';
import type {
  NotificationPreference, NotificationTemplate, Role, User, Workflow, WorkflowTask,
} from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { t } from '../i18n/locale';
import ContentReviewModal from '../components/ContentReviewModal';

const STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED'];

const DEFAULT_TRANSITIONS: Array<{
  sourceStatus: string;
  targetStatus: string;
  requiredComment: boolean;
  minApprovers: number;
  allowedRoleId?: string;
}> = [
  { sourceStatus: 'DRAFT', targetStatus: 'IN_REVIEW', requiredComment: false, minApprovers: 0 },
  { sourceStatus: 'WITHDRAWN', targetStatus: 'IN_REVIEW', requiredComment: false, minApprovers: 0 },
  { sourceStatus: 'IN_REVIEW', targetStatus: 'PUBLISHED', requiredComment: false, minApprovers: 1 },
  { sourceStatus: 'IN_REVIEW', targetStatus: 'DRAFT', requiredComment: true, minApprovers: 0 },
];

const EVENT_LABELS: Record<string, string> = {
  'review-task.submitted': '提交审核',
  'review-task.approved': '审核通过',
  'review-task.rejected': '审核驳回',
  'review-task.cancelled': '取消审核',
  'review-task.delegated': '任务委派',
  'review-task.succeeded': '发布完成',
  'workflow.timeout.warning': '超时提醒',
};

const TEMPLATE_LABELS: Record<string, string> = {
  task_submitted: '提交审核',
  task_approved: '审核通过',
  task_rejected: '审核驳回',
  publish_succeeded: '发布完成',
  build_failed: '构建失败',
  task_timeout: '审核超时',
  task_delegated: '任务委派',
};

const statusColor = (status?: string) => {
  if (status === 'PUBLISHED') return 'green';
  if (status === 'DRAFT') return 'blue';
  if (status === 'DEPRECATED') return 'default';
  return 'default';
};

function DesignerTab({
  siteId, workflows, roles, selectedId, onSelect, onReload,
}: {
  siteId: string;
  workflows: Workflow[];
  roles: Role[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const selected = workflows.find((w) => w.id === selectedId);
  const draft = selected?.status === 'DRAFT';

  useEffect(() => {
    if (!selected) {
      form.resetFields();
      return;
    }
    form.setFieldsValue({
      name: selected.name,
      description: selected.description,
      timeoutMinutes: selected.timeoutMinutes ?? 0,
      reminderIntervalMinutes: selected.reminderIntervalMinutes ?? 0,
      timeoutActionKey: selected.timeoutActionKey || 'NOTIFY',
      transitions: (selected.transitions?.length ? selected.transitions : DEFAULT_TRANSITIONS).map((t) => ({
        sourceStatus: t.sourceStatus,
        targetStatus: t.targetStatus,
        allowedRoleId: t.allowedRoleId || undefined,
        requiredComment: !!t.requiredComment,
        minApprovers: t.minApprovers ?? 0,
      })),
    });
  }, [selected, form]);

  const saveDraft = async () => {
    if (!selected) return;
    const v = await form.validateFields();
    const saved = await workflowApi.update(selected.id, {
      name: v.name,
      description: v.description,
      timeoutMinutes: v.timeoutMinutes ?? 0,
      reminderIntervalMinutes: v.reminderIntervalMinutes ?? 0,
      timeoutActionKey: v.timeoutActionKey || 'NOTIFY',
      transitions: (v.transitions ?? []).map((t: {
        sourceStatus: string; targetStatus: string; allowedRoleId?: string;
        requiredComment?: boolean; minApprovers?: number;
      }, i: number) => ({
        sourceStatus: t.sourceStatus,
        targetStatus: t.targetStatus,
        allowedRoleId: t.allowedRoleId || null,
        requiredComment: !!t.requiredComment,
        sortOrder: i,
        minApprovers: Number(t.minApprovers) || 0,
      })),
    });
    message.success(t('草稿已保存'));
    await onReload();
    onSelect(saved.id);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <Card
        size="small"
        title={t('流程版本')}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('新建')}</Button>}
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={workflows}
          rowClassName={(row) => (row.id === selectedId ? 'ant-table-row-selected' : '')}
          onRow={(row) => ({ onClick: () => onSelect(row.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: t('名称'), dataIndex: 'name', ellipsis: true },
            {
              title: t('状态'),
              width: 96,
              render: (_: unknown, row: Workflow) => (
                <Space size={4} wrap>
                  <Tag color={statusColor(row.status)}>{row.status}</Tag>
                  {row.system && <Tag>{t('系统')}</Tag>}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Card
        size="small"
        title={selected ? `${selected.name}  v${selected.version ?? 1}` : t('选择或新建流程')}
        extra={selected && (
          <Space>
            {selected.status === 'PUBLISHED' && (
              <Button onClick={async () => {
                const draftWf = await workflowApi.newVersion(selected.id);
                message.success(t('已另存为新版本草稿'));
                await onReload();
                onSelect(draftWf.id);
              }}>{t('另存新版本')}</Button>
            )}
            {draft && (
              <>
                <Button onClick={() => void saveDraft()}>{t('保存草稿')}</Button>
                <Button type="primary" onClick={async () => {
                  await saveDraft();
                  await workflowApi.publish(selected.id);
                  message.success(t('已发布'));
                  await onReload();
                }}>{t('发布')}</Button>
              </>
            )}
            {selected.status === 'DRAFT' && !selected.system && (
              <Popconfirm title={t('废弃后不可再发布')} onConfirm={async () => {
                await workflowApi.deprecate(selected.id);
                message.success(t('已废弃'));
                await onReload();
              }}>
                <Button danger>{t('废弃')}</Button>
              </Popconfirm>
            )}
          </Space>
        )}
      >
        {!selected ? (
          <Typography.Text type="secondary">{t('从左侧选择一条流程定义，或新建草稿后配置转换规则、会签人数与超时策略。')}</Typography.Text>
        ) : (
          <Form form={form} layout="vertical" disabled={!draft}>
            <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="description" label={t('说明')}><Input.TextArea rows={2} /></Form.Item>
            <Space size="large" wrap>
              <Form.Item name="timeoutMinutes" label={t('超时（分钟，0=关闭）')}>
                <InputNumber min={0} max={10080} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="reminderIntervalMinutes" label={t('提醒间隔（分钟）')}>
                <InputNumber min={0} max={1440} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="timeoutActionKey" label={t('超时动作')}>
                <Select style={{ width: 160 }} options={[
                  { value: 'NOTIFY', label: t('仅通知') },
                  { value: 'ESCALATE', label: t('升级给站点管理员') },
                ]} />
              </Form.Item>
            </Space>
            <Typography.Paragraph type="secondary">
              
              {t('会签：批准边上的最少批准人数 ≥ 2 时，第一人确认不改状态，凑齐人数后一次性通过。')}
            </Typography.Paragraph>
            <Form.List name="transitions">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="start" wrap style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item {...field} name={[field.name, 'sourceStatus']} rules={[{ required: true }]}>
                        <Select placeholder={t('源状态')} style={{ width: 140 }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'targetStatus']} rules={[{ required: true }]}>
                        <Select placeholder={t('目标状态')} style={{ width: 140 }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'allowedRoleId']}>
                        <Select allowClear placeholder={t('允许角色')} style={{ width: 160 }}
                          options={roles.map((r) => ({ value: r.id, label: r.name || r.code }))} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'minApprovers']}>
                        <InputNumber min={0} max={20} placeholder={t('会签人数')} style={{ width: 110 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'requiredComment']} valuePropName="checked">
                        <Switch checkedChildren={t('必填意见')} unCheckedChildren={t('意见可选')} />
                      </Form.Item>
                      {draft && <MinusCircleOutlined onClick={() => remove(field.name)} style={{ marginTop: 8 }} />}
                    </Space>
                  ))}
                  {draft && (
                    <Button type="dashed" onClick={() => add({ requiredComment: false, minApprovers: 0 })} block icon={<PlusOutlined />}>
                      
                      {t('添加转换')}
                    </Button>
                  )}
                </>
              )}
            </Form.List>
          </Form>
        )}
      </Card>
      <Modal title={t('新建工作流草稿')} open={creating} onCancel={() => setCreating(false)} destroyOnClose
        onOk={() => (document.getElementById('wf-create-form') as HTMLFormElement)?.requestSubmit()}>
        <Form
          id="wf-create-form"
          layout="vertical"
          onFinish={async (v) => {
            const created = await workflowApi.create(siteId, {
              name: v.name,
              description: v.description,
              transitions: DEFAULT_TRANSITIONS.map((t, i) => ({ ...t, sortOrder: i })),
            });
            message.success(t('草稿已创建'));
            setCreating(false);
            await onReload();
            onSelect(created.id);
          }}
        >
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('说明')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function TasksTab({
  siteId, tasks, users, onReload, focusTaskId,
}: {
  siteId: string;
  tasks: WorkflowTask[];
  users: User[];
  onReload: () => Promise<void>;
  /** 通知深链定位的审核任务（/workflow?task={id}）：高亮该行，便于「点击通知 → 进入该内容的审核界面」。 */
  focusTaskId?: string;
}) {
  const [rejectOpen, setRejectOpen] = useState<WorkflowTask | null>(null);
  /** 点击「内容」列的标题 → 只读审核弹窗（按内容模型表单布局展示提交版本）。 */
  const [reviewTask, setReviewTask] = useState<WorkflowTask | null>(null);
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState<string>();
  const [delegateOpen, setDelegateOpen] = useState<WorkflowTask | null>(null);

  return (
    <>
      <Table
        rowKey="id"
        dataSource={tasks}
        rowClassName={(row) => (row.id === focusTaskId ? 'ant-table-row-selected' : '')}
        columns={[
          {
            title: t('内容'),
            dataIndex: 'contentTitle',
            ellipsis: true,
            render: (_: unknown, row: WorkflowTask) => (
              <Typography.Link
                onClick={() => setReviewTask(row)}
                title={`${t('查看内容（只读）')} · ${row.contentItemId}`}
              >
                {row.contentTitle || `${row.contentItemId.slice(0, 8)}…`}
              </Typography.Link>
            ),
          },
          { title: t('目标'), dataIndex: 'targetStatus', width: 120 },
          { title: t('受理人'), dataIndex: 'assignee', width: 120 },
          {
            title: t('会签'),
            width: 140,
            render: (_: unknown, row: WorkflowTask) => {
              const required = row.requiredApprovers ?? 1;
              const confirmed = row.confirmedApprovers ?? 0;
              return <Progress percent={Math.round((confirmed / Math.max(required, 1)) * 100)} size="small" format={() => `${confirmed}/${required}`} />;
            },
          },
          {
            title: t('操作'),
            width: 360,
            render: (_: unknown, row: WorkflowTask) => (
              <Space wrap>
                <Button size="small" type="primary" onClick={async () => {
                  const info = await workflowApi.approve(row.id);
                  message.success(info.status === 'PENDING' ? t('已确认会签，等待其他人批准') : t('已通过'));
                  await onReload();
                }}>{t('通过')}</Button>
                <Button size="small" danger onClick={() => { setReason(''); setRejectOpen(row); }}>{t('驳回')}</Button>
                <Button size="small" onClick={() => { setAssignee(undefined); setDelegateOpen(row); }}>{t('委派')}</Button>
                <Popconfirm title={t('取消该审核任务？')} onConfirm={async () => {
                  await workflowApi.cancel(row.id);
                  message.success(t('已取消'));
                  await onReload();
                }}>
                  <Button size="small">{t('取消')}</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={t('驳回原因')} open={!!rejectOpen} onCancel={() => setRejectOpen(null)}
        onOk={async () => {
          if (!reason.trim()) { message.error(t('驳回必须填写原因')); return; }
          await workflowApi.reject(rejectOpen!.id, reason.trim());
          message.success(t('已驳回'));
          setRejectOpen(null);
          await onReload();
        }}>
        <Input.TextArea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('请填写驳回原因')} />
      </Modal>
      <Modal title={t('委派给审核人')} open={!!delegateOpen} onCancel={() => setDelegateOpen(null)}
        onOk={async () => {
          if (!assignee) { message.error(t('请选择委派对象')); return; }
          await workflowApi.delegate(delegateOpen!.id, assignee);
          message.success(t('已委派'));
          setDelegateOpen(null);
          await onReload();
        }}>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder={t('选择用户')}
          value={assignee}
          onChange={setAssignee}
          optionFilterProp="label"
          options={users.map((u) => ({ value: u.username, label: `${u.displayName || u.username} (${u.username})` }))}
        />
      </Modal>
      <ContentReviewModal
        open={!!reviewTask}
        siteId={siteId}
        task={reviewTask}
        onClose={() => setReviewTask(null)}
      />
    </>
  );
}

function TemplatesTab({ siteId }: { siteId: string }) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [current, setCurrent] = useState<NotificationTemplate>();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string }>();

  const load = useCallback(async () => {
    const list = await workflowApi.listTemplates(siteId);
    setTemplates(list);
    setCurrent((prev) => list.find((t) => t.key === prev?.key) ?? list[0]);
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!current) return;
    setSubject(current.subject);
    setBodyHtml(current.bodyHtml);
    setBodyText(current.bodyText || '');
    setPreview(undefined);
  }, [current]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={templates}
        rowClassName={(row) => (row.key === current?.key ? 'ant-table-row-selected' : '')}
        onRow={(row) => ({ onClick: () => setCurrent(row), style: { cursor: 'pointer' } })}
        columns={[
          { title: t('模板'), render: (_: unknown, row: NotificationTemplate) => TEMPLATE_LABELS[row.key] || row.key },
          { title: '', width: 72, render: (_: unknown, row: NotificationTemplate) => row.overlay ? <Tag>{t('站点')}</Tag> : <Tag>{t('全局')}</Tag> },
        ]}
      />
      {current && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input addonBefore={t('主题')} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Typography.Text type="secondary">{t('HTML 正文（FreeMarker，变量如 $')}{'${contentTitle}'}、${'${submitter}'}）</Typography.Text>
          <div style={{ border: '1px solid #f0f0f0', height: 220 }}>
            <Editor height="220px" language="html" value={bodyHtml} onChange={(v) => setBodyHtml(v || '')} options={{ minimap: { enabled: false } }} />
          </div>
          <Input.TextArea rows={3} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder={t('纯文本正文（可选）')} />
          <Space>
            <Button type="primary" onClick={async () => {
              const saved = await workflowApi.saveTemplate(siteId, current.key, { subject, bodyHtml, bodyText });
              message.success(t('已保存为站点覆盖'));
              setCurrent(saved);
              await load();
            }}>{t('保存站点覆盖')}</Button>
            <Button onClick={async () => {
              setPreview(await workflowApi.previewTemplate(siteId, current.key, {
                contentTitle: t('示例文章'), submitter: 'editor', reviewer: 'reviewer', reason: t('请核对标题'),
              }));
            }}>{t('预览')}</Button>
          </Space>
          {preview && (
            <Card size="small" title={preview.subject}>
              <iframe title="template-preview" sandbox="" srcDoc={preview.html} style={{ width: '100%', height: 180, border: 0 }} />
            </Card>
          )}
        </Space>
      )}
    </div>
  );
}

function PrefsTab() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);

  const load = useCallback(async () => {
    setPrefs(await workflowApi.preferences());
  }, []);

  useEffect(() => { void load(); }, [load]);

  const events = useMemo(() => [...new Set(prefs.map((p) => p.eventType))], [prefs]);

  const toggle = async (eventType: string, channel: string, enabled: boolean) => {
    const next = prefs.map((p) => (p.eventType === eventType && p.channel === channel ? { ...p, enabled } : p));
    setPrefs(await workflowApi.savePreferences(next));
  };

  return (
    <Table
      rowKey={(r) => r.eventType}
      pagination={false}
      dataSource={events.map((eventType) => ({ eventType }))}
      columns={[
        { title: t('事件'), dataIndex: 'eventType', render: (v: string) => EVENT_LABELS[v] || v },
        {
          title: t('站内通知'),
          render: (_: unknown, row: { eventType: string }) => {
            const p = prefs.find((x) => x.eventType === row.eventType && x.channel === 'IN_APP');
            return <Switch checked={p?.enabled !== false} onChange={(v) => void toggle(row.eventType, 'IN_APP', v)} />;
          },
        },
        {
          title: t('邮件'),
          render: (_: unknown, row: { eventType: string }) => {
            const p = prefs.find((x) => x.eventType === row.eventType && x.channel === 'EMAIL');
            return <Switch checked={p?.enabled !== false} onChange={(v) => void toggle(row.eventType, 'EMAIL', v)} />;
          },
        },
      ]}
    />
  );
}

function WorkflowInner() {
  const { siteId } = useSite();
  const [searchParams] = useSearchParams();
  // 通知深链：/workflow?task={id}（由 /tasks/{id} 重定向而来）→ 打开「待办」并定位该审核任务
  const focusTaskId = searchParams.get('task') || undefined;
  const [activeTab, setActiveTab] = useState<string>(focusTaskId ? 'tasks' : 'designer');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const focusHandled = useRef(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    // 审核员等低权限角色拿不到用户目录（用于「委派」候选），属预期降级，不该弹全局「没有权限」。
    const [wf, pending, roleList, userList] = await Promise.all([
      workflowApi.list(siteId, QUIET),
      workflowApi.pendingTasks(siteId),
      rolesApi.list(),
      usersApi.list(QUIET).catch(() => [] as User[]),
    ]);
    setWorkflows(wf);
    setTasks(pending);
    setRoles(roleList);
    setUsers(userList);
    setSelectedId((id) => id && wf.some((x) => x.id === id) ? id : wf[0]?.id);
    setLoaded(true);
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  // 深链任务的首帧处理：命中待办 → 高亮并滚动到该行；未命中（已处理/委派）→ 明确提示，不静默
  useEffect(() => {
    if (!focusTaskId || focusHandled.current || !loaded) return;
    focusHandled.current = true;
    if (tasks.some((task) => task.id === focusTaskId)) {
      window.setTimeout(() => {
        const row = document.querySelector(`tr[data-row-key="${focusTaskId}"]`);
        if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ block: 'center' });
        }
      }, 0);
    } else {
      message.info(t('该审核任务不在您的待办列表（可能已被处理或委派）'));
    }
  }, [loaded, tasks, focusTaskId]);

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('工作流')}</Typography.Title>
      </Space>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'designer',
          label: t('流程设计器'),
          children: siteId && (
            <DesignerTab siteId={siteId} workflows={workflows} roles={roles} selectedId={selectedId}
              onSelect={setSelectedId} onReload={load} />
          ),
        },
        {
          key: 'tasks',
          label: `待办 (${tasks.length})`,
          children: siteId
            ? <TasksTab siteId={siteId} tasks={tasks} users={users} onReload={load} focusTaskId={focusTaskId} />
            : null,
        },
        {
          key: 'templates',
          label: t('通知模板'),
          children: siteId ? <TemplatesTab siteId={siteId} /> : null,
        },
        {
          key: 'prefs',
          label: t('通知偏好'),
          children: <PrefsTab />,
        },
      ]} />
    </div>
  );
}

export default function WorkflowPage() {
  return <RequireSite><WorkflowInner /></RequireSite>;
}
