import type { PickedPhoto } from './shrinkPhoto';

const MAX_SIDE = 1080;

/**
 * The web picker returns a temporary blob: URL at full size. Draw it at most
 * 1080 px on a side and keep it as a JPEG data URL, so it survives a reload
 * and uploads quickly.
 */
export async function shrinkPhoto(photo: PickedPhoto): Promise<PickedPhoto> {
  const image = new Image();
  image.src = photo.uri;
  await image.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { uri: canvas.toDataURL('image/jpeg', 0.75), mimeType: 'image/jpeg' };
}
