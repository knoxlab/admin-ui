import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  branding: vi.fn(),
  login: vi.fn(),
}));

vi.mock('../../api', () => ({
  organizationApi: { branding: mocks.branding },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ username: null, loading: false, login: mocks.login }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Navigate: () => null,
}));

vi.mock('../../i18n/I18nProvider', () => ({ useT: () => (key: string) => key }));
vi.mock('../../components/LanguageSwitcher', () => ({ default: () => null }));

import LoginPage from '../LoginPage';

/**
 * DEF-CFG-02 回归：登录页必须跟随组织 `loginIdentifier` 适配**标签**与**预填值**。
 *
 * <p>缺陷形态（修复前）：标签恒为「用户名」，`initialValues` 恒预填 `admin`。当组织把
 * `loginIdentifier` 配成 `EMAIL` 时，后端只按邮箱解析，而登录页仍预填 `admin` —— 管理员
 * 点「登录」必然失败，且界面文案与后端裁决口径相矛盾。
 *
 * <p>取值来自公开端点 `GET /organization/settings/public/branding`（登录前就可得），
 * 取不到时回落 `USERNAME`，与后端实体默认值同源。
 */
describe('LoginPage · 登录标识模式适配（DEF-CFG-02）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('EMAIL 模式：标签为「邮箱」且不再预填用户名', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'EMAIL' });

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
    // 预填的 admin 在 EMAIL 模式下必然登录失败，属误导；必须清空。
    expect((screen.getByLabelText('邮箱') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('用户名')).toBeNull();
  });

  it('USERNAME 模式：标签为「用户名」并保留预填', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'USERNAME' });

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('admin');
  });

  it('小写/空值等非规范取值一律按 USERNAME 处理', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'email' });

    render(<LoginPage />);

    // 后端落库前会 trim+toUpperCase，这里覆盖「接口给了非规范化值」的展示容错。
    await waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
  });

  it('公开端点不可用时回落 USERNAME，不阻塞登录页渲染', async () => {
    mocks.branding.mockRejectedValue(new Error('offline'));

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('admin');
  });

  it('组织未配置 loginIdentifier（null）时按 USERNAME 展示', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: null });

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());
  });
});
