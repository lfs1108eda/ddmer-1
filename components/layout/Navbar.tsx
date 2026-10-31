"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useConfigValue } from "@/components/providers/SiteConfigProvider";
import { siteConfig } from "@/siteConfig";
import { getToken } from "@/app/lib/client-auth";
import { BookOpen, Moon, PenLine, Sun, User } from "lucide-react";

const navLinks = [{ href: "/posts", label: "文章", icon: BookOpen }];

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const siteTitle = useConfigValue("title", siteConfig.title) || "博客";
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    setLogged(!!getToken());
  }, [pathname]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-black/40 backdrop-blur-xl">
      <nav className="mx-auto flex h-full max-w-5xl items-center justify-between px-5">
        <Link
          href="/posts"
          className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity"
        >
          {siteTitle}
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map(item => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-neutral-900/5 text-neutral-900 dark:bg-white/10 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {logged ? (
            <>
              <Link
                href="/write"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                <PenLine className="h-4 w-4" />
                写文章
              </Link>
              <Link
                href="/me"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                <User className="h-4 w-4" />
                我的
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <User className="h-4 w-4" />
              登录
            </Link>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="切换主题"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </nav>
    </header>
  );
}
