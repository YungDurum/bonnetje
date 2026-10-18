"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStockAction } from "../actions";
import { Sheet } from "../_components/Sheet";
import { PlusIcon } from "../_components/icons";
import { parseEuroInput } from "@/lib/format";
import type { Unit } from "@/lib/money";
import { parseValue } from "@/lib/placement-ui";

const UNITS: Unit[] = ["pcs", "m", "L", "kg", "boxes"];

/** The orange "Add to stock" button at the bottom of the page and its sheet. */
export function AddStock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bottom-bar bottom-bar-sticky">
        <button type="button" className="btn btn-primary btn-lg btn-icon" onClick={() => setOpen(true)}>
          <PlusIcon size={18} />
          Add to stock
        </button>
      </div>
      {open ? <AddStockSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AddStockSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<Unit>("pcs");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const qty = parseValue("measure", amount);
  const cents = parseEuroInput(price);
  const valid = name.trim() !== "" && qty !== null && qty > 0 && cents !== null && cents > 0;

  function submit() {
    if (!valid || qty === null || cents === null) return;
    setError(null);
    startTransition(async () => {
      const r = await addStockAction({ name: name.trim(), qty, unit, valueCents: cents });
      if (r.ok) {
        onClose();
        router.replace(`/stock?${new URLSearchParams({ saved: `${name.trim()} added to stock` })}`, { scroll: false });
      } else setError(r.error);
    });
  }

  return (
    <Sheet label="Add to stock" onClose={onClose}>
      <h2 className="sheet-title">Add to stock</h2>
      <label className="field">
        <span className="field-label-plain">What is it?</span>
        <input
          className="input"
          type="text"
          placeholder="e.g. Copper elbows 15 mm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="form-row-2">
        <label className="field">
          <span className="field-label-plain">How much?</span>
          <input
            className="input amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 20"
            value={amount}
            aria-invalid={amount.trim() !== "" && qty === null ? true : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label-plain">Value incl. VAT</span>
          <span className="input-group">
            <span className="amount input-prefix">€</span>
            <input
              className="input-bare amount"
              style={{ textAlign: "left" }}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Value incl. VAT"
              value={price}
              aria-invalid={price.trim() !== "" && cents === null ? true : undefined}
              onChange={(e) => setPrice(e.target.value)}
            />
          </span>
        </label>
      </div>
      <div className="field">
        <span className="field-label-plain">Unit</span>
        <div className="unit-chips" role="group" aria-label="Unit">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className="chip chip-pick"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-primary" disabled={!valid || pending} onClick={submit}>
        {valid ? "Add to stock" : "Fill in a name, amount and value"}
      </button>
      <p className="note">
        For things you already had in stock. Bought it new? Add the receipt instead, so it&apos;s booked as an expense too.
      </p>
    </Sheet>
  );
}
