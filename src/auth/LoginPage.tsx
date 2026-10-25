import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { organizationApi } from '../api';
import type { OrganizationSettings } from '../api/types';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useT } from '../i18n/I18nProvider';
import { parseBranding, resolveBrand, type ResolvedBrand } from '../utils/branding';

/**
 * 登录标识模式（DEF-CFG-02）。
 *
 * <p>后端 `loginIdentifier` 决定「登录时按用户名还是按邮箱解析」，登录页必须与之一致：
 * 修复前标签恒为「用户名」、且恒预填 `admin`，在 `EMAIL` 模式下这个预填值**必然登录失败**。
 *
 * <p>取值来源是公开端点 `GET /organization/settings/public/branding`，取不到时回落
 * `USERNAME` —— 与后端 `OrganizationSettingsEntity.loginIdentifier` 的默认值一致，
 * 保证「前端展示口径」与「后端裁决口径」同源。
 */
function normalizeLoginIdentifier(value: string | null | undefined): 'USERNAME' | 'EMAIL' {
  return String(value ?? '').toUpperCase() === 'EMAIL' ? 'EMAIL' : 'USERNAME';
}

export default function LoginPage() {
  const t = useT();
  const { username, loading, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [brand, setBrand] = useState<ResolvedBrand>(() => resolveBrand({}));
  const [loginIdentifier, setLoginIdentifier] = useState<'USERNAME' | 'EMAIL'>('USERNAME');

  useEffect(() => {
    // spec 12.4：登录页品牌取组织配置（公开端点，无需登录）
    organizationApi
      .branding()
      .then((s: OrganizationSettings) => {
        setBrand(resolveBrand(parseBranding(s.branding)));
        setLoginIdentifier(normalizeLoginIdentifier(s.loginIdentifier));
      })
      .catch(() => setBrand(resolveBrand({})));
  }, []);

  if (!loading && username) return <Navigate to="/dashboard" replace />;

  const primary = brand.primary;
  const emailMode = loginIdentifier === 'EMAIL';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: `linear-gradient(145deg, #0f172a 0%, ${brand.loginBackground} 50%, #0f172a 100%)`,
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 20, color: '#fff' }}>
        <LanguageSwitcher />
      </div>
      <Card style={{ width: 380, boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          PowerCMS 12
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          {t('管理端登录')}
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Form
          // 模式变化即重挂载：`initialValues` 只在挂载时生效，用 key 保证
          // 「切到 EMAIL」时不会残留为用户名预填的 admin（DEF-CFG-02）。
          key={loginIdentifier}
          layout="vertical"
          onFinish={async (values: { username: string; password: string }) => {
            setSubmitting(true);
            setError(null);
            try {
              await login(values.username, values.password);
              navigate('/dashboard', { replace: true });
            } catch (reason) {
              // FR-IAM-002：优先原样展示后端登录失败文案（剩余尝试次数 / 账号已锁定等），
              // 取不到（如网络错误）才回落通用提示。服务端文案已按 X-Language 本地化，不过 t()。
              const body = isAxiosError<{ message?: unknown }>(reason) ? reason.response?.data : undefined;
              const serverMessage = typeof body?.message === 'string' ? body.message : '';
              setError(serverMessage || t('登录失败，请检查用户名和密码'));
            } finally {
              setSubmitting(false);
            }
          }}
          initialValues={
            emailMode
              ? { password: 'Admin@123456' }
              : { username: 'admin', password: 'Admin@123456' }
          }
        >
          <Form.Item name="username" label={emailMode ? t('邮箱') : t('用户名')} rules={[{ required: true }]}>
            <Input prefix={emailMode ? <MailOutlined /> : <UserOutlined />} autoFocus />
          </Form.Item>
          <Form.Item name="password" label={t('密码')} rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={submitting}
            style={{ background: primary }}
          >
            {t('登录')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
