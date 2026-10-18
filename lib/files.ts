// The original receipt file (photo or PDF), kept next to the receipt (receipts.file_path).
// - BONNETJE_DB=memory → a temp folder that lives as long as the process (tests)
// - SUPABASE_URL set   → Supabase Storage, bucket "receipts"
// - otherwise          → .data/receipts on disk (local development)
// file_path holds only the key "<uuid>.<ext>"; the store decides where it lives.
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReceiptMediaType } from "./extract/reader";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SUPABASE_BUCKET = "receipts";

const EXT: Record<ReceiptMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const BY_EXT = Object.fromEntries(Object.entries(EXT).map(([type, ext]) => [ext, type])) as Record<string, ReceiptMediaType>;

/**
 * The file's real type from its first bytes, whatever the browser claimed.
 * HEIC is not on the list: the Claude API can't read it, so the app converts photos to
 * JPEG in the browser before uploading.
 */
export function sniffMediaType(bytes: Uint8Array): ReceiptMediaType | null {
  const at = (i: number, s: string) => [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(0, "%PDF-")) return "application/pdf";
  return null;
}

export type StoredFile = { bytes: Uint8Array; mediaType: ReceiptMediaType };

export type FileStore = {
  /** Store a file and return its key for receipts.file_path. */
  save(bytes: Uint8Array, mediaType: ReceiptMediaType): Promise<string>;
  /** The file for a key, or null when it isn't there. */
  load(key: string): Promise<StoredFile | null>;
};

const KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

function newKey(mediaType: ReceiptMediaType): string {
  return `${randomUUID()}.${EXT[mediaType]}`;
}

function typeOfKey(key: string): ReceiptMediaType | null {
  const m = KEY.exec(key);
  return m ? BY_EXT[m[1]] : null;
}

export function localFileStore(dir: string): FileStore {
  return {
    async save(bytes, mediaType) {
      const key = newKey(mediaType);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, key), bytes);
      return key;
    },
    async load(key) {
      const mediaType = typeOfKey(key);
      if (!mediaType) return null;
      try {
        return { bytes: new Uint8Array(await readFile(join(dir, key))), mediaType };
      } catch {
        return null;
      }
    },
  };
}

export function supabaseFileStore(opts: { url: string; key: string; fetch?: typeof fetch }): FileStore {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.url.replace(/\/$/, "")}/storage/v1/object/${SUPABASE_BUCKET}`;
  const auth = { Authorization: `Bearer ${opts.key}`, apikey: opts.key };
  return {
    async save(bytes, mediaType) {
      const key = newKey(mediaType);
      const res = await doFetch(`${base}/${key}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": mediaType, "x-upsert": "false" },
        body: Buffer.from(bytes),
      });
      if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
      return key;
    },
    async load(key) {
      const mediaType = typeOfKey(key);
      if (!mediaType) return null;
      const res = await doFetch(`${base}/${key}`, { headers: auth });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Supabase Storage download failed: ${res.status}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), mediaType };
    },
  };
}

// One store per server process, like the database.
const g = globalThis as unknown as { __bonnetjeFiles?: FileStore };

export function getFileStore(): FileStore {
  if (!g.__bonnetjeFiles) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (process.env.BONNETJE_DB === "memory") {
      g.__bonnetjeFiles = localFileStore(mkdtempSync(join(tmpdir(), "bonnetje-receipts-")));
    } else if (supabaseUrl && supabaseKey) {
      g.__bonnetjeFiles = supabaseFileStore({ url: supabaseUrl, key: supabaseKey });
    } else {
      g.__bonnetjeFiles = localFileStore(join(process.cwd(), ".data", "receipts"));
    }
  }
  return g.__bonnetjeFiles;
}
