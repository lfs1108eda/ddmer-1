"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
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
  insertBlock: (prefix: string, fallback?: string) => void;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  onImage: (files: File[]) => Promise<string | null>;
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
      // 光标落在图片语法上时显示原文，便于修改
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

const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  { value, onChange, onImage, dark = true, placeholder = "开始写作…" },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onImageRef = useRef(onImage);
  onChangeRef.current = onChange;
  onImageRef.current = onImage;

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
    insertBlock: (prefix: string, fallback = "标题") => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const line = v.state.doc.lineAt(from);
      const selected = v.state.sliceDoc(from, to) || fallback;
      v.dispatch({
        changes: { from: line.from, to: line.to, insert: `${prefix}${selected}` },
        selection: { anchor: line.from + prefix.length + selected.length }
      });
      v.focus();
    }
  }));

  useEffect(() => {
    if (!host.current) return;

    const uploadThen = (files: File[]) => {
      onImageRef.current(files).then(text => {
        if (!text || !view.current) return;
        const { from } = view.current.state.selection.main;
        view.current.dispatch({
          changes: { from, insert: text },
          selection: { anchor: from + text.length }
        });
      });
    };

    const handlers = EditorView.domEventHandlers({
      paste: event => {
        const images = Array.from(event.clipboardData?.files ?? []).filter(f =>
          f.type.startsWith("image/")
        );
        if (!images.length) return false;
        event.preventDefault();
        uploadThen(images);
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
        const files = Array.from(event.dataTransfer?.files ?? []);
        const images = files.filter(f => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        uploadThen(images);
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
          ".cm-content": { padding: "8px 4px", lineHeight: "1.8" },
          ".cm-scroller": { overflow: "auto" },
          "&.cm-focused": { outline: "none" },
          ".cm-image-widget img": {
            maxWidth: "100%",
            borderRadius: "12px",
            margin: "10px 0",
            display: "block"
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
    return () => {
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
        className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#1c1c1e]"
      />
      {!value && (
        <div className="pointer-events-none absolute left-3 top-3 text-sm text-neutral-400">
          {placeholder}
        </div>
      )}
    </div>
  );
});

export default MarkdownEditor;
