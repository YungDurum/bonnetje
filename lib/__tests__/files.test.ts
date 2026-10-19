import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localFileStore, readStoredFile, sniffMediaType, supabaseFileStore } from "../files";

const enc = (s: string) => new TextEncoder().encode(s);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("readStoredFile", () => {
  it("reads a stored file and derives the type from the extension", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "uploads-"));
    await mkdir(path.join(dir, "2026"));
    await writeFile(path.join(dir, "2026", "bon.PDF"), "pdf!");
    await writeFile(path.join(dir, "a.jpg"), "x");
    await writeFile(path.join(dir, "b.heic"), "x");
    await writeFile(path.join(dir, "c.xml"), "<x/>");
    const f = await readStoredFile("2026/bon.PDF", dir);
    expect(f?.name).toBe("bon.PDF");
    expect(f?.type).toBe("application/pdf");
    expect(Buffer.from(f!.data).toString()).toBe("pdf!");
    expect((await readStoredFile("a.jpg", dir))?.type).toBe("image/jpeg");
    expect((await readStoredFile("b.heic", dir))?.type).toBe("image/heic");
    expect((await readStoredFile("c.xml", dir))?.type).toBe("application/xml");
  });
  it("returns null for a missing file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "uploads-"));
    expect(await readStoredFile("nope.pdf", dir)).toBeNull();
  });
  it("rejects absolute paths and ..", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "uploads-"));
    await writeFile(path.join(dir, "ok.png"), "x");
    expect(await readStoredFile(path.join(dir, "ok.png"), dir)).toBeNull();
    expect(await readStoredFile("../ok.png", dir)).toBeNull();
    expect(await readStoredFile("a/../ok.png", dir)).toBeNull();
    expect(await readStoredFile("", dir)).toBeNull();
  });
});

describe("sniffMediaType", () => {
  it("knows the file from its first bytes", () => {
    expect(sniffMediaType(JPEG)).toBe("image/jpeg");
    expect(sniffMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    expect(sniffMediaType(enc("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffMediaType(enc("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("rejects HEIC and anything else", () => {
    expect(sniffMediaType(enc("\0\0\0\x18ftypheic"))).toBeNull();
    expect(sniffMediaType(enc("<html>"))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
  });
});

describe("localFileStore", () => {
  it("saves under receipts/ with a relative path that readStoredFile can read", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "uploads-"));
    const rel = await localFileStore(dir).save(JPEG, "image/jpeg");
    expect(rel).toMatch(/^receipts\/[0-9a-f-]{36}\.jpg$/);
    expect(await readStoredFile(rel, dir)).toEqual({ name: path.basename(rel), type: "image/jpeg", data: JPEG });
  });
});

describe("supabaseFileStore", () => {
  it("uploads to and downloads from the receipts bucket", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === "POST" ? new Response("{}") : new Response(JPEG);
    }) as typeof fetch;
    const store = supabaseFileStore({ url: "https://x.supabase.co/", key: "secret", fetch: fakeFetch });

    const rel = await store.save(JPEG, "image/jpeg");
    expect(rel).toMatch(/^receipts\/[0-9a-f-]{36}\.jpg$/);
    expect(calls[0].url).toBe(`https://x.supabase.co/storage/v1/object/receipts/${rel}`);
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Bearer secret", "Content-Type": "image/jpeg" });

    expect(await store.read(rel)).toEqual({ name: path.basename(rel), type: "image/jpeg", data: JPEG });
    expect(await store.read("../secret.jpg")).toBeNull();
  });

  it("reports a failed upload and a missing file", async () => {
    const failing = (async () => new Response("nope", { status: 403 })) as typeof fetch;
    await expect(supabaseFileStore({ url: "https://x", key: "k", fetch: failing }).save(JPEG, "image/jpeg")).rejects.toThrow(/403/);
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await supabaseFileStore({ url: "https://x", key: "k", fetch: missing }).read("receipts/x.pdf")).toBeNull();
  });
});
