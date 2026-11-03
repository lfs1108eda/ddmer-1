import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

async function findUser(name: string) {
  const decoded = decodeURIComponent(name);
  return prisma.user.findFirst({
    where: {
      OR: [{ username: decoded }, { nickname: decoded }]
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
      bio: true,
      created_at: true
    }
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  const user = await findUser(name).catch(() => null);
  if (!user) return { title: "用户不存在" };
  const display = user.nickname || user.username;
  return {
    title: display,
    description: user.bio || `${display} 的主页`
  };
}

export default async function UserPage({ params }: Params) {
  const { name } = await params;
  const user = await findUser(name).catch(() => null);
  if (!user) notFound();

  const posts = await prisma.post.findMany({
    where: { author_id: user.id, status: "published" },
    orderBy: [{ published_at: "desc" }, { created_at: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      cover: true,
      reading_time: true,
      views: true,
      created_at: true,
      published_at: true
    }
  });

  const display = user.nickname || user.username;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <section className="flex items-center gap-5 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1e]">
        <UserAvatar src={user.avatar} name={display} size={72} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{display}</h1>
          <p className="mt-1 text-xs text-neutral-400">
            @{user.username} · 加入于{" "}
            {new Date(user.created_at).toLocaleDateString("zh-CN")}
          </p>
          {user.bio && (
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              {user.bio}
            </p>
          )}
        </div>
      </section>

      <h2 className="mb-3 mt-8 text-sm font-medium text-neutral-500">
        发布的文章（{posts.length}）
      </h2>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 p-10 text-center text-sm text-neutral-500 dark:border-white/15">
          还没有发布文章
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map(post => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.slug}`}
                className="flex items-start gap-4 rounded-2xl border border-black/10 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#1c1c1e]"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug line-clamp-2">
                    {post.title}
                  </h3>
                  {post.description && (
                    <p className="mt-1.5 text-xs leading-5 text-neutral-500 line-clamp-2 dark:text-neutral-400">
                      {post.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-neutral-400">
                    <span>
                      {new Date(
                        post.published_at ?? post.created_at
                      ).toLocaleDateString("zh-CN")}
                    </span>
                    <span>{post.reading_time || 1} 分钟</span>
                    <span>{post.views} 阅读</span>
                  </div>
                </div>
                {post.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.cover}
                    alt={post.title}
                    className="h-16 w-24 shrink-0 rounded-lg object-cover"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
