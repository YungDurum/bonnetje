// Everything that can go wrong between "pick a file" and "Where did it go?", with the
// message the user sees. The route handler turns these into JSON; nothing else leaks.

export type ReadErrorCode =
  | "no_key"
  | "unsupported_file"
  | "too_large"
  | "not_a_receipt"
  | "invalid"
  | "timeout"
  | "api";

const MESSAGES: Record<ReadErrorCode, string> = {
  no_key: "Receipt reading isn't set up yet (no Claude API key on the server).",
  unsupported_file: "This file type can't be read. Use a JPEG, PNG or WebP photo, or a PDF.",
  too_large: "This file is too big. Files up to 10 MB can be read.",
  not_a_receipt: "This doesn't look like a receipt with items on it.",
  invalid: "The receipt couldn't be read properly. Try a sharper photo with the whole receipt in view.",
  timeout: "Reading took too long. Try again.",
  api: "The receipt reader couldn't be reached. Try again in a moment.",
};

export class ReadError extends Error {
  constructor(
    readonly code: ReadErrorCode,
    /** Extra detail for logs and the extraction report; never shown instead of the message. */
    readonly detail?: string,
  ) {
    super(MESSAGES[code]);
    this.name = "ReadError";
  }

  /** Worth retrying the same file? */
  get retryable(): boolean {
    return this.code === "timeout" || this.code === "api";
  }
}
