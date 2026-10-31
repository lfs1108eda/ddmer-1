"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "katex/dist/katex.min.css";
import { renderMarkdown } from "@/app/lib/markdown-math";
import MarkdownEditor, { type EditorHandle } from "@/components/editor/MarkdownEditor";
import { authHeaders, getToken, slugify } from "@/app/lib/client-auth";

const DRAFT_KEY = "waopa_draft_v2";
const MAX_CHARS = 100000;

const COLORS = ["#e11d48", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#71717a"];

type Heading = { text: string; level: number; line: number };

/** 大图先压缩，避免超过 4.5MB 请求体上限 */
async function compressImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.9));
    if (blob && blob.size < file.size) {
      const name = (file.name.replace(/\.[^.]+$/, "") || "image") + ".jpg";
      return new File([blob], name, { type: "image/jpeg" });
    }
  } catch {
    /* 压缩失败就用原图 */
  }
  return file;
}

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
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState("");
  const [savedAt, setSavedAt] = useState("");

  const [tocOpen, setTocOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [night, setNight] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  /* ---------------- 数据加载 ---------------- */
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/write");
      return;
    }
    if (editId) {
      fetch(`/api/posts/${editId}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null))
        .then(post => {
          if (!post) return setHint("文章不存在或无权编辑");
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
      /* 忽略 */
    }
    setReady(true);
  }, [router, editId]);

  /* ---------------- 自动保存 ---------------- */
  useEffect(() => {
    if (!ready || editId) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, at: Date.now() }));
        setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }).slice(0, 5));
      } catch {
        /* 忽略 */
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [title, content, tags, ready, editId]);

  /* ---------------- 派生数据 ---------------- */
  const html = useMemo(() => renderMarkdown(content), [content]);

  const toc = useMemo<Heading[]>(() => {
    return content
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^#{1,3}\s+/.test(line))
      .map(({ line, index }) => ({
        text: line.replace(/^#{1,3}\s+/, "").trim(),
        level: (line.match(/^#+/) as RegExpMatchArray)[0].length,
        line: index
      }));
  }, [content]);

  /* ---------------- 图片 ---------------- */
  const upload = useCallback(async (files: File[]): Promise<string | null> => {
    if (!getToken()) {
      setHint("登录状态已失效，请重新登录后再上传图片");
      return null;
    }
    setUploading(true);
    try {
      const parts: string[] = [];
      for (const original of files) {
        const file = await compressImage(original);
        const form = new FormData();
        form.append("file", file);
        let res: Response;
        try {
          res = await fetch("/api/upload/image", {
            method: "POST",
            headers: authHeaders(),
            body: form
          });
        } catch {
          setHint("网络异常，图片上传失败");
          return null;
        }
        if (!res.ok) {
          let detail = "";
          try {
            const j = await res.json();
            detail = j?.error ?? "";
          } catch {
            /* 响应不是 JSON */
          }
          setHint(
            `图片上传失败（HTTP ${res.status}${detail ? "：" + detail.slice(0, 60) : ""}）`
          );
          return null;
        }
        const json = await res.json();
        if (json?.url) {
          const alt = file.name.replace(/\.[^.]+$/, "") || "图片";
          parts.push(`\n\n![${alt}](${json.url})\n\n`);
        }
      }
      if (!parts.length) return null;
      setHint("");
      return parts.join("");
    } finally {
      setUploading(false);
    }
  }, []);

  /* ---------------- 提交 ---------------- */
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

  const ToolBtn = ({
    children,
    title: t,
    onClick
  }: {
    children: React.ReactNode;
    title: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      title={t}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-neutral-600 transition-colors hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-[#f4f5f7] dark:bg-[#0f0f11]">
      {/* ============ 顶部工具栏 ============ */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-black/5 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-[#1a1a1d]">
        <ToolBtn title="二级标题" onClick={() => editorRef.current?.insertBlock("## ")}>H2</ToolBtn>
        <ToolBtn title="三级标题" onClick={() => editorRef.current?.insertBlock("### ")}>H3</ToolBtn>
        <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/15" />
        <ToolBtn title="加粗" onClick={() => editorRef.current?.wrap("**", "**")}><b>B</b></ToolBtn>
        <ToolBtn title="斜体" onClick={() => editorRef.current?.wrap("*", "*")}><i>I</i></ToolBtn>
        <ToolBtn title="删除线" onClick={() => editorRef.current?.wrap("~~", "~~")}><s>U</s></ToolBtn>
        <ToolBtn title="行内代码" onClick={() => editorRef.current?.wrap("`", "`")}>{"</>"}</ToolBtn>
        <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/15" />

        <div className="relative">
          <ToolBtn title="文字颜色" onClick={() => setColorOpen(v => !v)}>
            <span className="font-semibold">A</span>
            <span className="ml-0.5 h-1 w-3 rounded bg-gradient-to-r from-rose-500 to-blue-500" />
          </ToolBtn>
          {colorOpen && (
            <div className="absolute left-0 top-9 z-30 flex gap-1.5 rounded-lg border border-black/10 bg-white p-2 shadow-lg dark:border-white/15 dark:bg-[#232326]">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => {
                    editorRef.current?.wrap(`<span style="color:${c}">`, "</span>");
                    setColorOpen(false);
                  }}
                  className="h-5 w-5 rounded-full border border-black/10 hover:scale-110 transition-transform"
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>

        <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/15" />
        <ToolBtn title="无序列表" onClick={() => editorRef.current?.insertBlock("- ")}>☰</ToolBtn>
        <ToolBtn title="有序列表" onClick={() => editorRef.current?.insertBlock("1. ")}>1.</ToolBtn>
        <ToolBtn title="引用" onClick={() => editorRef.current?.insertBlock("> ")}>❝</ToolBtn>
        <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/15" />
        <ToolBtn title="插入图片" onClick={() => fileRef.current?.click()}>🖼</ToolBtn>
        <ToolBtn title="链接" onClick={() => editorRef.current?.wrap("[", "](https://)")}>🔗</ToolBtn>
        <ToolBtn title="代码块" onClick={() => editorRef.current?.insert("\n```ts\n\n```\n")}>▤</ToolBtn>
        <ToolBtn
          title="公式"
          onClick={() => {
            const tex = window.prompt("输入 LaTeX 公式，例如：\\frac{a}{b}");
            if (tex) editorRef.current?.insert(`\n$$\n${tex}\n$$\n`);
          }}
        >
          Σ
        </ToolBtn>

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
          {savedAt && <span>已保存 {savedAt}</span>}
          <button
            type="button"
            onClick={() => setTocOpen(v => !v)}
            className={`rounded-md px-2 py-1 ${tocOpen ? "bg-black/5 dark:bg-white/10" : ""}`}
            title="目录"
          >
            目录
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(v => !v)}
            className={`rounded-md px-2 py-1 ${previewOpen ? "bg-black/5 dark:bg-white/10" : ""}`}
            title="手机预览"
          >
            预览
          </button>
        </div>
      </div>

      {/* ============ 三栏主体 ============ */}
      <div className="flex min-h-0 flex-1">
        {/* 目录 */}
        {tocOpen && (
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-black/5 bg-white px-4 py-5 md:block dark:border-white/10 dark:bg-[#1a1a1d]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-500">目录</span>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>
            {toc.length === 0 ? (
              <p className="text-xs leading-6 text-neutral-400">
                对文档内容应用「标题」样式
                <br />
                即可生成目录
              </p>
            ) : (
              <ul className="space-y-1.5">
                {toc.map((h, i) => (
                  <li key={`${h.line}-${i}`}>
                    <button
                      type="button"
                      onClick={() => editorRef.current?.gotoLine(h.line)}
                      className="w-full truncate text-left text-xs text-neutral-600 hover:text-sky-500 dark:text-neutral-400"
                      style={{ paddingLeft: (h.level - 1) * 12 }}
                    >
                      {h.text || "未命名标题"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {/* 编辑区 */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <input
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 80))}
              placeholder="请输入标题（建议30字以内）"
              className="mb-6 w-full border-0 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700"
            />
            <MarkdownEditor
              ref={editorRef}
              value={content}
              onChange={setContent}
              onImage={upload}
              onError={setHint}
              placeholder="开始写作…  直接粘贴截图，图片会自动上传并显示在这里"
            />
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>{hint && <span className="text-amber-600">{hint}</span>}</span>
              <span>
                {content.length}/{MAX_CHARS}
              </span>
            </div>
          </div>
        </main>

        {/* 手机预览 */}
        {previewOpen && (
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-black/5 bg-white px-4 py-4 lg:flex dark:border-white/10 dark:bg-[#1a1a1d]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-500">预览</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div
              className={`flex-1 overflow-y-auto rounded-[28px] border-8 ${
                night ? "border-neutral-800 bg-[#141416]" : "border-neutral-200 bg-white"
              } px-4 py-4`}
            >
              <h1
                className={`mb-2 text-base font-bold leading-snug ${
                  night ? "text-neutral-100" : "text-neutral-900"
                }`}
              >
                {title || "请输入标题"}
              </h1>
              <div className={`text-[11px] text-neutral-400 ${night ? "dark" : ""}`}>
                {night ? (
                  <div className="md-body text-[11px] leading-6 text-neutral-300">
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                ) : (
                  <div className="md-body text-[11px] leading-6">
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                )}
              </div>
            </div>

            <label className="mt-3 flex items-center justify-end gap-2 text-xs text-neutral-500">
              夜间模式
              <input
                type="checkbox"
                checked={night}
                onChange={e => setNight(e.target.checked)}
                className="h-4 w-4 accent-neutral-800"
              />
            </label>
          </aside>
        )}
      </div>

      {/* ============ 底部操作栏 ============ */}
      <div className="border-t border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1a1a1d]">
        {settingsOpen && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
            <span className="text-xs text-neutral-500">标签</span>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="用逗号或空格分隔，可留空"
              className="min-w-[240px] flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            发布设置
            <span className={`transition-transform ${settingsOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit(true)}
              className="rounded-lg border border-neutral-300 px-5 py-2 text-sm text-neutral-700 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              保存为草稿
            </button>
            <button
              type="button"
              disabled={submitting || uploading}
              onClick={() => submit(false)}
              className="rounded-lg bg-[#00aeec] px-7 py-2 text-sm font-medium text-white hover:bg-[#009dd6] disabled:opacity-50"
            >
              {submitting ? "发布中…" : editId ? "保存修改" : "发布"}
            </button>
          </div>
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
