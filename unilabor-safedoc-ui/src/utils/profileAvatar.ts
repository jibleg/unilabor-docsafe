const PROFILE_AVATAR_STORAGE_KEY = 'profile-avatar:v1';

const normalizeUserKey = (userKey: string): string => userKey.trim().toLowerCase();

const readAvatarMap = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, string>;
  } catch {
    return {};
  }
};

const writeAvatarMap = (value: Record<string, string>): void => {
  localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, JSON.stringify(value));
};

export const getProfileAvatar = (userKey?: string | null): string | null => {
  if (!userKey || userKey.trim().length === 0) {
    return null;
  }

  const key = normalizeUserKey(userKey);
  const avatars = readAvatarMap();
  return avatars[key] ?? null;
};

export const saveProfileAvatar = (userKey: string, dataUrl: string): void => {
  const key = normalizeUserKey(userKey);
  const avatars = readAvatarMap();
  avatars[key] = dataUrl;
  writeAvatarMap(avatars);
};

export const clearProfileAvatar = (userKey: string): void => {
  const key = normalizeUserKey(userKey);
  const avatars = readAvatarMap();
  delete avatars[key];
  writeAvatarMap(avatars);
};
