import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{3,20}$/;

function publicUser(user: {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  bio: string;
  is_admin: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    bio: user.bio,
    is_admin: user.is_admin
  };
}

export async function GET(request: Request) {
  try {
    const me: any = await getCurrentUser(request);
    const user = await prisma.user.findUnique({
      where: { id: Number(me.sub) }
    });
    if (!user) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 });
    }
    return NextResponse.json({ code: 0, data: publicUser(user) });
  } catch {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const me: any = await getCurrentUser(request);
    const userId = Number(me.sub);
    const body = await request.json();

    const data: Record<string, unknown> = {};

    if (body.nickname !== undefined) {
      const nickname = String(body.nickname).trim();
      if (nickname.length > 20) {
        return NextResponse.json(
          { error: "显示名最多 20 个字" },
          { status: 400 }
        );
      }
      data.nickname = nickname;
    }

    if (body.bio !== undefined) {
      data.bio = String(body.bio).slice(0, 200);
    }

    if (body.avatar !== undefined) {
      data.avatar = String(body.avatar).slice(0, 500);
    }

    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (!USERNAME_RE.test(username)) {
        return NextResponse.json(
          { error: "登录名需 3-20 位，可用中英文、数字、下划线和短横线" },
          { status: 400 }
        );
      }
      const taken = await prisma.user.findFirst({
        where: { username, id: { not: userId } }
      });
      if (taken) {
        return NextResponse.json({ error: "这个登录名已经被占了" }, { status: 409 });
      }
      data.username = username;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "没有要修改的内容" }, { status: 400 });
    }

    const before = await prisma.user.findUnique({ where: { id: userId } });

    const updated = await prisma.user.update({
      where: { id: userId },
      data
    });

    // 改了显示名或头像：把本人发过的评论一起更新（评论里存的是名字快照）
    if (before && (data.nickname !== undefined || data.avatar !== undefined)) {
      const oldNames = [before.nickname, before.username].filter(Boolean);
      if (oldNames.length) {
        await prisma.comment.updateMany({
          where: {
            github_user_id: null,
            email_user_name: { in: oldNames }
          },
          data: {
            email_user_name: updated.nickname || updated.username,
            email_user_avatar: updated.avatar || ""
          }
        });
      }
    }

    return NextResponse.json({ code: 0, data: publicUser(updated) });
  } catch (err: any) {
    if (err?.message === "未登录" || err?.message === "无效的令牌") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("PATCH /api/auth/profile error:", err);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
