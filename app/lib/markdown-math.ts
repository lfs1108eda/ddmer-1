import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import katex from "katex";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import plaintext from "highlight.js/lib/languages/plaintext";

let registered = false;

function ensureLanguages() {
  if (registered) return;
  registered = true;
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("tsx", typescript);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("text", plaintext);
  hljs.registerLanguage("plaintext", plaintext);

  marked.use(
    markedHighlight({
      emptyLangClass: "hljs",
      langPrefix: "hljs language-",
      highlight(code: string, lang: string) {
        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        try {
          return hljs.highlight(code, { language }).value;
        } catch {
          return code;
        }
      }
    })
  );
}

/** 去掉明显的 XSS 载体（脚本、事件属性、javascript: 协议等） */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * 渲染 Markdown：
 *  - 代码块高亮（highlight.js）
 *  - LaTeX 公式：$$..$$ / $..$ / \[..\] / \(..\)
 *  - 基础 XSS 过滤
 */
export function renderMarkdown(source: string): string {
  ensureLanguages();

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

  const raw = marked.parse(withPlaceholders) as string;
  const safe = sanitize(raw);
  return safe.replace(/%%MATH(\d+)%%/g, (_, i) => store[Number(i)]);
}
