"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "../_components/icons";

/** Search field: updates ?q= so the list is filtered on the server. Works as a plain GET form too. */
export function StockSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function go(v: string) {
    clearTimeout(timer.current);
    const q = v.trim();
    router.replace(q ? `/stock?${new URLSearchParams({ q })}` : "/stock", { scroll: false });
  }

  return (
    <form
      role="search"
      action="/stock"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <label className="search-box">
        <SearchIcon />
        <input
          type="search"
          name="q"
          className="search-input"
          placeholder="Search stock"
          aria-label="Search stock"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go(e.target.value), 200);
          }}
        />
      </label>
    </form>
  );
}
