"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import { authFetch, clearSession, getToken, saveSession } from "@/app/lib/client-auth";

type MyPost = {
  id: number;
  title: string;
  slug: string;
  status: string;
  created_at: string;
};

type Profile = {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  bio: string;
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

export default function MyPage() {
  const router = useRouter();
  const avatarInput = useRef<HTMLInputElement>(null);

  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tip, setTip] = useState("");

  const loadPosts = useCallback(() => {
    setLoading(true);
    authFetch("/api/posts?mine=1&size=50")
      .then(r => (r.ok ? r.json() : []))
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const loadProfile = useCallback(() => {
    authFetch("/api/auth/profile")
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        const data = json?.data;
        if (!data) return;
        setProfile(data);
        setNickname(data.nickname || "");
        setUsername(data.username || "");
        setBio(data.bio || "");
        setAvatar(data.avatar || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/me");
      return;
    }
    loadPosts();
    loadProfile();
  }, [router, loadPosts, loadProfile]);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setTip("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch("/api/upload/image", { method: "POST", body: form });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setTip(json?.error || `上传失败（HTTP ${res.status}）`);
        return;
      }
      const json = await res.json();
      if (json?.url) setAvatar(json.url);
    } catch {
      setTip("头像上传失败，请检查网络");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setTip("");
    try {
      const res = await authFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, username, bio, avatar })
      });
      const json = await res.json();
      if (!res.ok) {
        setTip(json?.error || "保存失败");
        return;
      }
      const data = json.data as Profile;
      setProfile(data);
      const token = getToken();
      if (token) {
        saveSession(token, {
          id: data.id,
          username: data.username,
          nickname: data.nickname,
          avatar: data.avatar,
          bio: data.bio
        });
      }
      setTip("已保存");
    } catch {
      setTip("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(post: MyPost) {
    if (!window.confirm(`确定删除《${post.title}》？删除后无法恢复。`)) return;
    setBusyId(post.id);
    try {
      const res = await authFetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) setPosts(list => list.filter(p => p.id !== post.id));
      else {
        const json = await res.json().catch(() => ({}));
        window.alert(json?.error || "删除失败");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">我的</h1>
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

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#1c1c1e]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            className="group relative"
            title="点击更换头像"
          >
            <UserAvatar
              src={avatar || profile?.avatar}
              name={nickname || username || "我"}
              size={64}
            />
            <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/50 text-[11px] text-white group-hover:flex">
              {uploading ? "上传中" : "更换"}
            </span>
          </button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0">
            <div className="text-base font-semibold">
              {nickname || username || "未命名"}
            </div>
            <div className="text-xs text-neutral-400">登录名：{username || "-"}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">显示名</span>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="评论、文章里显示的名字"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">登录名</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="3-20 位，用于登录"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-neutral-500">简介</span>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={2}
            placeholder="一句话介绍自己"
            className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-white/15"
          />
        </label>

        <div className="mt-4 flex items-center justify-end gap-3">
          {tip && <span className="text-xs text-neutral-500">{tip}</span>}
          <button
            type="button"
            disabled={saving}
            onClick={saveProfile}
            className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? "保存中…" : "保存资料"}
          </button>
        </div>
      </section>

      <h2 className="mb-3 text-sm font-medium text-neutral-500">我的文章</h2>
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 dark:border-white/10"
            >
              <div className="min-w-0 flex-1">
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

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
                  }`}
                >
                  {STATUS_TEXT[post.status] ?? post.status}
                </span>
                <Link
                  href={`/write?id=${post.id}`}
                  className="rounded-lg border border-black/10 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  编辑
                </Link>
                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => remove(post)}
                  className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {busyId === post.id ? "删除中…" : "删除"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
