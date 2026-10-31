import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { hashPassword, createToken, createRefreshToken } from "@/app/lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{3,20}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { code: 1, message: "用户名需 3-20 位，可用中英文、数字、下划线和短横线" },
        { status: 400 }
      );
    }
    if (password.length < 6 || password.length > 64) {
      return NextResponse.json(
        { code: 1, message: "密码需 6-64 位" },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { code: 1, message: "这个用户名已经被占了" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        username,
        hashed_password: hashPassword(password),
        nickname: username,
        is_admin: false
      }
    });

    // 注册后直接登录，省一次输入
    const payload = {
      sub: String(user.id),
      username: user.username,
      type: "user"
    };
    const accessToken = await createToken(payload);
    const refreshToken = await createRefreshToken(payload);

    return NextResponse.json({
      code: 0,
      message: "success",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          bio: user.bio
        }
      }
    });
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { code: 1, message: "注册失败，请稍后再试" },
      { status: 500 }
    );
  }
}
