"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { saveSession } from "@/app/lib/client-auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/write";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json();
      if (!res.ok || json?.code !== 0) {
        setError(json?.message || "登录失败");
        return;
      }
      saveSession(json.data.accessToken, {
        id: Number(json.data.user?.id ?? 0),
        username
      });
      router.push(next);
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-5 py-20">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">登录</h1>
      <p className="mb-8 text-sm text-neutral-500">登录后即可投稿</p>

      <form onSubmit={submit} className="space-y-4">
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="用户名"
          autoComplete="username"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-white/5"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="密码"
          autoComplete="current-password"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-white/5"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        还没有账号？
        <Link href="/register" className="ml-1 text-neutral-900 underline dark:text-white">
          注册
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
