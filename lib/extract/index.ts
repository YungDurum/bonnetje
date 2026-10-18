import { fakeReader } from "./fake";
import { claudeReader, type ReceiptReader } from "./reader";

export { ReadError } from "./errors";
export { readReceipt, type ReceiptFile, type ReceiptMediaType } from "./reader";

/** Claude, unless BONNETJE_READER=fake (e2e tests, demos without an API key). */
export function getReader(): ReceiptReader {
  return process.env.BONNETJE_READER === "fake" ? fakeReader() : claudeReader();
}
