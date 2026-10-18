// Photos are made smaller in the browser before upload: phone photos are 4000+ px and
// several MB, the reader needs about 2000 px. It also turns HEIC (iPhone) into JPEG,
// where the browser can open HEIC.

export const MAX_PHOTO_SIDE = 2000;

/** Size that fits within maxSide on its longest side, never enlarged. */
export function fitWithin(width: number, height: number, maxSide = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Browser only: a JPEG of the photo, at most maxSide px on its longest side. */
export async function photoToJpeg(file: Blob, maxSide = MAX_PHOTO_SIDE, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make a JPEG"))), "image/jpeg", quality),
  );
}
