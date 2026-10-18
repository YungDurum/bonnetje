import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localFileStore, sniffMediaType, supabaseFileStore } from "../files";

const enc = (s: string) => new TextEncoder().encode(s);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

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
  it("saves and loads a file by key", async () => {
    const store = localFileStore(join(mkdtempSync(join(tmpdir(), "bonnetje-files-")), "receipts"));
    const key = await store.save(JPEG, "image/jpeg");
    expect(key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(await store.load(key)).toEqual({ bytes: JPEG, mediaType: "image/jpeg" });
  });

  it("refuses keys that aren't its own", async () => {
    const store = localFileStore(mkdtempSync(join(tmpdir(), "bonnetje-files-")));
    expect(await store.load("../../etc/passwd")).toBeNull();
    expect(await store.load("00000000-0000-0000-0000-000000000000.jpg")).toBeNull();
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

    const key = await store.save(JPEG, "image/jpeg");
    expect(calls[0].url).toBe(`https://x.supabase.co/storage/v1/object/receipts/${key}`);
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Bearer secret", "Content-Type": "image/jpeg" });

    expect(await store.load(key)).toEqual({ bytes: JPEG, mediaType: "image/jpeg" });
  });

  it("reports a failed upload and a missing file", async () => {
    const failing = (async () => new Response("nope", { status: 403 })) as typeof fetch;
    await expect(supabaseFileStore({ url: "https://x", key: "k", fetch: failing }).save(JPEG, "image/jpeg")).rejects.toThrow(/403/);
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await supabaseFileStore({ url: "https://x", key: "k", fetch: missing }).load("00000000-0000-0000-0000-000000000000.pdf")).toBeNull();
  });
});
