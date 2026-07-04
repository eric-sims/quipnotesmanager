import { describe, it, expect, afterEach, vi } from 'vitest';
import { joinUrl } from './joinUrl.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('joinUrl', () => {
  it('falls back to the production default when VITE_CLIENT_URL is unset', () => {
    vi.stubEnv('VITE_CLIENT_URL', '');
    expect(joinUrl('1234')).toBe('https://play.rotcev.com/?code=1234');
  });

  it('uses the configured client URL and trims a trailing slash', () => {
    vi.stubEnv('VITE_CLIENT_URL', 'https://play.rotcev.com/');
    expect(joinUrl('1234')).toBe('https://play.rotcev.com/?code=1234');
  });

  it('url-encodes the code', () => {
    vi.stubEnv('VITE_CLIENT_URL', 'https://play.rotcev.com');
    expect(joinUrl('12 4')).toBe('https://play.rotcev.com/?code=12%204');
  });
});
