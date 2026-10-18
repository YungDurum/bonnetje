"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReadResponse } from "@/app/api/receipts/read/route";
import { photoToJpeg } from "@/lib/image";
import { CameraIcon, CloseIcon, FileIcon, ImageIcon } from "../../_components/icons";

type Kind = "camera" | "photos" | "pdf";
type Picked = { file: File; isPdf: boolean };
type State =
  | { step: "idle" }
  | { step: "reading"; picked: Picked; preview: string | null }
  | { step: "error"; picked: Picked; kind: Kind; message: string; retryable: boolean };

const MAX_BYTES = 10 * 1024 * 1024;
const SENDABLE = ["image/jpeg", "image/png", "image/webp"];

class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** Photos go up as a ~2000 px JPEG; PDFs as they are. */
async function prepare({ file, isPdf }: Picked): Promise<Blob> {
  if (isPdf) {
    if (file.size > MAX_BYTES) throw new UploadError("This PDF is too big. Files up to 10 MB can be read.", false);
    return file;
  }
  try {
    return await photoToJpeg(file);
  } catch {
    // The browser can't open it (HEIC on some browsers): send it as is if the reader can.
    if (SENDABLE.includes(file.type) && file.size <= MAX_BYTES) return file;
    throw new UploadError("This photo can't be opened here. Try a screenshot of it, or save it as a JPEG.", false);
  }
}

export function CaptureReceipt() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const cameraInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const lastKind = useRef<Kind>("camera");

  const preview = state.step === "reading" ? state.preview : null;
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => abort.current?.abort(), []);

  function pick(kind: Kind) {
    lastKind.current = kind;
    const input = { camera: cameraInput, photos: photosInput, pdf: pdfInput }[kind].current;
    if (!input) return;
    input.value = ""; // picking the same file again must still fire onChange
    input.click();
  }

  async function read(picked: Picked) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ step: "reading", picked, preview: picked.isPdf ? null : URL.createObjectURL(picked.file) });
    try {
      const body = new FormData();
      body.append("file", await prepare(picked), picked.file.name || "receipt");
      body.append("name", picked.file.name);
      let res: Response;
      try {
        res = await fetch("/api/receipts/read", { method: "POST", body, signal: controller.signal });
      } catch (e) {
        if (controller.signal.aborted) throw e;
        throw new UploadError("No connection. Check your internet and try again.", true);
      }
      const data = (await res.json().catch(() => null)) as ReadResponse | null;
      if (!data) throw new UploadError("Something went wrong. Try again.", true);
      if ("error" in data) throw new UploadError(data.message, data.retryable);
      router.push(`/receipts/${data.id}`);
    } catch (e) {
      if (controller.signal.aborted) return;
      const err = e instanceof UploadError ? e : new UploadError("Something went wrong. Try again.", true);
      setState({ step: "error", picked, kind: lastKind.current, message: err.message, retryable: err.retryable });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    void read({ file, isPdf });
  }

  function cancel() {
    abort.current?.abort();
    setState({ step: "idle" });
  }

  return (
    <>
      <section className="stack-10" aria-label="Ways to add a receipt">
        {state.step === "error" ? (
          <div className="notice-error stack-10" role="alert">
            <span>{state.message}</span>
            <div className="error-actions">
              {state.retryable ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void read(state.picked)}>
                  Try again
                </button>
              ) : null}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => pick(state.kind)}>
                Pick another file
              </button>
            </div>
          </div>
        ) : null}

        <button type="button" className="source-btn" onClick={() => pick("camera")}>
          <CameraIcon />
          <span className="source-text">
            <span className="source-title">Take a photo</span>
            <span className="source-sub">Paper receipt from the shop</span>
          </span>
        </button>
        <button type="button" className="source-btn" onClick={() => pick("photos")}>
          <ImageIcon />
          <span className="source-text">
            <span className="source-title">Choose from your photos</span>
            <span className="source-sub">A picture of a receipt you took earlier</span>
          </span>
        </button>
        <button type="button" className="source-btn" onClick={() => pick("pdf")}>
          <FileIcon />
          <span className="source-text">
            <span className="source-title">Upload a PDF</span>
            <span className="source-sub">Invoice from a wholesaler or webshop</span>
          </span>
        </button>

        {/* The buttons above open these; they stay out of the tab order. */}
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={photosInput} type="file" accept="image/*" hidden onChange={onFile} />
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
      </section>

      {state.step === "reading" ? <Reading picked={state.picked} preview={state.preview} onCancel={cancel} /> : null}
    </>
  );
}

function Reading({ picked, preview, onCancel }: { picked: Picked; preview: string | null; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  const label = picked.isPdf ? "Reading PDF…" : "Reading receipt…";
  return (
    <div className="reading" role="dialog" aria-modal="true" aria-label={picked.isPdf ? "Reading PDF" : "Reading photo"}>
      <div className="reading-head">
        <button ref={cancelRef} type="button" className="reading-cancel" aria-label="Cancel" onClick={onCancel}>
          <CloseIcon size={20} />
        </button>
        <span className="reading-title">{picked.isPdf ? "Reading PDF" : "Reading photo"}</span>
        <span className="reading-spacer" />
      </div>
      <div className="reading-stage">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable image
          <img className="reading-photo" src={preview} alt="" />
        ) : (
          <div className="reading-pdf">
            <span className="reading-pdf-badge">PDF</span>
            <span className="reading-pdf-name">{picked.file.name}</span>
          </div>
        )}
        <div className="scanline" aria-hidden="true" />
        <div className="reading-pill" role="status">
          {label}
        </div>
      </div>
    </div>
  );
}
