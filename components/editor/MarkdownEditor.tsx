"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onPasteImage?: (files: File[]) => Promise<string | null>;
  dark?: boolean;
  placeholder?: string;
};

export default function MarkdownEditor({
  value,
  onChange,
  onPasteImage,
  dark = true,
  placeholder = "开始写作…  粘贴截图可直接上传"
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteRef = useRef(onPasteImage);
  onChangeRef.current = onChange;
  onPasteRef.current = onPasteImage;

  useEffect(() => {
    if (!host.current) return;

    const pasteHandler = EditorView.domEventHandlers({
      paste: event => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter(f => f.type.startsWith("image/"));
        if (!images.length || !onPasteRef.current) return false;
        event.preventDefault();
        onPasteRef.current(images).then(markdownText => {
          if (!markdownText || !view.current) return;
          const { from, to } = view.current.state.selection.main;
          view.current.dispatch({
            changes: { from, to, insert: markdownText },
            selection: { anchor: from + markdownText.length }
          });
        });
        return true;
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        dark ? oneDark : [],
        pasteHandler,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { minHeight: "420px", fontSize: "15px" },
          ".cm-content": { fontFamily: "var(--font-geist-mono), monospace" },
          ".cm-scroller": { overflow: "auto" },
          "&.cm-focused": { outline: "none" }
        }),
        keymap.of([]),
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
    // 仅初始化一次；外部 value 变化由下面的 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (value !== current) {
      v.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      ref={host}
      className="overflow-hidden rounded-xl border border-black/10 bg-white text-left dark:border-white/10 dark:bg-[#1c1c1e]"
      data-placeholder={placeholder}
    />
  );
}
