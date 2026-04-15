import { useEffect, useRef, useState } from 'react';
import { getMyAvatarBlob } from '../api/service';
import { useAuthStore } from '../store/useAuthStore';

export const useUserAvatar = () => {
  const avatarPath = useAuthStore((state) => state.user?.avatar_path);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const updateAvatarUrl = (nextUrl: string | null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (nextUrl) {
      objectUrlRef.current = nextUrl;
    }

    setAvatarUrl(nextUrl);
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadAvatar = async () => {
      if (!avatarPath) {
        updateAvatarUrl(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const blob = await getMyAvatarBlob();
        const nextObjectUrl = URL.createObjectURL(blob);

        if (isCancelled) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }

        updateAvatarUrl(nextObjectUrl);
      } catch {
        if (!isCancelled) {
          updateAvatarUrl(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadAvatar();

    return () => {
      isCancelled = true;
    };
  }, [avatarPath]);

  return { avatarUrl, loading };
};
