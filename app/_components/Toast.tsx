import { CircleCheckIcon } from "./icons";

/** Green confirmation, like the prototype's toast. Pass the text from a `saved` search param. */
export function Toast({ text }: { text?: string | string[] }) {
  const t = (Array.isArray(text) ? text[0] : text)?.slice(0, 300);
  if (!t) return null;
  return (
    <div className="toast" role="status">
      <CircleCheckIcon />
      <span>{t}</span>
    </div>
  );
}
