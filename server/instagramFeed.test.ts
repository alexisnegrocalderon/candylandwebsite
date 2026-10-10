import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./instagramSend', () => ({ fetchOwnProfile: vi.fn(), fetchOwnMedia: vi.fn() }));
vi.mock('./db', () => ({ getSiteSettings: vi.fn() }));

import { getInstagramShowcase, resetInstagramShowcaseCache } from './instagramFeed';
import * as send from './instagramSend';
import * as db from './db';

const profile = vi.mocked(send.fetchOwnProfile);
const media = vi.mocked(send.fetchOwnMedia);
const settings = vi.mocked(db.getSiteSettings);
const post = (id: string) => ({ id, media_type: 'IMAGE', media_url: `https://cdn/${id}.jpg`, permalink: `https://www.instagram.com/p/${id}/` });

describe('getInstagramShowcase', () => {
  beforeEach(() => { vi.clearAllMocks(); resetInstagramShowcaseCache(); settings.mockResolvedValue({ instagramFollowers: 13000, instagramPosts: 270 } as any); });

  it('junta perfil y publicaciones y las guarda 1 hora', async () => {
    profile.mockResolvedValue({ username: 'mansionplayroom.cl', name: 'MP', bio: 'hola', followers: 13730, posts: 276, picture: 'https://cdn/p.jpg', missing: [] });
    media.mockResolvedValue([post('a'), post('b')]);
    const first = await getInstagramShowcase(0);
    expect(first.profile.followers).toBe(13730);
    expect(first.media).toHaveLength(2);
    await getInstagramShowcase(Date.now() + 1000);
    expect(media).toHaveBeenCalledTimes(1);
  });

  it('si Meta falla, usa los números guardados del footer y no rompe', async () => {
    profile.mockRejectedValue(new Error('sin token'));
    media.mockRejectedValue(new Error('sin token'));
    const r = await getInstagramShowcase();
    expect(r.profile).toMatchObject({ username: 'mansionplayroom.cl', followers: 13000, posts: 270 });
    expect(r.media).toEqual([]);
  });
});
