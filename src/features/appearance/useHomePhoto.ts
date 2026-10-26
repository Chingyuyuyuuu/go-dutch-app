import { useEffect, useState } from 'react';

import { useAppData } from '@/data/AppDataProvider';

/** A URL for an image source: the home photo (signed URL for accounts, the saved file in the demo). */
export function usePhotoUrl(photo: string | null): string | null {
  const { repo } = useAppData();
  const [state, setState] = useState<{ photo: string | null; url: string | null }>({
    photo: null,
    url: null,
  });
  useEffect(() => {
    if (!repo || !photo) return;
    let cancelled = false;
    void repo.homePhotoUrl(photo).then((url) => {
      if (!cancelled) setState({ photo, url });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, photo]);
  return photo && state.photo === photo ? state.url : null;
}

/** The washed-out look of the home photo (saturate .6, contrast .85, brightness 1.1). */
export const WASHED = 'saturate(0.6) contrast(0.85) brightness(1.1)';
