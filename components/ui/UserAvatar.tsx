"use client";

import { useState } from "react";

type Props = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
};

const PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6"
];

function colorOf(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return PALETTE[hash % PALETTE.length];
}

/** 有头像就显示头像，没有（或加载失败）就用用户名首字生成一个彩色圆 */
export default function UserAvatar({ src, name, size = 36, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const label = (name || "匿").trim() || "匿";
  const initial = label.slice(0, 1).toUpperCase();

  if (src && !failed) {
    return (
      // 用原生 img：评论头像来自任意域名，避免 next/image 域名白名单限制
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      title={label}
      style={{
        width: size,
        height: size,
        background: colorOf(label),
        fontSize: Math.max(11, Math.round(size * 0.42))
      }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`}
    >
      {initial}
    </div>
  );
}
