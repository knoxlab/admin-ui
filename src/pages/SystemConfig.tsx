import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Form, Input, Select, Space, Switch, Table, Tabs, Typography, message,
} from 'antd';
import { SettingOutlined, SafetyOutlined } from '@ant-design/icons';
import { organizationApi, sitesApi } from '../api';
import type { AccessAuditItem } from '../api';
import type {
  BrandingConfig, OrganizationSettings, SiteAuthorizationPolicy,
} from '../api/types';
import { hasCapability, isSystemAdmin, useAuth } from '../auth/AuthContext';
import { useSite } from '../context/SiteContext';
import { parseBranding } from '../utils/branding';
import { formatDateTime } from '../utils/datetime';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';

type TabKey = 'org' | 'policy';

/**
 * 系统配置：原"系统 > 组织设置"和"系统 > 站点策略"两个独立菜单合并而成。
 * 通过 URL `?tab=org` / `?tab=policy` 切换页签，默认 org。
 */
export default function SystemConfigPage() {
  const { me } = useAuth();
  const { siteId } = useSite();
  const [searchParams, setSearchParams] = useSearchParams();
  const sysAdmin = isSystemAdmin(me);
  const siteAdmin = hasCapability(me, siteId, 'admin');

  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = tabParam === 'policy' ? 'policy' : 'org';

  const setTab = (next: TabKey) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  // 组织设置
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [orgBrand, setOrgBrand] = useState<BrandingConfig>({});
  /** 页面提示层（登录标识说明）：可关闭，「?」恢复。 */
  const hint = usePageHint();

  // 站点策略
  const [policy, setPolicy] = useState<SiteAuthorizationPolicy | null>(null);
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);
  const [denialAction, setDenialAction] = useState<string | undefined>();
  const [denials, setDenials] = useState<AccessAuditItem[]>([]);
  const [denialTotal, setDenialTotal] = useState(0);
  const [denialPage, setDenialPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (sysAdmin) {
        const settings = await organizationApi.settings().catch(() => null);
        if (cancelled) return;
        setOrgSettings(settings);
        setOrgBrand(parseBranding(settings?.branding));
      }
      if (siteId && siteAdmin) {
        const pol = await sitesApi.authorizationPolicy(siteId).catch(() => null);
        const guidance = await sitesApi.accessGuidance(siteId).catch(() => ({ enabled: false }));
        if (cancelled) return;
        setPolicy(pol);
        setGuidanceEnabled(guidance.enabled);
      } else {
        setPolicy(null);
        setGuidanceEnabled(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sysAdmin, siteAdmin, siteId]);

  useEffect(() => {
    if (!siteId || !siteAdmin) {
      setDenials([]);
      setDenialTotal(0);
      return;
    }
    let cancelled = false;
    void sitesApi.accessAudit(siteId, { page: denialPage, size: 10, action: denialAction }).then((page) => {
      if (cancelled) return;
      setDenials(page.items);
      setDenialTotal(page.total);
    }).catch(() => {
      if (!cancelled) {
        setDenials([]);
        setDenialTotal(0);
      }
    });
    return () => { cancelled = true; };
  }, [siteId, siteAdmin, denialAction, denialPage]);

  const saveOrgSettings = async (next: OrganizationSettings, brand: BrandingConfig) => {
    await organizationApi.updateSettings({ ...next, branding: JSON.stringify(brand) });
    message.success(t('组织设置已保存'));
    setOrgSettings(next);
    setOrgBrand(brand);
  };

  const orgForm = (
    <Space direction="vertical" style={{ width: '100%' }}>
      <PageHintAlert
        hint={hint}
        message={t('组织级登录标识影响后台/前台登录解析方式（spec 5.5 / AC-IAM-019）')}
      />
      <PageHintRestore hint={hint} alignRight />
      {orgSettings && (
        <Form
          layout="vertical"
          style={{ maxWidth: 460 }}
          initialValues={{
            loginIdentifier: orgSettings.loginIdentifier ?? 'USERNAME',
            portalUrl: orgSettings.portalUrl ?? '',
            mailDomain: orgSettings.mailDomain ?? '',
            fromEmail: orgSettings.fromEmail ?? '',
            defaultLanguage: orgSettings.defaultLanguage ?? 'zh-CN',
            defaultTimezone: orgSettings.defaultTimezone ?? 'Asia/Shanghai',
          }}
          onFinish={async (v) => {
            await saveOrgSettings(
              {
                loginIdentifier: v.loginIdentifier,
                portalUrl: v.portalUrl,
                mailDomain: v.mailDomain,
                fromEmail: v.fromEmail,
                defaultLanguage: v.defaultLanguage,
                defaultTimezone: v.defaultTimezone,
              },
              orgBrand,
            );
          }}
        >
          <Form.Item name="loginIdentifier" label={t('登录标识')} extra={t('EMAIL 时后台登录仅接受邮箱，USERNAME 时仅接受用户名')}>
            <Select
              options={[
                { value: 'USERNAME', label: t('用户名') },
                { value: 'EMAIL', label: t('邮箱') },
              ]}
            />
          </Form.Item>
          <Form.Item name="portalUrl" label={t('系统自引用 URL')}><Input /></Form.Item>
          <Form.Item name="mailDomain" label={t('发件域名')}><Input /></Form.Item>
          <Form.Item name="fromEmail" label={t('发件邮箱')} rules={[{ type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="defaultLanguage" label={t('默认语言')}><Input /></Form.Item>
          <Form.Item name="defaultTimezone" label={t('默认时区')}><Input /></Form.Item>
          <Typography.Paragraph strong>{t('后台品牌')}</Typography.Paragraph>
          <Space direction="vertical" style={{ width: '100%' }}>
            {([
              ['backendPrimaryColor', t('后台主色')],
              ['backendSecondaryColor', t('后台次色')],
              ['loginBackground', t('登录背景色')],
            ] as const).map(([key, label]) => (
              <Space key={key} style={{ width: '100%' }}>
                <input
                  type="color"
                  value={orgBrand[key] || '#1677ff'}
                  style={{ width: 40, height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
                  onChange={(e) => setOrgBrand({ ...orgBrand, [key]: e.target.value })}
                />
                <span style={{ width: 100 }}>{label}</span>
                <Typography.Text code>{orgBrand[key] || t('默认')}</Typography.Text>
              </Space>
            ))}
          </Space>
          <Button type="primary" htmlType="submit" style={{ marginTop: 12 }}>{t('保存组织设置')}</Button>
        </Form>
      )}
    </Space>
  );

  const policyForm = (
    <Space direction="vertical">
      {!siteId && <Typography.Text type="secondary">{t('请选择站点')}</Typography.Text>}
      {siteId && !policy && <Typography.Text type="secondary">{t('请选择站点')}</Typography.Text>}
      {siteId && policy && (
        <>
          <Space>
            <span>{t('同行评审（禁止自批）')}</span>
            <Switch checked={policy.peerReviewRequired} onChange={async (v) => {
              const next = await sitesApi.saveAuthorizationPolicy(siteId, { peerReviewRequired: v });
              setPolicy(next);
              message.success(t('已保存'));
            }} />
          </Space>
          <Space>
            <span>{t('审核员可改稿')}</span>
            <Switch checked={policy.reviewerCanWrite} onChange={async (v) => {
              const next = await sitesApi.saveAuthorizationPolicy(siteId, { reviewerCanWrite: v });
              setPolicy(next);
              message.success(t('已保存'));
            }} />
          </Space>
          <Space>
            <span>{t('发布管理员可改稿')}</span>
            <Switch checked={policy.publisherCanWrite} onChange={async (v) => {
              const next = await sitesApi.saveAuthorizationPolicy(siteId, { publisherCanWrite: v });
              setPolicy(next);
              message.success(t('已保存'));
            }} />
          </Space>
          <Space>
            <span>{t('AI 直接发布')}</span>
            <Switch
              checked={policy.agentDirectPublish}
              onChange={async (v) => {
                const next = await sitesApi.saveAuthorizationPolicy(siteId, { agentDirectPublish: v });
                setPolicy(next);
                message.success(t('已保存'));
              }}
            />
            {!policy.agentDirectPublish && <Typography.Text type="secondary">{t('关闭时 AI 参与的内容必须经审批后方可发布')}</Typography.Text>}
          </Space>
          <Space>
            <span>{t('会员注册需审核')}</span>
            <Switch checked={Boolean(policy.memberRegistrationReview)} onChange={async (v) => {
              const next = await sitesApi.saveAuthorizationPolicy(siteId, { memberRegistrationReview: v });
              setPolicy(next);
              message.success(t('已保存'));
            }} />
            <Typography.Text type="secondary">{t('关闭时注册成功即自动登录。打开后会员需在会员列表通过审核，才能登录。')}</Typography.Text>
          </Space>
          <Space>
            <span>{t('访问引导')}</span>
            <Switch checked={guidanceEnabled} onChange={async (v) => {
              const next = await sitesApi.saveAccessGuidance(siteId, v);
              setGuidanceEnabled(next.enabled);
              message.success(t('已保存'));
            }} />
            <Typography.Text type="secondary">{t('关闭时无权访问仍返回 404。打开后，已登录用户看到 403，未登录访问会员内容时跳到登录页。')}</Typography.Text>
          </Space>
          <Typography.Title level={5}>{t('访问拒绝')}</Typography.Title>
          <Select
            allowClear
            placeholder={t('全部拒绝事件')}
            style={{ width: 240, marginBottom: 12 }}
            value={denialAction}
            onChange={(value) => { setDenialAction(value); setDenialPage(0); }}
            options={[
              { value: 'PAGE_ACCESS_DENIED', label: t('页面拒绝') },
              { value: 'MEDIA_PLAY_DENIED', label: t('播放拒绝') },
              { value: 'MEDIA_DOWNLOAD_DENIED', label: t('下载拒绝') },
            ]}
          />
          <Table
            rowKey="id"
            size="small"
            dataSource={denials}
            pagination={{
              pageSize: 10,
              total: denialTotal,
              current: denialPage + 1,
              showSizeChanger: false,
              onChange: (p) => setDenialPage(p - 1),
            }}
            columns={[
              { title: t('时间'), dataIndex: 'occurredAt', width: 170, render: (v: string) => formatDateTime(v) },
              { title: t('类型'), dataIndex: 'action', width: 200 },
              { title: t('调用方'), dataIndex: 'actor', width: 160 },
              { title: t('对象'), dataIndex: 'objectId', ellipsis: true },
              { title: t('详情'), dataIndex: 'detail', ellipsis: true },
            ]}
          />
        </>
      )}
    </Space>
  );

  const items = [
    {
      key: 'org',
      label: <span><SettingOutlined /> {t('组织设置')}</span>,
      children: sysAdmin ? orgForm : <Alert type="warning" showIcon message={t('仅系统管理员可访问')} />,
    },
    {
      key: 'policy',
      label: <span><SafetyOutlined /> {t('站点策略')}</span>,
      children: siteAdmin ? policyForm : <Alert type="warning" showIcon message={t('仅站点管理员可访问')} />,
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(k) => setTab(k as TabKey)}
      items={items}
      destroyInactiveTabPane={false}
    />
  );
}
