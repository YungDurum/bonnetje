// Original receipt files (photo/PDF/XML) live under .data/uploads/; the database stores the path relative to it.
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  pdf: "application/pdf",
  xml: "application/xml",
};

export function uploadsDir(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
}

/** Read a stored file; null when it is missing or the path is not a plain relative path inside uploads. */
export async function readStoredFile(
  relPath: string,
  baseDir: string = uploadsDir(),
): Promise<{ name: string; type: string; data: Uint8Array } | null> {
  if (!relPath || relPath.includes("\0") || path.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) return null;
  if (relPath.split(/[\\/]/).includes("..")) return null;
  const full = path.resolve(/*turbopackIgnore: true*/ baseDir, relPath);
  if (!full.startsWith(path.resolve(/*turbopackIgnore: true*/ baseDir) + path.sep)) return null;
  try {
    const data = await readFile(/*turbopackIgnore: true*/ full);
    const ext = path.extname(full).slice(1).toLowerCase();
    return { name: path.basename(full), type: TYPES[ext] ?? "application/octet-stream", data: new Uint8Array(data) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw e;
  }
}
