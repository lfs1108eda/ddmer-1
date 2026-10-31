import { marked } from "marked";
import katex from "katex";

/**
 * 渲染 Markdown，并支持 LaTeX 公式：
 *   $$ 块级公式 $$   $ 行内公式 $
 *   \[ \] 与 \( \) 两种写法同样支持
 * 代码块内的 $ 不会被当成公式。
 */
export function renderMarkdown(source: string): string {
  const store: string[] = [];

  const stash = (tex: string, display: boolean) => {
    store.push(
      katex.renderToString(tex.trim(), {
        displayMode: display,
        throwOnError: false,
        output: "html",
        strict: false
      })
    );
    return `%%MATH${store.length - 1}%%`;
  };

  // 代码块原样保留，避免里面的 $ 被误判
  const segments = source.split(/(```[\s\S]*?```)/g);
  const withPlaceholders = segments
    .map((seg, index) => {
      if (index % 2 === 1) return seg;
      return seg
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => stash(tex, true))
        .replace(/(?<!\\)\$([^\n$]+?)\$/g, (_, tex) => stash(tex, false))
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => stash(tex, false));
    })
    .join("");

  const html = marked.parse(withPlaceholders) as string;
  return html.replace(/%%MATH(\d+)%%/g, (_, i) => store[Number(i)]);
}
