"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import {
  authHeaders,
  getToken,
  slugify
} from "@/app/lib/client-auth";

export default function WritePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/write");
      return;
    }
    setReady(true);
  }, [router]);

  const html = useMemo(() => {
    if (!preview) return "";
    return marked.parse(content || "") as string;
  }, [content, preview]);

  const wordCount = useMemo(
    () => content.replace(/\s/g, "").length,
    [content]
  );

  async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers: authHeaders(),
      body: form
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.url ?? null;
  }

  async function handlePaste(files: File[]) {
    setUploading(true);
    try {
      const parts: string[] = [];
      for (const file of files) {
        const url = await uploadImage(file);
        if (url) parts.push(`![${file.name}](${url})`);
      }
      return parts.length ? `\n\n${parts.join("\n\n")}\n\n` : null;
    } finally {
      setUploading(false);
    }
  }

  async function submit(asDraft: boolean) {
    setHint("");
    if (!title.trim()) {
      setHint("请先写个标题");
      return;
    }
    if (!content.trim()) {
      setHint("正文还是空的");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: title.trim(),
          slug: slugify(title),
          description: content.replace(/[#>*`\-\[\]()!]/g, "").slice(0, 120),
          content,
          status: asDraft ? "draft" : "pending",
          tags: tags
            .split(/[,，\s]+/)
            .map(t => t.trim())
            .filter(Boolean)
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setHint(json?.error || "提交失败");
        return;
      }
      router.push("/me");
    } catch {
      setHint("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="标题"
          className="min-w-0 flex-1 border-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
        />
        <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
          <span>{wordCount} 字</span>
          <button
            type="button"
            onClick={() => setPreview(v => !v)}
            className="rounded-lg border border-black/10 px-2.5 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            {preview ? "继续写" : "预览"}
          </button>
        </div>
      </div>

      {preview ? (
        <article
          className="prose prose-neutral max-w-none rounded-xl border border-black/10 bg-white p-6 dark:prose-invert dark:border-white/10 dark:bg-[#1c1c1e]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <MarkdownEditor
          value={content}
          onChange={setContent}
          onPasteImage={handlePaste}
        />
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="标签，用空格或逗号分隔（可留空）"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-400 sm:max-w-sm dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex items-center gap-2">
          {hint && <span className="text-xs text-red-500">{hint}</span>}
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit(true)}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
          >
            存草稿
          </button>
          <button
            type="button"
            disabled={submitting || uploading}
            onClick={() => submit(false)}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "提交中…" : "提交审核"}
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs leading-6 text-neutral-400">
        粘贴截图会自动上传并插入正文 · 提交后需要作者审核通过才会公开
      </p>
    </div>
  );
}
