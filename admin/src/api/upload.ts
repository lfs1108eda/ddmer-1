import { http } from "@/utils/http";

export const getPresignedUrl = (data: {
  filename: string;
  contentType: string;
  prefix?: string;
}) => {
  return http.request<{ url: string; key: string }>(
    "post",
    "/api/upload/presigned",
    { data }
  );
};

export type UploadResult = { url: string; orientation?: string };

/** 直接上传图片到对象存储，返回可公开访问的 URL */
export const uploadImage = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return http.request<UploadResult>("post", "/api/upload/image", {
    data: formData,
    timeout: 120000
  });
};
