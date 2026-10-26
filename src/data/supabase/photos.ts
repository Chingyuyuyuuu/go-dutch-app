import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'home-photos';
/** Signed URLs are made per session and cached; a week is plenty. */
const URL_SECONDS = 7 * 24 * 60 * 60;

/** Home photos in the private "home-photos" bucket, in the user's own folder (see the Phase 5 migration). */
export type MediaStore = {
  upload(uri: string, mimeType: string): Promise<string>;
  url(path: string): Promise<string>;
  remove(path: string): Promise<void>;
};

export function supabaseMedia(sb: SupabaseClient, uid: string, newId: () => string): MediaStore {
  return {
    async upload(uri, mimeType) {
      const body = await (await fetch(uri)).arrayBuffer();
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const path = `${uid}/home-${newId()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, body, { contentType: mimeType });
      if (error) throw error;
      return path;
    },
    async url(path) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
    async remove(path) {
      await sb.storage.from(BUCKET).remove([path]);
    },
  };
}
