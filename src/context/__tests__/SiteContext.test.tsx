import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { Site } from '../../api/types';

// Use vi.hoisted to declare mock functions before vi.mock is hoisted
const { mockList } = vi.hoisted(() => ({
  mockList: vi.fn<() => Promise<Site[]>>(),
}));

// Mock useAuth before importing SiteContext
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ username: 'alice', loading: false }),
}));

// Mock sitesApi
vi.mock('../../api', () => ({
  sitesApi: { list: mockList },
}));

// Now import SiteContext (after mocks)
import { SiteProvider, useSite, RequireSite } from '../SiteContext';

function makeSite(id: string, name: string): Site {
  return {
    id,
    siteKey: id,
    name,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function SiteDisplay() {
  const { sites, siteId, site, loading } = useSite();
  return (
    <div>
      <span data-testid="count">{sites.length}</span>
      <span data-testid="siteId">{siteId ?? 'null'}</span>
      <span data-testid="siteName">{site?.name ?? 'null'}</span>
      <span data-testid="loading">{loading ? 'true' : 'false'}</span>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockList.mockReset();
  cleanup();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe('SiteProvider', () => {
  it('loads sites on mount when username is present', async () => {
    mockList.mockResolvedValue([makeSite('s1', 'Site A'), makeSite('s2', 'Site B')]);
    render(
      <SiteProvider>
        <SiteDisplay />
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(mockList).toHaveBeenCalledOnce();
  });

  it('auto-selects the first site when no siteId is stored', async () => {
    mockList.mockResolvedValue([makeSite('s1', 'Site A')]);
    render(
      <SiteProvider>
        <SiteDisplay />
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('siteId').textContent).toBe('s1'));
    expect(screen.getByTestId('siteName').textContent).toBe('Site A');
  });

  it('keeps stored siteId if it exists in the list', async () => {
    localStorage.setItem('powercms.siteId', 's2');
    mockList.mockResolvedValue([makeSite('s1', 'Site A'), makeSite('s2', 'Site B')]);
    render(
      <SiteProvider>
        <SiteDisplay />
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('siteId').textContent).toBe('s2'));
  });

  it('falls back to first site when stored siteId is a ghost (not in list)', async () => {
    localStorage.setItem('powercms.siteId', 'ghost');
    mockList.mockResolvedValue([makeSite('s1', 'Site A')]);
    render(
      <SiteProvider>
        <SiteDisplay />
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('siteId').textContent).toBe('s1'));
  });

  it('clears sites when api.list() fails', async () => {
    mockList.mockRejectedValue(new Error('Network Error'));
    render(
      <SiteProvider>
        <SiteDisplay />
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});

describe('RequireSite', () => {
  it('renders children when a site is selected', async () => {
    mockList.mockResolvedValue([makeSite('s1', 'Site A')]);
    render(
      <SiteProvider>
        <RequireSite>
          <span data-testid="child">Content</span>
        </RequireSite>
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('child')).toBeTruthy());
  });

  it('shows message when no site is available', async () => {
    mockList.mockResolvedValue([]);
    render(
      <SiteProvider>
        <RequireSite>
          <span data-testid="child">Content</span>
        </RequireSite>
      </SiteProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('child')).toBeNull());
  });
});
