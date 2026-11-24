"use client";

import { useActionState } from "react";
import { Link2, Plus } from "lucide-react";
import { addItem, type ActionState } from "@/actions/items";

const initial: ActionState | null = null;

export function AddItemForm() {
  const [state, formAction, pending] = useActionState(addItem, initial);

  return (
    <form action={formAction} className="pw-card rounded-3xl p-6 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/15 text-indigo-600">
          <Link2 className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Watch a product
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Paste a product page URL. Duluth Trading and Bambu Lab have their
            own scrapers. Other pages are read from price markup.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="pw-label">Product URL</span>
          <input
            name="url"
            type="url"
            required
            placeholder="https://example.com/products/trail-wool-shirt"
            className="pw-input"
          />
        </label>

        <label className="block">
          <span className="pw-label">
            Preferred size{" "}
            <span className="font-normal normal-case tracking-normal text-slate-400">
              optional
            </span>
          </span>
          <input
            name="preferredSize"
            type="text"
            placeholder="e.g. 34x32 or L"
            className="pw-input"
          />
        </label>

        <label className="block">
          <span className="pw-label">
            Target price{" "}
            <span className="font-normal normal-case tracking-normal text-slate-400">
              optional
            </span>
          </span>
          <input
            name="targetPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="Alert if at or below"
            className="pw-input"
          />
        </label>

        <label className="sm:col-span-2 block">
          <span className="pw-label">
            Notes{" "}
            <span className="font-normal normal-case tracking-normal text-slate-400">
              optional, a product name helps matching
            </span>
          </span>
          <input
            name="notes"
            type="text"
            placeholder="Trail wool shirt"
            className="pw-input"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="pw-btn-primary">
          <Plus className="h-4 w-4" />
          {pending ? "Adding & checking…" : "Add to watchlist"}
        </button>
        {state && (
          <p
            className={`text-sm font-medium ${
              state.ok ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
