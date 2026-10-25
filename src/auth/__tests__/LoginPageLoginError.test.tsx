import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

/** 构造 axios 形状的拒绝原因（`isAxiosError` 以该标记识别）。 */
function axiosLikeError(message: string, status?: number) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: status === undefined ? undefined : { status, data: { message } },
  });
}

/**
 * FR-IAM-002 登录失败文案回归：登录页必须**原样展示**后端错误信息
 * （剩余尝试次数 / 账号已锁定），而不是笼统的「登录失败」；仅在拿不到
 * 响应体（如网络错误）时才回落通用提示。
 */
describe('LoginPage · 登录失败展示后端文案（FR-IAM-002）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('后端返回「还可尝试 N 次」时直接展示，不回落通用提示', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'USERNAME' });
    mocks.login.mockRejectedValue(axiosLikeError('用户名或密码错误，还可尝试 4 次', 401));

    render(<LoginPage />);
    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('用户名或密码错误，还可尝试 4 次')).toBeTruthy());
    expect(screen.queryByText('登录失败，请检查用户名和密码')).toBeNull();
  });

  it('账号被锁定时展示后端锁定文案', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'USERNAME' });
    mocks.login.mockRejectedValue(axiosLikeError('账号已被锁定，请联系管理员解锁', 401));

    render(<LoginPage />);
    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(screen.getByText('账号已被锁定，请联系管理员解锁')).toBeTruthy());
  });

  it('网络错误（无响应体）时回落通用提示', async () => {
    mocks.branding.mockResolvedValue({ loginIdentifier: 'USERNAME' });
    mocks.login.mockRejectedValue(new Error('Network Error'));

    render(<LoginPage />);
    await waitFor(() => expect(screen.getByLabelText('用户名')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(screen.getByText('登录失败，请检查用户名和密码')).toBeTruthy());
  });
});
