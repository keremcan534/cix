// Live mode (lib/live): the profile screen (kullanici/[id]) on the server.
// - Followers, following and the follow state come from GET /api/user, for my own profile too.
// - My edits go to PATCH /api/me; the screen shows them (and says "kaydedildi") only after the server took them.
// - A new profile photo goes straight to the storage (POST /api/media/upload-url, then PUT), then its address to
//   PATCH /api/me, so other phones see it. An album photo the same way, then POST /api/me/photos.
// - Someone's levels, friends, received gifts, staff role, extras and album come with GET /api/user; their Vitrin
//   with GET /api/user/showcase; my extras go to PATCH /api/me/extras (server/api/profiles.mjs, lib/profile-more).
// Ids here are server ids (lib/live toServer). Only lib/api is used, so the unit tests can run this under Node
// (tests/live-profile.test.ts). Without a server address the screen never calls it.
import { useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { putServerUser, type User } from '@/data/mock';
import { putLevels } from '@/lib/live/levels';
import { extrasPatch, showcaseView, type ExtrasDraft, type ShowcaseView } from '@/lib/profile-more';

// Someone's agency and family as their profile last answered, by server id (the profile pills and sections).
const ties = new Map<string, api.ProfileTies>();
const tieListeners = new Set<() => void>();
export function putTies(serverId: string, t: api.ProfileTies) {
  ties.set(serverId, { agency: t.agency, family: t.family });
  tieListeners.forEach((l) => l());
}
const subscribeTies = (l: () => void) => {
  tieListeners.add(l);
  return () => void tieListeners.delete(l);
};
/** Their agency and family; undefined until their profile was read. */
export const tiesOf = (serverId: string | null) => (serverId ? ties.get(serverId) : undefined);
export const useTies = (serverId: string | null) => useSyncExternalStore(subscribeTies, () => tiesOf(serverId), () => tiesOf(serverId));

/**
 * `blockedByMe`: whether the server already has my block, so a read sent right after a block can be told apart.
 * The rest (levels, friends, received gifts, staff role, extras, album) is missing from an older server.
 */
export type SocialCounts = { followers: number; following: number; isFollowing: boolean; blockedByMe: boolean } & Partial<api.ProfileMore>;

/** My profile as the server keeps it. Empty fields stay empty, so no demo value (a handle, a city) survives. */
export function meFromServer(u: api.ServerMe): Partial<User> {
  return {
    name: u.name,
    bio: u.bio ?? '',
    interests: u.interests ?? [],
    city: u.city ?? '',
    username: u.username ?? '',
    gender: u.gender ?? undefined,
    // "Gizli": I still see my gender, marked as hidden from others.
    showGender: u.genderHidden !== true,
    ...(typeof u.age === 'number' && { age: u.age }),
    ...(u.avatarUrl && { avatar: u.avatarUrl }),
    ...(u.createdAt && { joinedAt: u.createdAt.slice(0, 10) }),
  };
}

/** GET /api/me: my profile for the screen and the edit form. */
export async function loadMe(): Promise<Partial<User>> {
  const r = await api.apiRequest<{ user: api.ServerMe }>('GET', '/api/me');
  return meFromServer(r.user);
}

/**
 * Someone's public profile with their counts. Another person's age, city and interests also update what this
 * phone knows about them (data/mock); `mine`: my own profile, of which only the counts are used. `visit`: opened
 * on the profile screen, so it counts as a visit (their Profil ziyaretçileri).
 */
export async function loadPublicProfile(serverId: string, mine = false, visit = false): Promise<SocialCounts> {
  const p = await api.userProfile(serverId, visit && !mine);
  putTies(serverId, p);
  putLevels(serverId, p.levels);
  if (!mine) {
    putServerUser({
      id: p.id,
      name: p.name,
      // No age on the server stays unknown (0), never a made-up number.
      ...(p.age ? { age: p.age } : {}),
      city: p.city ?? '',
      bio: p.bio,
      interests: p.interests,
      // A gender they hide comes as none: one known from before goes too (an older server sends none of the extras).
      ...(p.extras ? { gender: p.gender ?? undefined, country: p.extras.country ?? undefined } : p.gender ? { gender: p.gender } : {}),
      ...(p.username && { username: p.username }),
      ...(p.avatarUrl && { avatar: p.avatarUrl }),
    });
  }
  return {
    followers: p.followers,
    following: p.following,
    isFollowing: p.isFollowing,
    blockedByMe: !!p.blockedByMe,
    ...(p.levels && { levels: p.levels }),
    ...(typeof p.friends === 'number' && { friends: p.friends }),
    ...(typeof p.giftsReceived === 'number' && { giftsReceived: p.giftsReceived }),
    ...(p.staff !== undefined && { staff: p.staff }),
    ...(p.extras && { extras: p.extras }),
    ...(p.photos && { photos: p.photos }),
    ...(p.levelsHidden && { levelsHidden: p.levelsHidden }),
  };
}

/** Their Vitrin (gift wall, rides, entry effects, medals, titles) as the server has it, in the app's names. */
export const loadShowcase = async (serverId: string): Promise<ShowcaseView> => showcaseView(await api.showcase(serverId));

/** Saves my extras, the country and whether my gender is hidden; the answer is what the server now keeps. */
export const saveMyExtras = (d: ExtrasDraft, country: string | null, genderHidden: boolean) => api.saveExtras(extrasPatch(d, country, genderHidden));

/** A new album photo: made smaller and put in the storage (uploadPhoto), then added to my album; resolves with it. */
export async function addAlbumPhoto(img: PickedImage): Promise<api.AlbumPhoto[]> {
  return api.addAlbumPhoto(await uploadPhoto('album', img));
}
export const removeAlbumPhoto = (id: number) => api.removeAlbumPhoto(id);

/** Follow or unfollow on the server; the answer is the server's follow state. */
export const followOnServer = (serverId: string, on: boolean) => api.follow(serverId, on);

/** What the edit form sends. The birth date only when it was never set (the server takes it once). */
export type ProfileEdit = { name: string; username: string; bio: string; city: string; interests: string[]; gender?: 'Kadın' | 'Erkek'; birthDate?: string };

/** The PATCH /api/me body: trimmed, without an empty username (none chosen yet) or a birth date not entered. */
export function profilePatch(e: ProfileEdit): api.ProfilePatch & { username?: string } {
  const username = e.username.trim().toLowerCase();
  return {
    name: e.name.trim(),
    ...(username && { username }),
    bio: e.bio.trim(),
    city: e.city.trim(),
    interests: [...new Set(e.interests)],
    ...(e.gender && { gender: e.gender }),
    ...(e.birthDate && { birthDate: e.birthDate }),
  };
}

/** Saves my edit; the answer is my profile as the server now has it. A refusal (a taken username…) throws. */
export async function saveMyProfile(e: ProfileEdit): Promise<Partial<User>> {
  return meFromServer(await api.updateProfile(profilePatch(e)));
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
/** The photo's type: the picker's, else the file's, else from the file name (JPEG when nothing says). */
export function imageType(uri: string, picked?: string | null, file?: string) {
  if (picked) return picked;
  if (file) return file;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'image/jpeg';
}

/** A photo the picker returned (expo-image-picker asset). */
export type PickedImage = { uri: string; mimeType?: string | null; width?: number; height?: number };

type PhotoKind = 'avatar' | 'moment' | 'dm' | 'album' | 'notice' | 'ticket';
/**
 * How big a photo is kept, by use: its longest side in pixels and the JPEG quality. A phone photo (about 4000 px,
 * 3–8 MB) becomes 150–300 KB at 1280 px and looks the same on a phone screen, so the storage holds 10–20 times
 * more photos. Saving it again also drops the file's hidden details (where and on which phone it was taken).
 */
export const PHOTO_KEEP: Record<PhotoKind, { side: number; quality: number }> = {
  avatar: { side: 640, quality: 0.8 },
  moment: { side: 1280, quality: 0.75 },
  dm: { side: 1280, quality: 0.75 },
  album: { side: 1280, quality: 0.75 },
  notice: { side: 1600, quality: 0.8 },
  // A support ticket's evidence (a screenshot): its small print must stay readable.
  ticket: { side: 1600, quality: 0.8 },
};

/** The resize that brings a `width`×`height` photo down to `side` on its longest side, or null when it fits. */
export function shrinkSize(width: number, height: number, side: number): { width: number } | { height: number } | null {
  if (!(width > 0 && height > 0) || Math.max(width, height) <= side) return null;
  return width >= height ? { width: side } : { height: side };
}

/** The picked photo made smaller (a JPEG within PHOTO_KEEP[kind]); the photo as picked when this phone can't
 *  (the upload then still goes, within the server's size cap). */
async function shrinkPhoto(kind: PhotoKind, img: PickedImage): Promise<PickedImage> {
  const keep = PHOTO_KEEP[kind];
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    // The picker's size saves reading a big photo twice; without it the photo is read once to learn its size.
    const known = shrinkSize(img.width ?? 0, img.height ?? 0, keep.side);
    let ref = await (known ? ImageManipulator.manipulate(img.uri).resize(known) : ImageManipulator.manipulate(img.uri)).renderAsync();
    const size = known ? null : shrinkSize(ref.width, ref.height, keep.side);
    if (size) ref = await ImageManipulator.manipulate(img.uri).resize(size).renderAsync();
    const out = await ref.saveAsync({ compress: keep.quality, format: SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch {
    return img;
  }
}

/**
 * A new profile photo: a signed upload address for its exact type and size, the file PUT there, then its public
 * address saved as my avatar. Resolves with my profile as the server now has it; any step failing throws (and
 * nothing is saved), e.g. 503 while photo storage isn't set up on the server.
 */
export async function uploadAvatar(img: PickedImage): Promise<Partial<User>> {
  return meFromServer(await api.updateProfile({ avatarUrl: await uploadPhoto('avatar', img) }));
}

/** The picked photo, made smaller first (shrinkPhoto), put in the app's storage for `kind` (an upload address for
 *  its type and size, then its bytes PUT there); resolves with its public address. Throws when a step fails, e.g. 503 while
 *  storage isn't set up. */
export async function uploadPhoto(kind: PhotoKind, picked: PickedImage): Promise<string> {
  const img = await shrinkPhoto(kind, picked);
  let file: { data: ArrayBuffer; type: string };
  try {
    file = await api.readFile(img.uri);
  } catch {
    throw new Error('Fotoğraf okunamadı. Başka bir fotoğraf seç.');
  }
  const target = await api.uploadUrl(kind, imageType(img.uri, img.mimeType, file.type), file.data.byteLength);
  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: target.method ?? 'PUT', headers: target.headers, body: file.data });
  } catch {
    throw new Error('Fotoğraf yüklenemedi. İnternetini kontrol edip tekrar dene.');
  }
  if (!res.ok) throw new Error(`Fotoğraf yüklenemedi (${await api.storageRefusal(res)}). Tekrar dene.`);
  return target.publicUrl;
}
