export type PickedPhoto = { uri: string; mimeType: string };

/**
 * Phones: the picker already returns a compressed JPEG file, used as is.
 * (The web version scales the photo down in a canvas.)
 */
export async function shrinkPhoto(photo: PickedPhoto): Promise<PickedPhoto> {
  return photo;
}
