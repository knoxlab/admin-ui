import { describe, expect, it } from 'vitest';
import type { MeProfile } from '../../api/types';
import { hasCapability, isSystemAdmin } from '../AuthContext';

function makeMe(overrides: Partial<MeProfile> = {}): MeProfile {
  return {
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice',
    status: 'ACTIVE',
    kind: 'BACKEND',
    loginMode: 'BACKEND',
    organizationRoles: [],
    layouts: [],
    sites: [],
    ...overrides,
  };
}

describe('isSystemAdmin', () => {
  it('returns true when me has system-admin role', () => {
    expect(isSystemAdmin(makeMe({ organizationRoles: ['system-admin'] }))).toBe(true);
  });

  it('returns false when me has no system-admin role', () => {
    expect(isSystemAdmin(makeMe({ organizationRoles: ['editor'] }))).toBe(false);
  });

  it('returns false when me is null', () => {
    expect(isSystemAdmin(null)).toBe(false);
  });

  it('returns false when me is undefined', () => {
    expect(isSystemAdmin(undefined)).toBe(false);
  });

  it('returns false when organizationRoles is empty', () => {
    expect(isSystemAdmin(makeMe({ organizationRoles: [] }))).toBe(false);
  });
});

describe('hasCapability', () => {
  it('returns false when me is null', () => {
    expect(hasCapability(null, 'site-1', 'read')).toBe(false);
  });

  it('returns false when me is undefined', () => {
    expect(hasCapability(undefined, 'site-1', 'read')).toBe(false);
  });

  it('returns true for any capability when user is system-admin', () => {
    const me = makeMe({
      organizationRoles: ['system-admin'],
      sites: [],
    });
    expect(hasCapability(me, 'site-1', 'deploy')).toBe(true);
  });

  it('returns true when the site has the requested capability', () => {
    const me = makeMe({
      sites: [
        { siteId: 'site-1', siteKey: 's1', siteName: 'S1', roles: ['editor'], capabilities: ['read', 'write'] },
      ],
    });
    expect(hasCapability(me, 'site-1', 'read')).toBe(true);
    expect(hasCapability(me, 'site-1', 'write')).toBe(true);
  });

  it('returns false when the site does not have the requested capability', () => {
    const me = makeMe({
      sites: [
        { siteId: 'site-1', siteKey: 's1', siteName: 'S1', roles: ['viewer'], capabilities: ['read'] },
      ],
    });
    expect(hasCapability(me, 'site-1', 'deploy')).toBe(false);
  });

  it('returns false when the siteId does not match', () => {
    const me = makeMe({
      sites: [
        { siteId: 'site-1', siteKey: 's1', siteName: 'S1', roles: ['viewer'], capabilities: ['read'] },
      ],
    });
    expect(hasCapability(me, 'site-2', 'read')).toBe(false);
  });

  it('returns false when siteId is null and user is not system-admin', () => {
    const me = makeMe({
      organizationRoles: ['editor'],
      sites: [],
    });
    expect(hasCapability(me, null, 'read')).toBe(false);
  });

  it('system-admin bypasses siteId check', () => {
    const me = makeMe({
      organizationRoles: ['system-admin'],
      sites: [],
    });
    expect(hasCapability(me, null, 'read')).toBe(true);
    expect(hasCapability(me, undefined, 'write')).toBe(true);
  });
});
