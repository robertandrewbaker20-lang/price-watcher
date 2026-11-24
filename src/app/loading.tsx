import { Radar } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="pw-brand-mark animate-pulse">
        <Radar className="h-4 w-4" strokeWidth={2.4} />
      </div>
      <p className="text-sm font-medium text-slate-500">Warming up Price Watcher…</p>
    </div>
  );
}
