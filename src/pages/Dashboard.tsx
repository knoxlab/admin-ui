import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Empty, Input, List, message, Modal, Row, Space, Spin, Tag, Tooltip,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseOutlined, CloudUploadOutlined, EditOutlined,
  ExclamationCircleOutlined, ExpandOutlined, HistoryOutlined, ReloadOutlined, SendOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  dashboardApi, sitesApi, usersApi, workflowApi,
} from '../api';
import type {
  DashboardActivityItem, DashboardContentCardItem, DashboardPendingApprovalItem,
  DashboardRecentlyPublishedItem, DashboardSummary,
} from '../api/types';
import { hasCapability, isSystemAdmin, useAuth } from '../auth/AuthContext';
import { useSite } from '../context/SiteContext';
import { useNavigate } from 'react-router-dom';
import { type TranslateFn } from '../i18n/locale';
import { useT } from '../i18n/I18nProvider';
import { formatDateTime } from '../utils/datetime';

const fmt = (v?: string | null) => formatDateTime(v, '-');

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  IN_REVIEW: 'processing',
  APPROVED: 'warning',
  PUBLISHED: 'success',
  WITHDRAWN: 'error',
  ARCHIVED: 'default',
};

/** 审计动作翻译（前缀映射，未匹配时原样展示）。 */
function actionLabel(action: string, t: TranslateFn): string {
  const map: Record<string, string> = {
    WORKFLOW_SUBMIT: t('提交审核'), WORKFLOW_APPROVE: t('审批通过'), WORKFLOW_REJECT: t('驳回'),
    WORKFLOW_CONFIRM: t('会签确认'), WORKFLOW_CANCEL: t('取消审核'), WORKFLOW_DELEGATE: t('委派任务'),
    WORKFLOW_RESCHEDULE: t('调整定时'), WORKFLOW_SCHEDULED_PUBLISH: t('定时发布执行'),
    WORKFLOW_TIMEOUT: t('审批超时'), CONTENT_SCHEDULE_WITHDRAW: t('定时撤回'),
    CONTENT_SCHEDULED_WITHDRAW: t('自动撤回执行'), PAGE_SUBTREE_MOVE: t('移动页面子树'),
  };
  if (map[action]) return map[action];
  const http = action.match(/^(POST|PUT|PATCH|DELETE)\s+(.+)$/);
  if (http) return `${http[1]} ${http[2]}`;
  return action;
}

/** CrafterCMS 风格仪表盘卡片：标题 + 数量角标 + 最大化 + 刷新 + 空态。 */
function WidgetCard({ title, icon, count, loading, onRefresh, emptyText, children, extra, t }:
{
  title: string;
  icon: React.ReactNode;
  count?: number;
  loading: boolean;
  onRefresh: () => void;
  emptyText: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  t: TranslateFn;
}) {
  const [maximized, setMaximized] = useState(false);

  const body = (
    <Spin spinning={loading}>
      {count === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> : children}
    </Spin>
  );

  return (
    <>
      <Card
        size="small"
        title={<Space size={8}>{icon}<span>{title}</span>{count !== undefined && <Tag>{count}</Tag>}</Space>}
        extra={(
          <Space size={4}>
            {extra}
            <Tooltip title={t(maximized ? '还原' : '最大化')}>
              <Button
                type="text"
                size="small"
                aria-label="toggle-maximize"
                icon={maximized ? <CloseOutlined /> : <ExpandOutlined />}
                onClick={() => setMaximized((v) => !v)}
              />
            </Tooltip>
            <Tooltip title={t('刷新')}>
              <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh} />
            </Tooltip>
          </Space>
        )}
        styles={{ body: { minHeight: 160, maxHeight: 360, overflow: 'auto' } }}
      >
        {body}
      </Card>
      <Drawer
        title={<Space size={8}>{icon}<span>{title}</span>{count !== undefined && <Tag>{count}</Tag>}</Space>}
        placement="right"
        width="80%"
        open={maximized}
        onClose={() => setMaximized(false)}
        styles={{ body: { overflow: 'auto' } }}
        extra={(
          <Space size={4}>
            <Tooltip title={t('刷新')}>
              <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh} />
            </Tooltip>
            <Tooltip title={t('还原')}>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setMaximized(false)} />
            </Tooltip>
          </Space>
        )}
      >
        {body}
      </Drawer>
    </>
  );
}

