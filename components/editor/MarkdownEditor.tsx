"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  WidgetType
} from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

export type EditorHandle = {
  focus: () => void;
  insert: (text: string) => void;
  wrap: (before: string, after: string) => void;
  insertBlock: (prefix: string) => void;
  gotoLine: (line: number) => void;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  onImage: (files: File[]) => Promise<string | null>;
  onError?: (msg: string) => void;
  dark?: boolean;
  placeholder?: string;
};

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-image-widget";
    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.loading = "lazy";
    img.onerror = () => {
      wrap.textContent = `图片加载失败：${this.alt || this.url}`;
      wrap.className = "cm-image-error";
    };
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

function buildImageDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    IMAGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMAGE_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (sel.from <= end && sel.to >= start) continue;
      builder.add(
        start,
        end,
        Decoration.replace({ widget: new ImageWidget(m[2], m[1]) })
      );
    }
  }
  return builder.finish();
}

const imagePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildImageDecorations(update.view);
      }
    }
  },
  { decorations: value => value.decorations }
);

/** 从剪贴板事件里尽量取出图片文件（截图工具/网页复制的实现差异很大） */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file && file.type.startsWith("image/")) out.push(file);
    }
  }
  if (!out.length) {
    for (const file of Array.from(data.files ?? [])) {
      if (file.type.startsWith("image/")) out.push(file);
    }
  }
  // 有些浏览器把截图放在 text/html 里，形如 <img src="data:image/png;base64,...">
  if (!out.length) {
    const html = data.getData?.("text/html") ?? "";
    const m = html.match(/<img[^>]+src="(data:image\/[^"]+)"/i);
    if (m) {
      const blob = dataURLtoBlob(m[1]);
      if (blob) out.push(new File([blob], "pasted.png", { type: blob.type }));
    }
  }
  return out;
}

function dataURLtoBlob(dataUrl: string): Blob | null {
  try {
    const [meta, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch {
    return null;
  }
}

const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  { value, onChange, onImage, onError, dark = true, placeholder = "开始写作…" },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onImageRef = useRef(onImage);
  const onErrorRef = useRef(onError);
  onChangeRef.current = onChange;
  onImageRef.current = onImage;
  onErrorRef.current = onError;

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    insert: (text: string) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
      v.focus();
    },
    wrap: (before: string, after: string) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const selected = v.state.sliceDoc(from, to);
      const insert = `${before}${selected}${after}`;
      v.dispatch({
        changes: { from, to, insert },
        selection: {
          anchor: from + before.length,
          head: from + before.length + selected.length
        }
      });
      v.focus();
    },
    insertBlock: (prefix: string) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const line = v.state.doc.lineAt(from);
      const selected = v.state.sliceDoc(from, to);
      if (selected) {
        // 有选中内容：在行首插入标记，保留原文
        v.dispatch({
          changes: { from: line.from, insert: prefix },
          selection: { anchor: line.from + prefix.length, head: to + prefix.length }
        });
      } else {
        // 没选中：只插入标记本身，光标落在后面
        v.dispatch({
          changes: { from: line.from, insert: prefix },
          selection: { anchor: line.from + prefix.length }
        });
      }
      v.focus();
    },
    gotoLine: (lineNumber: number) => {
      const v = view.current;
      if (!v) return;
      const total = v.state.doc.lines;
      const line = v.state.doc.line(Math.min(Math.max(1, lineNumber + 1), total));
      v.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true
      });
      v.focus();
    }
  }));

  useEffect(() => {
    if (!host.current) return;

    const handleFiles = (files: File[]) => {
      if (!files.length) return;
      onImageRef.current(files)
        .then(text => {
          if (!view.current) return;
          if (!text) {
            onErrorRef.current?.("图片上传失败，请检查网络或登录状态后重试");
            return;
          }
          const { from } = view.current.state.selection.main;
          view.current.dispatch({
            changes: { from, insert: text },
            selection: { anchor: from + text.length }
          });
        })
        .catch(() => onErrorRef.current?.("图片上传异常"));
    };

    const handlers = EditorView.domEventHandlers({
      paste: event => {
        const files = filesFromClipboard(event.clipboardData);
        if (!files.length) return false; // 普通文本走默认粘贴
        event.preventDefault();
        handleFiles(files);
        return true;
      },
      dragover: event => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      drop: event => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f =>
          f.type.startsWith("image/")
        );
        if (!files.length) return false;
        event.preventDefault();
        handleFiles(files);
        return true;
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        dark ? oneDark : [],
        imagePlugin,
        handlers,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { minHeight: "60vh", fontSize: "16px" },
          ".cm-content": { padding: "10px 6px", lineHeight: "1.9" },
          ".cm-scroller": { overflow: "auto" },
          "&.cm-focused": { outline: "none" },
          ".cm-image-widget img": {
            maxWidth: "100%",
            borderRadius: "12px",
            margin: "10px 0",
            display: "block",
            boxShadow: "0 2px 12px rgba(0,0,0,.08)"
          },
          ".cm-image-error": {
            color: "#ef4444",
            fontSize: "12px",
            padding: "6px 0"
          }
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        })
      ]
    });

    view.current = new EditorView({ state, parent: host.current });

    // 兜底：焦点不在编辑器里时粘贴图片，也能落到正文
    const onWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (view.current?.hasFocus) return; // 编辑器自己会处理
      const files = filesFromClipboard(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      view.current?.focus();
      handleFiles(files);
    };
    window.addEventListener("paste", onWindowPaste);

    return () => {
      window.removeEventListener("paste", onWindowPaste);
      view.current?.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (value !== current) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <div
        ref={host}
        className="rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]"
      />
      {!value && (
        <div className="pointer-events-none absolute left-4 top-4 text-sm text-neutral-400">
          {placeholder}
        </div>
      )}
    </div>
  );
});

export default MarkdownEditor;
