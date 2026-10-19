// Original receipt files (photo/PDF/XML). The database stores a path relative to the
// uploads folder (receipts.file_path, e.g. "receipts/<uuid>.jpg"); where it lives:
// - SUPABASE_URL set   → Supabase Storage, bucket "receipts" (same relative path)
// - otherwise          → .data/uploads/ on disk
// - BONNETJE_DB=memory → a temp folder that lives as long as the process (tests)
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReceiptMediaType } from "./extract/reader";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SUPABASE_BUCKET = "receipts";

export type StoredFile = { name: string; type: string; data: Uint8Array };

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  xml: "application/xml",
};

const EXT: Record<ReceiptMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const g = globalThis as unknown as { __bonnetjeUploads?: string; __bonnetjeFiles?: FileStore };

export function uploadsDir(): string {
  if (process.env.BONNETJE_DB === "memory") {
    // one folder per server process, like the in-memory database
    g.__bonnetjeUploads ??= mkdtempSync(path.join(os.tmpdir(), "bonnetje-uploads-"));
    return g.__bonnetjeUploads;
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
}

/** A plain relative path inside the uploads folder: no absolute paths, no "..". */
function safeRelPath(relPath: string): boolean {
  if (!relPath || relPath.includes("\0") || path.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) return false;
  return !relPath.split(/[\\/]/).includes("..");
}

function typeOf(relPath: string): string {
  return TYPES[path.extname(relPath).slice(1).toLowerCase()] ?? "application/octet-stream";
}

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

export type FileStore = {
  /** Store a new upload; returns its relative path for receipts.file_path. */
  save(bytes: Uint8Array, mediaType: ReceiptMediaType): Promise<string>;
  /** The file at a relative path, or null when it is missing or the path isn't safe. */
  read(relPath: string): Promise<StoredFile | null>;
};

const newPath = (mediaType: ReceiptMediaType) => `receipts/${randomUUID()}.${EXT[mediaType]}`;

export function localFileStore(baseDir: string): FileStore {
  return {
    async save(bytes, mediaType) {
      const rel = newPath(mediaType);
      const full = path.join(/*turbopackIgnore: true*/ baseDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ full, bytes);
      return rel;
    },
    async read(relPath) {
      if (!safeRelPath(relPath)) return null;
      const full = path.resolve(/*turbopackIgnore: true*/ baseDir, relPath);
      if (!full.startsWith(path.resolve(/*turbopackIgnore: true*/ baseDir) + path.sep)) return null;
      try {
        const data = await readFile(/*turbopackIgnore: true*/ full);
        return { name: path.basename(full), type: typeOf(full), data: new Uint8Array(data) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
        throw e;
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
      const rel = newPath(mediaType);
      const res = await doFetch(`${base}/${rel}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": mediaType, "x-upsert": "false" },
        body: Buffer.from(bytes),
      });
      if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
      return rel;
    },
    async read(relPath) {
      if (!safeRelPath(relPath)) return null;
      const res = await doFetch(`${base}/${relPath.split(/[\\/]/).map(encodeURIComponent).join("/")}`, { headers: auth });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Supabase Storage download failed: ${res.status}`);
      return { name: path.basename(relPath), type: typeOf(relPath), data: new Uint8Array(await res.arrayBuffer()) };
    },
  };
}

/** The store for this server process (see the top of this file). */
export function getFileStore(): FileStore {
  if (!g.__bonnetjeFiles) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    g.__bonnetjeFiles =
      url && key && process.env.BONNETJE_DB !== "memory" ? supabaseFileStore({ url, key }) : localFileStore(uploadsDir());
  }
  return g.__bonnetjeFiles;
}

/**
 * Read a stored file; null when it is missing or the path is not a plain relative path.
 * With baseDir it reads from that folder; otherwise from this process's store.
 */
export async function readStoredFile(relPath: string, baseDir?: string): Promise<StoredFile | null> {
  return (baseDir ? localFileStore(baseDir) : getFileStore()).read(relPath);
}
