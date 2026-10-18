"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet: dialog that takes focus, closes on Escape or a tap on the backdrop, and keeps Tab inside. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]"),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <span className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