export default function Dashboard() {
  const t = useT();
  const { site, siteId } = useSite();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivityItem[]>([]);
  const [myActivity, setMyActivity] = useState<DashboardActivityItem[]>([]);
  const [pending, setPending] = useState<DashboardPendingApprovalItem[]>([]);
  const [scheduled, setScheduled] = useState<DashboardContentCardItem[]>([]);
  const [recentPublished, setRecentPublished] = useState<DashboardRecentlyPublishedItem[]>([]);
  const [unpublished, setUnpublished] = useState<DashboardContentCardItem[]>([]);
  const [expiring, setExpiring] = useState<DashboardContentCardItem[]>([]);

  const canSeeUsers = isSystemAdmin(me);
  // 「仅管理员与发布者可见」：review / deploy 能力（对应 publisher、reviewer、site-admin、system-admin）。
  const canReview = !!siteId && hasCapability(me, siteId, 'review');
  const canDeploy = !!siteId && hasCapability(me, siteId, 'deploy');
  const canSeePublisherWidgets = canReview || canDeploy;

  // 待审批列表直接审批（概览卡片与其「最大化」抽屉共用同一列表体，两处都有操作）。
  const [rejectTask, setRejectTask] = useState<DashboardPendingApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [sum, act, myAct] = await Promise.all([
        dashboardApi.summary(siteId),
        dashboardApi.activity(siteId, 20).catch(() => null),
        dashboardApi.myActivity(siteId, 20).catch(() => null),
      ]);
      setSummary(sum);
      setActivity(act?.items ?? []);
      setMyActivity(myAct?.items ?? []);
      const jobs: Promise<void>[] = [];
      if (sum.pendingApproval !== undefined) {
        jobs.push(dashboardApi.pendingApproval(siteId, 20).then(setPending).catch(() => setPending([])));
      } else setPending([]);
      if (sum.scheduled !== undefined) {
        jobs.push(dashboardApi.scheduled(siteId, 20).then(setScheduled).catch(() => setScheduled([])));
      } else setScheduled([]);
      if (sum.recentlyPublished !== undefined) {
        jobs.push(dashboardApi.recentlyPublished(siteId, 20).then(setRecentPublished).catch(() => setRecentPublished([])));
      } else setRecentPublished([]);
      jobs.push(dashboardApi.unpublishedWork(siteId, 20).then(setUnpublished).catch(() => setUnpublished([])));
      jobs.push(dashboardApi.expiring(siteId, 20).then(setExpiring).catch(() => setExpiring([])));
      await Promise.all(jobs);
    } catch {
      setError(t('工作台数据加载失败，请确认后端服务可用后刷新。'));
    } finally {
      setLoading(false);
    }
  }, [siteId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const approveTask = async (row: DashboardPendingApprovalItem) => {
    setActing(true);
    try {
      const info = await workflowApi.approve(row.taskId);
      message.success(info.status === 'PENDING' ? t('已确认会签，等待其他人批准') : t('已通过'));
      await load();
    } finally {
      setActing(false);
    }
  };
  const submitReject = async () => {
    if (!rejectTask) return;
    if (!rejectReason.trim()) {
      message.error(t('驳回必须填写原因'));
      return;
    }
    setActing(true);
    try {
      await workflowApi.reject(rejectTask.taskId, rejectReason.trim());
      message.success(t('已驳回'));
      setRejectTask(null);
      setRejectReason('');
      await load();
    } finally {
      setActing(false);
    }
  };

  // 旧概览的站点/用户/任务统计（保留连接性与全局计数）。
  const [globalStats, setGlobalStats] = useState({ sites: 0, users: 0, tasks: 0 });
  useEffect(() => {
    Promise.all([
      sitesApi.list().catch(() => []),
      canSeeUsers ? usersApi.list().catch(() => []) : Promise.resolve([]),
      canReview && siteId ? workflowApi.pendingTasks(siteId).catch(() => []) : Promise.resolve([]),
    ]).then(([sites, users, tasks]) => setGlobalStats({ sites: sites.length, users: users.length, tasks: tasks.length }))
      .catch(() => undefined);
  }, [canSeeUsers, canReview, siteId]);

  const goContent = useMemo(() => (id: string) => navigate(`/content?item=${id}`), [navigate]);

  const renderActivityList = (rows: DashboardActivityItem[]) => (
    <List
      size="small"
      dataSource={rows}
      rowKey={(r) => `${r.occurredAt}-${r.action}-${r.objectId ?? ''}`}
      renderItem={(r) => (
        <List.Item>
          <List.Item.Meta
            avatar={<Tag color={r.result === 'SUCCESS' ? 'green' : 'red'} style={{ marginTop: 4 }}>
              {r.result === 'SUCCESS' ? t('成功') : t('失败')}
            </Tag>}
            title={r.title ? <a onClick={() => goContent(r.objectId!)}>{r.title}</a> : actionLabel(r.action, t)}
            description={(
              <>
                <UserOutlined /> {r.actorName || r.actor || '-'} · {actionLabel(r.action, t)} · {fmt(r.occurredAt)}
              </>
            )}
          />
        </List.Item>
      )}
    />
  );

  const renderContentList = (rows: DashboardContentCardItem[], emptyText: string, showSchedule: 'publish' | 'withdraw' | 'none') => (
    <List
      size="small"
      dataSource={rows}
      rowKey={(r) => r.id}
      locale={{ emptyText }}
      renderItem={(r) => (
        <List.Item>
          <List.Item.Meta
            title={<Space size={6}>
              <a onClick={() => goContent(r.id)}>{r.title}</a>
              <Tag color={STATUS_COLORS[r.status] ?? 'default'}>{r.status}</Tag>
            </Space>}
            description={(
              <>
                {r.createdBy ? t('由 {name} 修改', { name: r.createdBy }) : t('修改人未知')} · {fmt(r.updatedAt)}
                {showSchedule === 'publish' && r.scheduledPublishAt && (
                  <Tag icon={<ClockCircleOutlined />} color="warning" style={{ marginLeft: 8 }}>
                    {t('定时发布 {time}', { time: fmt(r.scheduledPublishAt) })}
                  </Tag>
                )}
                {showSchedule === 'withdraw' && r.scheduledWithdrawAt && (
                  <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ marginLeft: 8 }}>
                    {dayjs(r.scheduledWithdrawAt).isBefore(dayjs())
                      ? t('已到期待撤回')
                      : t('到期 {time}', { time: fmt(r.scheduledWithdrawAt) })}
                  </Tag>
                )}
              </>
            )}
          />
        </List.Item>
      )}
    />
  );

  return (
    <div>
      {error && <Alert type="warning" message={error} style={{ marginBottom: 16 }} showIcon />}
      {!siteId && <Alert type="info" showIcon message={t('请先在上方选择一个站点以查看工作台数据。')} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card size="small" title={t('站点总览')}>
            <Space size={32} wrap>
              <Typography.Text type="secondary">{t('站点 {count}', { count: globalStats.sites })}</Typography.Text>
              {canSeeUsers && <Typography.Text type="secondary">{t('用户 {count}', { count: globalStats.users })}</Typography.Text>}
              {canReview && <Typography.Text type="secondary">{t('我的待办任务 {count}', { count: globalStats.tasks })}</Typography.Text>}
              <Typography.Text type="secondary">{t('当前站点状态 {status}', { status: site?.status || '-' })}</Typography.Text>
              <Typography.Text type="secondary">{t('未发布工作 {count}', { count: summary?.unpublishedWork ?? '-' })}</Typography.Text>
              <Typography.Text type="secondary">{t('即将到期 {count}', { count: summary?.expiring ?? '-' })}</Typography.Text>
              <Button size="small" type="text" icon={<SendOutlined />} onClick={() => navigate('/content')}>{t('前往内容管理')}</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <WidgetCard
            title={t('活动（Activity）')}
            icon={<HistoryOutlined />}
            count={summary?.activity}
            loading={loading}
            onRefresh={load}
            emptyText={t('暂无最近活动')}
            t={t}
          >
            {renderActivityList(activity)}
          </WidgetCard>
        </Col>
        <Col xs={24} lg={12}>
          <WidgetCard
            title={t('我的活动（My Activity）')}
            icon={<UserOutlined />}
            count={summary?.myActivity}
            loading={loading}
            onRefresh={load}
            emptyText={t('暂无您的最近操作')}
            t={t}
          >
            {renderActivityList(myActivity)}
          </WidgetCard>
        </Col>

        {canSeePublisherWidgets && (
          <Col xs={24} lg={12}>
            <WidgetCard
              title={t('待审批（Pending Approval）')}
              icon={<CheckCircleOutlined />}
              count={summary?.pendingApproval}
              loading={loading}
              onRefresh={load}
              emptyText={t('没有待审批的内容')}
              extra={<Button type="link" size="small" onClick={() => navigate('/workflow')}>{t('工作流')}</Button>}
              t={t}
            >
              <List
                size="small"
                dataSource={pending}
                rowKey={(row) => row.taskId}
                renderItem={(row) => (
                  <List.Item
                    actions={[
                      canReview && (
                        <Button key="approve" size="small" type="primary" disabled={acting}
                          onClick={() => void approveTask(row)}>{t('通过')}</Button>
                      ),
                      canReview && (
                        <Button key="reject" size="small" danger disabled={acting}
                          onClick={() => { setRejectReason(''); setRejectTask(row); }}>{t('驳回')}</Button>
                      ),
                      <Button key="go" type="link" size="small" onClick={() => goContent(row.contentItemId)}>{t('查看')}</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={row.title}
                      description={`${t('{submitter} 提交 · {status} · {time}', {
                        submitter: row.submitter || '-',
                        status: row.targetStatus || '',
                        time: fmt(row.createdAt),
                      })}${row.scheduledAt ? t(' · 定时 {time}', { time: fmt(row.scheduledAt) }) : ''}`}
                    />
                  </List.Item>
                )}
              />
            </WidgetCard>
          </Col>
        )}

        {canSeePublisherWidgets && (
          <Col xs={24} lg={12}>
            <WidgetCard
              title={t('定时发布（Scheduled for Publish）')}
              icon={<ClockCircleOutlined />}
              count={summary?.scheduled}
              loading={loading}
              onRefresh={load}
              emptyText={t('没有已排期的定时发布')}
              t={t}
            >
              {renderContentList(scheduled, t('没有已排期的定时发布'), 'publish')}
            </WidgetCard>
          </Col>
        )}

        {canSeePublisherWidgets && (
          <Col xs={24} lg={12}>
            <WidgetCard
              title={t('最近发布（Recently Published）')}
              icon={<CloudUploadOutlined />}
              count={summary?.recentlyPublished}
              loading={loading}
              onRefresh={load}
              emptyText={t('暂无发布记录')}
              t={t}
            >
              <List
                size="small"
                dataSource={recentPublished}
                rowKey={(r) => r.id}
                locale={{ emptyText: t('暂无发布记录') }}
                renderItem={(r) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Space size={6}>
                        <a onClick={() => goContent(r.id)}>{r.title}</a>
                        <Tag color="success">v{r.publishedVersion}</Tag>
                      </Space>}
                      description={`${r.createdBy || '-'} · ${fmt(r.publishedAt)}${r.routePath ? ` · ${r.routePath}` : ''}`}
                    />
                  </List.Item>
                )}
              />
            </WidgetCard>
          </Col>
        )}

        <Col xs={24} lg={12}>
          <WidgetCard
            title={t('未发布工作（Unpublished Work）')}
            icon={<EditOutlined />}
            count={summary?.unpublishedWork}
            loading={loading}
            onRefresh={load}
            emptyText={t('没有您名下的未发布内容')}
            t={t}
          >
            {renderContentList(unpublished, t('没有您名下的未发布内容'), 'none')}
          </WidgetCard>
        </Col>

        <Col xs={24} lg={12}>
          <WidgetCard
            title={t('即将到期（Expiring）')}
            icon={<ExclamationCircleOutlined />}
            count={summary?.expiring}
            loading={loading}
            onRefresh={load}
            emptyText={t('没有即将到期或已过期的内容')}
            t={t}
          >
            {renderContentList(expiring, t('没有即将到期或已过期的内容'), 'withdraw')}
          </WidgetCard>
        </Col>
      </Row>

      <Modal title={t('驳回原因')} open={!!rejectTask} confirmLoading={acting}
        onCancel={() => setRejectTask(null)}
        onOk={() => void submitReject()}>
        <Input.TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
          placeholder={t('请填写驳回原因')} />
      </Modal>
    </div>
  );
}
