import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";
import { uploadFile, deleteFile, cleanUrlPath, generateFileName } from "@/app/lib/r2";

function ensureR2PublicUrl(): void {
  if (!process.env.R2_PUBLIC_URL) {
    throw new Error(
      "R2_PUBLIC_URL 未配置。请为 Cloudflare R2 存储桶设置自定义域（Public URL），否则上传的图片无法在前台公开访问。"
    );
  }
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const payload = await getCurrentUser(request);
    const userId = parseInt(payload.sub as string);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 任何登录用户都可以上传图片（写文章时粘贴截图）
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "账号不存在" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "文件大小超过 10MB 限制" }, { status: 400 });
    }

    const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
    const filename = generateFileName(ext);
    const key = `uploads/${filename}`;

    const buffer = await file.arrayBuffer();

    // 上传前必须配置 R2 公开访问域名，否则图片无法在前台显示
    ensureR2PublicUrl();

    // 简易方向检测（Cloudflare 不支持 sharp 原生模块）
    let orientation = "landscape";
    // 后续可通过 Cloudflare Images 的 metadata 获取，这里默认 landscape

    const imageUrl = await uploadFile(key, buffer, file.type);

    return NextResponse.json({
      url: imageUrl,
      orientation,
    });
  } catch (err: any) {
    if (err.message === "未登录" || err.message === "无效的令牌") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Upload image error:", err);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await getCurrentUser(request);
    const userId = parseInt(payload.sub as string);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.is_admin) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) {
      return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
    }

    const key = cleanUrlPath(url);
    if (key.includes("..") || key.includes("\\")) {
      return NextResponse.json({ error: "非法文件名" }, { status: 400 });
    }

    await deleteFile(key);
    return NextResponse.json({ code: 0, message: "删除成功" });
  } catch (err: any) {
    console.error("Delete image error:", err);
    return NextResponse.json({ error: err.message || "删除失败" }, { status: 500 });
  }
}