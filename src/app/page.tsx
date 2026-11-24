import { Activity, Radar } from "lucide-react";
import { listItemsWithHistory } from "@/actions/items";
import { AddItemForm } from "@/components/add-item-form";
import { CheckAllButton } from "@/components/check-all-button";
import { ItemCard } from "@/components/item-card";
import { DROP_THRESHOLD_PCT } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await listItemsWithHistory();
  const active = items.filter(({ item }) => item.active).length;
  const withPrice = items.filter(({ item }) => item.lastPrice != null).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <span className="pw-brand-mark">
              <Radar className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="pw-live-dot" />
              Price watch
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Price{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">
              Watcher
            </span>
          </h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-500">
            Watch a product page. Alerts fire at a{" "}
            <span className="font-medium text-indigo-600">
              {DROP_THRESHOLD_PCT}% drop
            </span>{" "}
            or at your target price.
          </p>
        </div>
        <CheckAllButton />
      </header>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Watching" value={String(items.length)} />
        <Stat label="Active" value={String(active)} accent />
        <Stat label="Priced" value={String(withPrice)} />
      </div>

      <div className="space-y-6">
        <AddItemForm />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold tracking-wide text-slate-700">
                Watchlist
              </h2>
            </div>
            <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200/80">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="pw-card rounded-3xl px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/15 text-indigo-600">
                <Radar className="h-5 w-5" />
              </div>
              <p className="text-base font-semibold text-slate-800">
                Nothing on radar yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Paste a product URL above to start tracking.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map(({ item, history }) => (
                <ItemCard key={item.id} item={item} history={history} />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-14 text-center text-xs text-slate-400">
        Local tracker. SQLite keeps the history. Playwright reads the page.
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="pw-card rounded-2xl px-3 py-3 sm:px-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          accent
            ? "bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
            : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
