"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { checkAllNow } from "@/actions/items";

export function CheckAllButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await checkAllNow();
            setMessage(res.message);
          });
        }}
        className="pw-btn-ghost !px-4 !py-2 !text-sm shadow-sm"
      >
        <RefreshCw className={`h-4 w-4 text-indigo-500 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Scanning…" : "Check all now"}
      </button>
      {message && (
        <p className="max-w-[16rem] text-right text-xs text-slate-500">
          {message}
        </p>
      )}
    </div>
  );
}
