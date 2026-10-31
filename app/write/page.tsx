"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { marked } from "marked";
import MarkdownEditor, { type EditorHandle } from "@/components/editor/MarkdownEditor";
import { authHeaders, getToken, slugify } from "@/app/lib/client-auth";

const DRAFT_KEY = "waopa_draft_v1";

type Tool = {
  key: string;
  label: string;
  title: string;
  run: (editor: EditorHandle) => void;
};

const TOOLS: Tool[] = [
  { key: "h2", label: "H2", title: "二级标题", run: e => e.insertBlock("## ", "小标题") },
  { key: "h3", label: "H3", title: "三级标题", run: e => e.insertBlock("### ", "小标题") },
  { key: "bold", label: "B", title: "加粗", run: e => e.wrap("**", "**") },
  { key: "italic", label: "I", title: "斜体", run: e => e.wrap("*", "*") },
  { key: "strike", label: "S", title: "删除线", run: e => e.wrap("~~", "~~") },
  { key: "quote", label: "❝", title: "引用", run: e => e.insertBlock("> ", "引用内容") },
  { key: "list", label: "•", title: "无序列表", run: e => e.insertBlock("- ", "列表项") },
  { key: "ol", label: "1.", title: "有序列表", run: e => e.insertBlock("1. ", "列表项") },
  { key: "code", label: "</>", title: "代码块", run: e => e.insert("\n```ts\n\n```\n") },
  { key: "link", label: "🔗", title: "链接", run: e => e.wrap("[", "](https://)") },
  { key: "line", label: "—", title: "分割线", run: e => e.insert("\n\n---\n\n") }
];

function WriteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");

  const editorRef = useRef<EditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/write");
      return;
    }
    if (editId) {
      fetch(`/api/posts/${editId}?raw=1`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null))
        .then(post => {
          if (!post) {
            setHint("文章不存在或无权编辑");
            return;
          }
          setTitle(post.title ?? "");
          setContent(post.content ?? "");
          setTags(Array.isArray(post.tags) ? post.tags.join(" ") : "");
        })
        .catch(() => setHint("加载文章失败"))
        .finally(() => setReady(true));
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        setTitle(draft.title ?? "");
        setContent(draft.content ?? "");
        setTags(draft.tags ?? "");
        if (draft.content) setHint("已恢复上次未发布的内容");
      }
    } catch {
      /* 忽略损坏的草稿 */
    }
    setReady(true);
  }, [router, editId]);

  useEffect(() => {
    if (!ready || editId) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, at: Date.now() }));
        setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      } catch {
        /* 忽略 */
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [title, content, tags, ready, editId]);

  const html = useMemo(() => (preview ? (marked.parse(content) as string) : ""), [content, preview]);
  const wordCount = useMemo(() => content.replace(/\s/g, "").length, [content]);

  async function upload(files: File[]): Promise<string | null> {
    setUploading(true);
    try {
      const parts: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload/image", {
          method: "POST",
          headers: authHeaders(),
          body: form
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (json?.url) parts.push(`\n\n![${file.name}](${json.url})\n\n`);
      }
      return parts.length ? parts.join("") : null;
    } finally {
      setUploading(false);
    }
  }

  async function submit(asDraft: boolean) {
    setHint("");
    if (!title.trim()) return setHint("先写个标题吧");
    if (!content.trim()) return setHint("正文还是空的");
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slugify(title),
        description: content.replace(/[#>*`\-\[\]()!]/g, "").replace(/\s+/g, " ").slice(0, 120),
        content,
        status: asDraft ? "draft" : "published",
        tags: tags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean)
      };
      const res = await fetch(editId ? `/api/posts/${editId}` : "/api/posts", {
        method: editId ? "PUT" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) return setHint(json?.error || "保存失败");
      localStorage.removeItem(DRAFT_KEY);
      router.push(asDraft ? "/me" : `/posts/${json.slug ?? slugify(title)}`);
      router.refresh();
    } catch {
      setHint("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="请输入标题"
        className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700"
      />

      <div className="sticky top-16 z-20 my-3 flex flex-wrap items-center gap-1 rounded-xl border border-black/10 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-white/10 dark:bg-[#1c1c1e]/90">
        {TOOLS.map(tool => (
          <button
            key={tool.key}
            type="button"
            title={tool.title}
            onClick={() => editorRef.current && tool.run(editorRef.current)}
            className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          title="插入图片"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          🖼
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async e => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            const text = await upload(files);
            if (text) editorRef.current?.insert(text);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-3 pr-1 text-xs text-neutral-400">
          {uploading && <span className="text-sky-500">图片上传中…</span>}
          {savedAt && <span>已自动保存 {savedAt}</span>}
          <span>{wordCount} 字</span>
        </div>
      </div>

      {preview ? (
        <article
          className="prose prose-neutral max-w-none rounded-xl border border-black/10 bg-white p-6 dark:prose-invert dark:border-white/10 dark:bg-[#1c1c1e]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <MarkdownEditor
          ref={editorRef}
          value={content}
          onChange={setContent}
          onImage={upload}
          placeholder="开始写作…  直接粘贴截图，图片会自动上传并显示在这里"
        />
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="标签，用逗号或空格分隔（可留空）"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-400 sm:max-w-sm dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex items-center gap-2">
          {hint && <span className="text-xs text-amber-600">{hint}</span>}
          <button
            type="button"
            onClick={() => setPreview(v => !v)}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            {preview ? "继续写" : "预览"}
          </button>
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
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "发布中…" : editId ? "保存修改" : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WritePage() {
  return (
    <Suspense fallback={null}>
      <WriteInner />
    </Suspense>
  );
}
