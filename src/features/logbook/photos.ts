// Target photo helpers (browser only): downscale to JPEG before storing, object-URL hook for display.
import { useEffect, useState } from 'react';

type Drawable = ImageBitmap | HTMLImageElement;

async function loadDrawable(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read photo')); img.src = url; });
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/** Resize so the long edge is at most `maxEdge` px and encode as JPEG. */
export async function downscaleImage(file: Blob, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  const src = await loadDrawable(file);
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
  if (!w0 || !h0) throw new Error('Could not read photo');
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src) src.close();
  return new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not encode photo'))), 'image/jpeg', quality));
}

/** Object URL for a blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); };
  }, [blob]);
  return url;
}
