"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import {
  checkItemNow,
  deleteItem,
  setManualPrice,
  toggleItem,
} from "@/actions/items";
import type { PriceHistoryRow, WatchedItem } from "@/lib/db/schema";
import { formatPct, formatUsd, pctChange } from "@/lib/utils";
import { PriceChart } from "./price-chart";
import { detectSite } from "@/lib/sites";

export function ItemCard({
  item,
  history,
}: {
  item: WatchedItem;
  history: PriceHistoryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [manualPrice, setManualPriceInput] = useState("");
  const site = detectSite(item.url);
  const siteLabel =
    site === "duluth" ? "Duluth" : site === "bambu" ? "Bambu" : "Other";

  const prev =
    history.length >= 2 ? history[history.length - 2]?.price : null;
  const change =
    item.lastPrice != null && prev != null
      ? pctChange(item.lastPrice, prev)
      : null;

  function run(action: () => Promise<{ message: string }>) {
    startTransition(async () => {
      const res = await action();
      setMessage(res.message);
    });
  }

  const displayTitle =
    item.title && !/^access denied$/i.test(item.title)
      ? item.title
      : item.notes || "Untitled product";

  return (
    <article
      className={`pw-card group overflow-hidden rounded-3xl transition ${
        item.active ? "" : "opacity-70"
      }`}
    >
      <div className="flex gap-4 p-5 sm:p-6">
        {item.lastImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.lastImage}
            alt=""
            className="hidden h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-indigo-100 sm:block"
          />
        ) : (
          <div className="hidden h-20 w-20 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-50 to-cyan-50 ring-1 ring-indigo-100 sm:block" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="pw-chip pw-chip-site">{siteLabel}</span>
                {!item.active && (
                  <span className="pw-chip pw-chip-warn">Paused</span>
                )}
                {item.lastSizeAvailable === true && (
                  <span className="pw-chip pw-chip-ok">Size in stock</span>
                )}
                {item.lastSizeAvailable === false && item.preferredSize && (
                  <span className="pw-chip pw-chip-warn">Size out</span>
                )}
              </div>
              <h3 className="truncate text-base font-semibold tracking-tight text-slate-900">
                {displayTitle}
              </h3>
              {item.notes &&
                item.title &&
                item.notes !== item.title &&
                !/^access denied$/i.test(item.title) && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {item.notes}
                  </p>
                )}
            </div>

            <div className="text-right">
              <p className="text-2xl font-semibold tracking-tight text-slate-900">
                {formatUsd(item.lastPrice)}
              </p>
              {change != null && (
                <p
                  className={`text-sm font-semibold ${
                    change < 0
                      ? "pw-price-drop"
                      : change > 0
                        ? "pw-price-up"
                        : "text-slate-400"
                  }`}
                >
                  {formatPct(change)} vs prior
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {item.preferredSize && (
              <span>
                Size{" "}
                <span className="font-medium text-slate-700">
                  {item.preferredSize}
                </span>
              </span>
            )}
            {item.targetPrice != null && (
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3 text-indigo-500" />
                Target{" "}
                <span className="font-medium text-indigo-700">
                  {formatUsd(item.targetPrice)}
                </span>
              </span>
            )}
            {item.lastChecked && (
              <span>
                Checked{" "}
                {format(
                  item.lastChecked instanceof Date
                    ? item.lastChecked
                    : new Date(item.lastChecked),
                  "MMM d · h:mm a"
                )}
              </span>
            )}
          </div>

          {item.lastError && (
            <div className="mt-3 space-y-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5">
              <p className="text-xs text-rose-700">{item.lastError}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Manual price"
                  value={manualPrice}
                  onChange={(e) => setManualPriceInput(e.target.value)}
                  className="pw-input !w-28 !rounded-xl !px-2 !py-1.5 !text-xs"
                />
                <button
                  type="button"
                  disabled={pending || !manualPrice}
                  onClick={() =>
                    run(async () => {
                      const res = await setManualPrice(item.id, manualPrice);
                      if (res.ok) setManualPriceInput("");
                      return res;
                    })
                  }
                  className="pw-btn-ghost"
                >
                  Save price
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100/80 px-5 pb-2 pt-4 sm:px-6">
        <PriceChart history={history} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100/80 px-5 py-3 sm:px-6">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => checkItemNow(item.id))}
          className="pw-btn-primary !px-3.5 !py-1.5 !text-xs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
          />
          Check now
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => toggleItem(item.id, !item.active))}
          className="pw-btn-ghost"
        >
          {item.active ? (
            <>
              <Pause className="h-3.5 w-3.5" /> Pause
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Resume
            </>
          )}
        </button>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="pw-btn-ghost"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this item and its history?")) {
              run(() => deleteItem(item.id));
            }
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      {message && (
        <p className="border-t border-slate-100/80 px-5 py-2 text-xs text-slate-500 sm:px-6">
          {message}
        </p>
      )}
    </article>
  );
}
