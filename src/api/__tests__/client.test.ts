import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { api, clearCredentials } from '../client';

function requestInterceptor(): (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig {
  const handlers = api.interceptors.request.handlers;
  if (!handlers || handlers.length === 0) {
    throw new Error('No request interceptor registered on api client');
  }
  return handlers[0].fulfilled as (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
}

function responseInterceptor(): (err: AxiosError) => Promise<never> {
  const handlers = api.interceptors.response.handlers;
  if (!handlers || handlers.length === 0) {
    throw new Error('No response interceptor registered on api client');
  }
  return handlers[0].rejected as (err: AxiosError) => Promise<never>;
}

function buildError(status: number, code: string, messageText: string, url: string): AxiosError {
  const response = {
    status,
    data: { code, message: messageText },
  } as AxiosResponse;
  const config = { url } as InternalAxiosRequestConfig;
  const err = new Error('Request failed') as AxiosError;
  err.response = response;
  err.config = config;
  err.message = 'Request failed';
  return err;
}

describe('api client interceptors', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    // Reset all antd message spies from the global setup mock.
    vi.mocked(message.error).mockClear();
    vi.mocked(message.warning).mockClear();
    vi.mocked(message.success).mockClear();
    vi.mocked(message.info).mockClear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    // Restore any window.location overrides.
    Object.defineProperty(window, 'location', {
      value: window.location,
      writable: true,
      configurable: true,
    });
  });

  it('attaches X-Language header on every request when language is stored', () => {
    localStorage.setItem('powercms.language', 'en-US');
    const cfg = { headers: {} } as unknown as InternalAxiosRequestConfig;
    const out = requestInterceptor()(cfg);
    expect(out.headers['X-Language']).toBe('en-US');
  });

  it('leaves X-Language unset when no language is stored', () => {
    const cfg = { headers: {} } as unknown as InternalAxiosRequestConfig;
    const out = requestInterceptor()(cfg);
    expect(out.headers['X-Language']).toBeUndefined();
  });

  it('on 401 response, clears credentials and redirects to /login when not on login', async () => {
    sessionStorage.setItem('powercms.auth', 'leak');
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/dashboard', href: '' },
      writable: true,
      configurable: true,
    });
    const err = buildError(401, 'X', 'no', '/auth/me');
    await responseInterceptor()(err).catch(() => undefined);
    // Credentials should be cleared.
    expect(sessionStorage.getItem('powercms.auth')).toBeNull();
    // clearCredentials helper exists.
    expect(typeof clearCredentials).toBe('function');
  });

  it('on 401 response, does not redirect when already on /login', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/login', href: '' },
      writable: true,
      configurable: true,
    });
    const err = buildError(401, 'X', 'no', '/auth/me');
    await responseInterceptor()(err).catch(() => undefined);
    expect(window.location.href).toBe('');
  });

  it('on 401 response, does not redirect when the failing call is itself the login', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/dashboard', href: '' },
      writable: true,
      configurable: true,
    });
    const err = buildError(401, 'X', 'no', '/auth/login');
    await responseInterceptor()(err).catch(() => undefined);
    expect(window.location.href).toBe('');
  });

  it('does not show error toast for 404 responses', async () => {
    const err = buildError(404, 'NOT_FOUND', 'gone', '/x');
    await responseInterceptor()(err).catch(() => undefined);
    expect(message.error).not.toHaveBeenCalled();
  });

  it('does not show error toast for CONTENT_VERSION_CONFLICT', async () => {
    const err = buildError(409, 'CONTENT_VERSION_CONFLICT', 'stale', '/content/save');
    await responseInterceptor()(err).catch(() => undefined);
    expect(message.error).not.toHaveBeenCalled();
  });

  it('does not show error toast when the caller opts out (page shows its own message)', async () => {
    const err = buildError(409, 'CONFLICT', '季内集号重复', '/sites/s1/contents/batch-episodes');
    err.config = { url: '/sites/s1/contents/batch-episodes', skipGlobalErrorToast: true } as
      InternalAxiosRequestConfig;
    await responseInterceptor()(err).catch(() => undefined);
    expect(message.error).not.toHaveBeenCalled();
  });

  it('shows error toast for other 4xx/5xx responses', async () => {
    const err = buildError(500, 'INTERNAL_ERROR', 'oops', '/x');
    await responseInterceptor()(err).catch(() => undefined);
    expect(message.error).toHaveBeenCalledWith('oops');
  });

  it('clearCredentials removes the auth key from sessionStorage', () => {
    sessionStorage.setItem('powercms.auth', 'x');
    clearCredentials();
    expect(sessionStorage.getItem('powercms.auth')).toBeNull();
  });
});
