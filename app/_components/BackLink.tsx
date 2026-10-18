import Link from "next/link";
import { BackIcon } from "./icons";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="round-btn" aria-label={label}>
      <BackIcon />
    </Link>
  );
}
