import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuthDebugInfo } from './auth-debug';

/**
 * Unit tests for auth debugging utilities.
 *
 * These tests ensure that auth debug tools correctly identify
 * potential issues with session persistence.
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Mock Supabase
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: null },
          error: null,
        })
      ),
    },
  },
}));

describe('getAuthDebugInfo', () => {
  beforeEach(() => {
    // Reset localStorage before each test
    localStorageMock.clear();
    global.localStorage = localStorageMock as any;
  });

  it('should detect no session and no localStorage keys', async () => {
    const info = await getAuthDebugInfo();

    expect(info.hasSession).toBe(false);
    expect(info.userId).toBeNull();
    expect(info.userEmail).toBeNull();
    expect(info.sessionExpiresAt).toBeNull();
    expect(info.localStorageKeys).toHaveLength(0);
    expect(info.storageSize).toBe(0);
  });

  it('should detect peel-auth localStorage keys', async () => {
    localStorage.setItem('peel-auth-token', 'test-token');
    localStorage.setItem('other-key', 'other-value');

    const info = await getAuthDebugInfo();

    expect(info.localStorageKeys).toContain('peel-auth-token');
    expect(info.localStorageKeys).not.toContain('other-key');
    expect(info.localStorageKeys).toHaveLength(1);
  });

  it('should detect sb- prefixed localStorage keys', async () => {
    localStorage.setItem('sb-project-auth-token', 'test-token');

    const info = await getAuthDebugInfo();

    expect(info.localStorageKeys).toContain('sb-project-auth-token');
    expect(info.localStorageKeys).toHaveLength(1);
  });

  it('should detect supabase-related localStorage keys', async () => {
    localStorage.setItem('supabase.auth.token', 'test-token');

    const info = await getAuthDebugInfo();

    expect(info.localStorageKeys).toContain('supabase.auth.token');
    expect(info.localStorageKeys).toHaveLength(1);
  });

  it('should calculate total storage size', async () => {
    // Add some auth keys with known sizes
    localStorage.setItem('peel-auth-token', 'x'.repeat(100)); // 100 bytes
    localStorage.setItem('peel-auth-refresh', 'y'.repeat(200)); // 200 bytes

    const info = await getAuthDebugInfo();

    expect(info.storageSize).toBe(300);
  });

  it('should identify multiple auth-related keys', async () => {
    localStorage.setItem('peel-auth-token', 'test1');
    localStorage.setItem('sb-project-auth', 'test2');
    localStorage.setItem('supabase.session', 'test3');
    localStorage.setItem('non-auth-key', 'ignored');

    const info = await getAuthDebugInfo();

    expect(info.localStorageKeys).toHaveLength(3);
    expect(info.localStorageKeys).toContain('peel-auth-token');
    expect(info.localStorageKeys).toContain('sb-project-auth');
    expect(info.localStorageKeys).toContain('supabase.session');
  });
});

describe('Auth debug detection scenarios', () => {
  beforeEach(() => {
    localStorageMock.clear();
    global.localStorage = localStorageMock as any;
  });

  it('should detect corrupted session scenario (no session but has localStorage)', async () => {
    // This is the bug scenario: no valid session but localStorage has data
    localStorage.setItem('peel-auth-token', 'corrupted-or-expired-token');

    const info = await getAuthDebugInfo();

    // No session but has auth keys = potential corruption
    expect(info.hasSession).toBe(false);
    expect(info.localStorageKeys.length).toBeGreaterThan(0);
  });
});
