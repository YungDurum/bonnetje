import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readStoredFile } from "../files";

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
