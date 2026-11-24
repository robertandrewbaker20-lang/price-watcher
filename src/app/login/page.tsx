"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Radar } from "lucide-react";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Incorrect password");
      return;
    }
    router.replace(params.get("next") || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="pw-card w-full max-w-sm rounded-3xl p-7 shadow-xl"
    >
      <div className="mb-6 text-center">
        <div className="pw-brand-mark mx-auto mb-3">
          <Radar className="h-4 w-4" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Price Watcher</h1>
        <p className="mt-1 text-sm text-slate-500">Enter access password</p>
      </div>
      <label className="block">
        <span className="pw-label">Password</span>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="pw-input"
          placeholder="••••••••"
        />
      </label>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !password}
        className="pw-btn-primary mt-5 w-full"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="text-sm text-slate-500">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
