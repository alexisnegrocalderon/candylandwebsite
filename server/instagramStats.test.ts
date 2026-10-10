import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./instagramSend', () => ({ fetchOwnProfile: vi.fn() }));
vi.mock('./db', () => ({ updateSiteSettings: vi.fn() }));

import { syncInstagramStats } from './instagramStats';
import * as send from './instagramSend';
import * as db from './db';

const fetchOwnProfile = vi.mocked(send.fetchOwnProfile);
const updateSiteSettings = vi.mocked(db.updateSiteSettings);

describe('syncInstagramStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('guarda seguidores y publicaciones que entrega Meta', async () => {
    fetchOwnProfile.mockResolvedValueOnce({ followers: 13730, posts: 276, missing: [] });
    await expect(syncInstagramStats()).resolves.toEqual({ followers: 13730, posts: 276 });
    expect(updateSiteSettings).toHaveBeenCalledWith({ instagramFollowers: 13730, instagramPosts: 276 });
  });

  it('nunca pisa un número bueno con 0 ni con un dato que no vino', async () => {
    fetchOwnProfile.mockResolvedValueOnce({ followers: 0, posts: 276, missing: [] });
    await expect(syncInstagramStats()).rejects.toThrow(/mantiene el número anterior/i);
    fetchOwnProfile.mockResolvedValueOnce({ missing: [] });
    await expect(syncInstagramStats()).rejects.toThrow();
    expect(updateSiteSettings).not.toHaveBeenCalled();
  });

  it('si no vienen las publicaciones, actualiza solo los seguidores', async () => {
    fetchOwnProfile.mockResolvedValueOnce({ followers: 14000, missing: [] });
    await syncInstagramStats();
    expect(updateSiteSettings).toHaveBeenCalledWith({ instagramFollowers: 14000 });
  });

  it('si Meta rechaza todo, el error sube y no se escribe nada', async () => {
    fetchOwnProfile.mockRejectedValueOnce(new Error('Meta no entregó el perfil'));
    await expect(syncInstagramStats()).rejects.toThrow('Meta no entregó el perfil');
    expect(updateSiteSettings).not.toHaveBeenCalled();
  });
});
