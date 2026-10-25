import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Typography, message } from 'antd';
import { authApi, usersApi } from '../api';
import type { ApiToken } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useSite } from '../context/SiteContext';
import { useT } from '../i18n/I18nProvider';
import { tokenScopeOptionGroups } from '../utils/tokenScopes';
import { formatDateTime } from '../utils/datetime';

function defaultExpiresAt() {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function ProfileTab() {
  const t = useT();
  const { username } = useAuth();
  const { site } = useSite();

  return (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label={t('当前用户')}>{username}</Descriptions.Item>
      <Descriptions.Item label={t('当前站点')}>{site ? `${site.name} (${site.siteKey})` : t('未选择')}</Descriptions.Item>
      <Descriptions.Item label={t('认证方式')}>{t('会话 Cookie（HttpOnly）')}</Descriptions.Item>
      <Descriptions.Item label={t('API 前缀')}>/api/v1（Vite 代理 → :8080）</Descriptions.Item>
    </Descriptions>
  );
}

function PasswordTab() {
  const t = useT();
  const { me } = useAuth();
  const [saving, setSaving] = useState(false);
  const [passwordForm] = Form.useForm();

  return (
    <Form
      form={passwordForm}
      layout="vertical"
      style={{ maxWidth: 420 }}
      onFinish={async (values: { currentPassword: string; newPassword: string }) => {
        if (!me?.userId) return;
        setSaving(true);
        try {
          await usersApi.changePassword(me.userId, values);
          passwordForm.resetFields();
          message.success(t('密码已更新'));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Form.Item name="currentPassword" label={t('当前密码')} rules={[{ required: true }]}>
        <Input.Password />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label={t('新密码')}
        extra={t('至少 8 位，须包含大小写字母和数字；不能与最近 3 次密码相同')}
        rules={[{ required: true, min: 8 }]}
      >
        <Input.Password />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving}>{t('保存密码')}</Button>
    </Form>
  );
}

function TokensTab() {
  const t = useT();
  const { sites } = useSite();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenForm] = Form.useForm();

  const loadTokens = async () => {
    setTokens(await authApi.tokens().catch(() => [] as ApiToken[]));
  };

  useEffect(() => { void loadTokens(); }, []);

  return (
    <>
      {createdToken && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('请立即复制 Token，明文只显示一次')}
          description={
            <Space>
              <Typography.Text code copyable>{createdToken}</Typography.Text>
            </Space>
          }
        />
      )}
      <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setCreatedToken(null); tokenForm.resetFields(); tokenForm.setFieldsValue({ expiresAt: defaultExpiresAt(), scopes: [] }); setTokenOpen(true); }}>{t('新建 Token')}</Button>
      </Space>
      <Table
        rowKey="id"
        dataSource={tokens}
        pagination={false}
        size="small"
        columns={[
          { title: t('名称'), dataIndex: 'name' },
          { title: 'Public ID', dataIndex: 'publicId', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: t('站点'), dataIndex: 'siteId', render: (id: string | null) => id ? (sites.find((s) => s.id === id)?.name || id) : t('全部') },
          { title: 'Scope', dataIndex: 'scopes', render: (scopes: string[]) => (scopes?.length ? scopes.join(', ') : t('继承角色')) },
          { title: t('过期'), dataIndex: 'expiresAt', render: (v: string) => formatDateTime(v) },
          { title: t('状态'), render: (_: unknown, row: ApiToken) => row.revokedAt ? t('已吊销') : t('有效') },
          {
            title: t('操作'),
            render: (_: unknown, row: ApiToken) => (
              <Button
                size="small"
                danger
                disabled={!!row.revokedAt}
                onClick={async () => {
                  await authApi.deleteToken(row.id);
                  message.success(t('Token 已删除'));
                  await loadTokens();
                }}
              >
                {t('删除')}
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={t('新建 API Token')}
        open={tokenOpen}
        onCancel={() => setTokenOpen(false)}
        onOk={() => tokenForm.submit()}
        destroyOnClose
      >
        <Form
          form={tokenForm}
          layout="vertical"
          onFinish={async (values: { name: string; siteId?: string; scopes?: string[]; expiresAt: string; allowedFrom?: string }) => {
            const created = await authApi.createToken({
              name: values.name,
              siteId: values.siteId || undefined,
              scopes: values.scopes,
              expiresAt: new Date(values.expiresAt).toISOString(),
              allowedFrom: values.allowedFrom || undefined,
            });
            setCreatedToken(created.token || null);
            setTokenOpen(false);
            await loadTokens();
            message.success(t('Token 已创建'));
          }}
        >
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}>
            <Input placeholder={t('CI 部署')} />
          </Form.Item>
          <Form.Item name="siteId" label={t('限制站点')}>
            <Select allowClear placeholder={t('不限制（继承本人全部站点能力）')} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="scopes" label="Scope"
            extra={t('留空表示继承本人角色能力')}>
            <Select mode="multiple" allowClear options={tokenScopeOptionGroups(t)} />
          </Form.Item>
          <Form.Item name="expiresAt" label={t('过期时间')} rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="allowedFrom" label={t('来源 CIDR')}>
            <Input placeholder={t('可空，例如 10.0.0.0/8,127.0.0.1')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      title={t('我的账户')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      <Tabs
        items={[
          { key: 'profile', label: t('我的账户'), children: <ProfileTab /> },
          { key: 'password', label: t('修改密码'), children: <PasswordTab /> },
          { key: 'tokens', label: 'API Token', children: <TokensTab /> },
        ]}
      />
    </Modal>
  );
}
