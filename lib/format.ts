/** Format integer cents as Dutch-style euros, e.g. 1234 -> "€ 12,34", 123456 -> "€ 1.234,56". */
export function formatEuro(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("formatEuro expects integer cents");
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}€ ${euros},${rest}`;
}
