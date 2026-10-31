"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authHeaders, clearSession, getToken } from "@/app/lib/client-auth";

type MyPost = {
  id: number;
  title: string;
  slug: string;
  status: string;
  created_at: string;
};

const STATUS_TEXT: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "已发布",
  rejected: "已驳回"
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-500/10 text-neutral-500",
  pending: "bg-amber-500/10 text-amber-600",
  published: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-red-500/10 text-red-600"
};

export default function MyPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/me");
      return;
    }
    fetch("/api/posts?mine=1&size=50", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">我的文章</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/write"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
          >
            写文章
          </Link>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.push("/posts");
            }}
            className="rounded-xl border border-black/10 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            退出
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">加载中…</p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 p-10 text-center text-sm text-neutral-500 dark:border-white/15">
          还没有文章，
          <Link href="/write" className="underline">
            写一篇
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map(post => (
            <li
              key={post.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3 dark:border-white/10"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {post.status === "published" ? (
                    <Link href={`/posts/${post.slug}`} className="hover:underline">
                      {post.title}
                    </Link>
                  ) : (
                    post.title
                  )}
                </div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {new Date(post.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                  STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
                }`}
              >
                {STATUS_TEXT[post.status] ?? post.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
