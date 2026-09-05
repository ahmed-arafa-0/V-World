import { describe, expect, it, vi } from 'vitest';
import { getOrCreateDeviceId } from '../src/services/deviceId';

describe('getOrCreateDeviceId', () => {
  it('generates and persists a device ID in localStorage', () => {
    const id = getOrCreateDeviceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem('vw_device_id')).toBe(id);
  });

  it('returns the same ID on subsequent calls (stable across page loads)', () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it('falls back to a fresh ID without throwing when localStorage is unavailable', () => {
    const original = window.localStorage.getItem;
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => getOrCreateDeviceId()).not.toThrow();

    vi.spyOn(window.localStorage, 'getItem').mockImplementation(original);
  });
});
