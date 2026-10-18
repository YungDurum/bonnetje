import type { LabourMode } from "./money";

/** Format integer cents like the prototype: 41891 -> "€418.91", 5 -> "€0.05", -250 -> "−€2.50". */
export function formatEuro(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("formatEuro expects integer cents");
  }
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "−" : ""}€${euros}.${rest}`;
}

/** Hours or days in half steps, like the prototype: (12, "hour") -> "6 h", (9, "hour") -> "4.5 h", (2, "day") -> "1 day", (1, "day") -> "0.5 days". */
export function formatHalf(half: number, mode: LabourMode): string {
  if (!Number.isSafeInteger(half) || half < 0) {
    throw new Error("formatHalf expects whole half steps >= 0");
  }
  const text = `${Math.floor(half / 2)}${half % 2 ? ".5" : ""}`;
  return mode === "hour" ? `${text} h` : `${text} ${text === "1" ? "day" : "days"}`;
}

/** A rate typed by a person ("62,50", "62.5", "62") -> integer cents; null if it isn't an amount. */
export function parseEuroInput(text: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Cents as the text of a rate field: 6250 -> "62.50". */
export function formatEuroInput(cents: number): string {
  return formatEuro(cents).slice(1);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-16" -> "Fri 16 Oct" (no time zone involved). */
export function formatDay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
