import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Space, Table, Tag, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../utils/datetime';
import { workflowApi } from '../api';
import type { Notification } from '../api/types';
import { t } from '../i18n/locale';
import { NOTIFICATIONS_CHANGED_EVENT } from '../appEvents';

const LEVEL_COLORS: Record<string, string> = {
  INFO: 'blue',
  SUCCESS: 'green',
  WARNING: 'orange',
  ERROR: 'red',
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await workflowApi.notifications(false));
    } catch {
      // DEF-11-08 同类问题：加载失败必须给出反馈，且不得产生未处理的 Promise 拒绝
      setNotes([]);
      message.error(t('加载通知失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unread = useMemo(() => notes.filter((n) => !n.read).length, [notes]);

  /** 已读状态变化后立即通知 AppShell 刷新未读角标（DEF-11-05）。 */
  const notifyBadgeChanged = () => window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));

  const markRead = async (id: string) => {
    try {
      await workflowApi.markRead(id);
      notifyBadgeChanged();
      await load();
    } catch {
      // DEF-11-08 同类：拦截器已提示，此处仅避免未处理的 Promise 拒绝
      message.error(t('标记已读失败'));
    }
  };

  const markAllRead = async () => {
    try {
      const res = await workflowApi.markAllRead();
      message.success(`已全部标为已读（${res.updated} 条）`);
      notifyBadgeChanged();
      await load();
    } catch {
      message.error(t('标记已读失败'));
    }
  };

  const dataSource = showAll ? notes : notes.filter((n) => !n.read);

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
          <Button type="primary" disabled={!unread} onClick={() => void markAllRead()}>{t('全部已读')}</Button>
        </Space>
        <Space>
          {unread > 0 && <Tag color="red">{t('未读')} {unread}</Tag>}
          <Button type={showAll ? 'primary' : 'default'} size="small" onClick={() => setShowAll(true)}>{t('全部')}</Button>
          <Button type={!showAll ? 'primary' : 'default'} size="small" onClick={() => setShowAll(false)}>{t('未读')}</Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={dataSource}
        locale={{ emptyText: showAll ? t('暂无通知') : t('暂无未读通知') }}
        columns={[
          {
            title: t('级别'),
            dataIndex: 'level',
            width: 90,
            render: (lv: string | undefined) => (lv ? <Tag color={LEVEL_COLORS[lv] || 'default'}>{lv}</Tag> : <Tag>INFO</Tag>),
          },
          { title: t('标题'), dataIndex: 'title', ellipsis: true },
          {
            title: t('内容'),
            dataIndex: 'body',
            // 等待审核类通知带 link（内容 /tasks/{id}、互动 /interaction/review?task={id}），
            // 正文后附「前往审核」直达该内容的审核界面；此时列级 ellipsis 会把链接裁掉，改由内层截断。
            render: (body: string | undefined, row: Notification) => {
              const link = row.link;
              if (!link) return body;
              return (
                <Space size={6}>
                  <Typography.Text style={{ maxWidth: 420 }} ellipsis={{ tooltip: body }}>{body ?? ''}</Typography.Text>
                  <a
                    href={link}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(link);
                    }}
                  >
                    {t('前往审核')}
                  </a>
                </Space>
              );
            },
          },
          { title: t('时间'), dataIndex: 'createdAt', width: 180, render: (v: string) => formatDateTime(v) },
          {
            title: t('已读'),
            dataIndex: 'read',
            width: 80,
            render: (r: boolean) => (r ? <Tag>{t('是')}</Tag> : <Tag color="processing">{t('否')}</Tag>),
          },
          {
            title: t('操作'),
            width: 110,
            render: (_: unknown, row: Notification) =>
              !row.read && (
                <Button size="small" onClick={() => void markRead(row.id)}>{t('标为已读')}</Button>
              ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        
        {t('通知偏好与模板可在 系统 → 工作流 中配置。')}
      </Typography.Paragraph>
    </div>
  );
}
