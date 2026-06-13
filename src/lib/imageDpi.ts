// Utilities for embedding physical print resolution (DPI) into exported image files.
//
// Browser <canvas> exports (toDataURL/toBlob) never write DPI metadata, so print
// software like CorelDRAW / Photoshop assumes a default (usually 72 or 96 DPI) and
// places the image far larger than intended. These helpers patch the raw file bytes
// so a cropped "1.2 x 1.5 inch" image actually lands at 1.2 x 1.5 inches on the page.

export type RawImage = { bytes: Uint8Array; mime: string };

/** Decode a `data:` URL into its raw bytes + mime type. */
export function dataUrlToBytes(dataUrl: string): RawImage {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const semi = meta.indexOf(";");
  const mime = meta.slice(5, semi === -1 ? undefined : semi) || "image/png";
  return { bytes, mime };
}

// CRC-32 (used by PNG chunks). Computed on demand; small lookup avoids a big static table.
function crc32(buf: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const INCH_PER_METRE = 0.0254;

/**
 * Insert (or rely on) a pHYs chunk so the PNG declares physical pixel density.
 * pHYs stores pixels-per-metre, so DPI is converted via 1 inch = 0.0254 m.
 */
export function setPngDpi(bytes: Uint8Array, dpiX: number, dpiY: number): Uint8Array {
  const ppmX = Math.round(dpiX / INCH_PER_METRE);
  const ppmY = Math.round(dpiY / INCH_PER_METRE);

  // pHYs chunk = length(4) + type(4) + data(9) + crc(4)
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); // data length
  chunk[4] = 0x70; // p
  chunk[5] = 0x48; // H
  chunk[6] = 0x59; // Y
  chunk[7] = 0x73; // s
  dv.setUint32(8, ppmX);
  dv.setUint32(12, ppmY);
  chunk[16] = 1; // unit specifier: 1 = metre
  dv.setUint32(17, crc32(chunk, 4, 17));

  // PNG signature is 8 bytes; the first chunk is always IHDR. Insert pHYs right after it.
  const sig = 8;
  if (
    bytes.length < sig + 8 ||
    bytes[sig + 4] !== 0x49 || // I
    bytes[sig + 5] !== 0x48 || // H
    bytes[sig + 6] !== 0x44 || // D
    bytes[sig + 7] !== 0x52 // R
  ) {
    return bytes; // not a standard PNG; leave untouched
  }
  const ihdrLen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(sig);
  const insertAt = sig + 4 + 4 + ihdrLen + 4; // len + type + data + crc

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(bytes.subarray(insertAt), insertAt + chunk.length);
  return out;
}

/**
 * Patch the JFIF APP0 segment so the JPEG declares its density in dots-per-inch.
 * Canvas JPEGs include a JFIF header but with density unit 0 (aspect only).
 */
export function setJpegDpi(bytes: Uint8Array, dpiX: number, dpiY: number): Uint8Array {
  // SOI (FFD8) then APP0 (FFE0) "JFIF\0"
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  if (bytes[2] !== 0xff || bytes[3] !== 0xe0) return bytes;
  const isJfif =
    bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46;
  if (!isJfif) return bytes;

  bytes[13] = 1; // units: 1 = dots per inch
  bytes[14] = (dpiX >> 8) & 0xff;
  bytes[15] = dpiX & 0xff;
  bytes[16] = (dpiY >> 8) & 0xff;
  bytes[17] = dpiY & 0xff;
  return bytes;
}

/**
 * Take a canvas data URL and return a Blob whose bytes embed the requested DPI.
 * Falls back to the unmodified bytes for unrecognised formats.
 */
export function dataUrlWithDpi(dataUrl: string, dpiX: number, dpiY: number): Blob {
  const { bytes, mime } = dataUrlToBytes(dataUrl);
  const patched =
    mime === "image/png"
      ? setPngDpi(bytes, dpiX, dpiY)
      : mime === "image/jpeg"
        ? setJpegDpi(bytes, dpiX, dpiY)
        : bytes;
  // Copy into a fresh ArrayBuffer so the Blob gets a clean, correctly-sized buffer.
  return new Blob([patched.slice()], { type: mime });
}
