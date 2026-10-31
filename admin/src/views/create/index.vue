<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { pinyin } from "pinyin-pro";
import type VditorType from "vditor";
import { message } from "@/utils/message";
import Vditor from "@/views/markdown/components/Vditor.vue";
import { createPost, updatePost, getPostById } from "@/api/post";
import { getCategories, type CategoryItem } from "@/api/category";
import { getTags, type TagItem } from "@/api/tag";
import { uploadImage } from "@/api/upload";

defineOptions({ name: "PostCreate" });

const router = useRouter();

const titleRef = ref<HTMLInputElement>();
const editorIns = ref<VditorType | null>(null);
const saving = ref(false);
const uploading = ref(false);

const form = ref({
  title: "",
  slug: "",
  description: "",
  content: "",
  cover: "",
  category_id: null as number | null,
  tags: [] as string[],
  status: "draft"
});

const categoryList = ref<CategoryItem[]>([]);
const tagList = ref<TagItem[]>([]);

const wordCount = computed(() => {
  const plain = form.value.content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#>*`\-|\n\r\s]/g, "");
  return plain.length;
});

const readingTime = computed(() => Math.max(1, Math.ceil(wordCount.value / 400)));

/** 粘贴 / 拖拽图片时自动上传，返回 markdown 片段 */
async function handleUpload(files: File[]): Promise<string> {
  const images = files.filter(f => f.type.startsWith("image/"));
  if (!images.length) {
    message("目前只支持图片", { type: "warning" });
    return null;
  }
  uploading.value = true;
  const parts: string[] = [];
  try {
    for (const file of images) {
      const res = await uploadImage(file);
      const url = res?.url;
      if (!url) continue;
      parts.push(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`);
    }
  } catch {
    message("图片上传失败，请重试", { type: "error" });
  } finally {
    uploading.value = false;
  }
  return parts.length ? parts.join("\n\n") : null;
}

const editorOptions = {
  mode: "ir",
  height: "auto",
  minHeight: 460,
  placeholder: "开始写作…  支持直接粘贴截图 / 拖拽图片，Ctrl+S 存草稿，Ctrl+Enter 发布",
  cache: { enable: false },
  counter: { enable: true, type: "markdown" },
  toolbar: [
    "headings",
    "bold",
    "italic",
    "strike",
    "|",
    "list",
    "ordered-list",
    "check",
    "|",
    "quote",
    "line",
    "code",
    "inline-code",
    "|",
    "upload",
    "link",
    "table",
    "|",
    "undo",
    "redo",
    "preview",
    "fullscreen"
  ],
  upload: {
    accept: "image/*",
    multiple: true,
    handler: handleUpload
  },
  preview: {
    hljs: { enable: true, style: "github", lineNumber: true },
    math: { engine: "KaTeX" },
    markdown: { toc: true }
  }
};

function autoSlug() {
  if (form.value.slug || !form.value.title) return;
  const arr = pinyin(form.value.title, { toneType: "none", type: "array" });
  const raw = arr
    .map(s => s.toLowerCase())
    .join("-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  form.value.slug = raw || `post-${Date.now()}`;
}

function onAfter(ins: VditorType) {
  editorIns.value = ins;
  bindShortcut();
}

function bindShortcut() {
  const el = editorIns.value?.vditor?.element;
  if (!el) return;
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      save("draft");
    }
    if (e.key === "Enter") {
      e.preventDefault();
      save("published");
    }
  });
}

async function save(status: "draft" | "published") {
  if (!form.value.title.trim()) {
    message("请先填写标题", { type: "warning" });
    titleRef.value?.focus();
    return;
  }
  autoSlug();
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      status,
      word_count: wordCount.value,
      reading_time: readingTime.value
    };
    await createPost(payload);
    message(status === "published" ? "发布成功" : "草稿已保存", {
      type: "success"
    });
    router.push("/post/index");
  } catch (e: any) {
    message(e?.message || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

function handleCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  uploadImage(file)
    .then(res => {
      if (res?.url) form.value.cover = res.url;
    })
    .catch(() => message("封面上传失败", { type: "error" }))
    .finally(() => (uploading.value = false));
}

onMounted(async () => {
  try {
    const [cats, tags] = await Promise.all([getCategories(), getTags()]);
    categoryList.value = [...cats].sort((a, b) => a.sort - b.sort);
    tagList.value = tags;
  } catch {
    /* 忽略：分类/标签加载失败不阻塞写作 */
  }
  titleRef.value?.focus();
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-2 py-4">
    <div class="mb-4 flex items-center justify-between gap-3">
      <el-button text @click="router.push('/post/index')">← 返回</el-button>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400">
          {{ wordCount }} 字 · 约 {{ readingTime }} 分钟
        </span>
        <el-button :loading="saving" @click="save('draft')">存草稿</el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="save('published')"
        >
          发布
        </el-button>
      </div>
    </div>

    <div class="flex flex-col gap-5 lg:flex-row">
      <!-- 写作区 -->
      <div class="min-w-0 flex-1">
        <input
          ref="titleRef"
          v-model="form.title"
          type="text"
          placeholder="输入标题…"
          class="w-full border-0 bg-transparent px-1 py-3 text-3xl font-bold tracking-tight outline-none placeholder:text-gray-300"
          @blur="autoSlug"
        />
        <div class="mb-3 px-1 text-xs text-gray-400">
          slug：{{ form.slug || "自动生成" }}
        </div>

        <div class="rounded-xl bg-white p-2 shadow-sm dark:bg-[#1c1c1e]">
          <Vditor
            v-model="form.content"
            :options="editorOptions"
            @after="onAfter"
          />
        </div>
      </div>

      <!-- 设置区 -->
      <aside class="w-full shrink-0 lg:w-72">
        <div class="space-y-4 rounded-xl bg-white p-4 shadow-sm dark:bg-[#1c1c1e]">
          <div>
            <div class="mb-2 text-xs font-medium text-gray-500">封面</div>
            <div
              class="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 hover:border-blue-400"
              @click="($refs.coverInput as HTMLInputElement)?.click()"
            >
              <img
                v-if="form.cover"
                :src="form.cover"
                class="h-full w-full object-cover"
                alt="封面"
              />
              <span v-else>{{ uploading ? "上传中…" : "点击上传封面" }}</span>
            </div>
            <input
              ref="coverInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleCoverChange"
            />
          </div>

          <div>
            <div class="mb-2 text-xs font-medium text-gray-500">分类</div>
            <el-select
              v-model="form.category_id"
              placeholder="选择分类"
              clearable
              class="w-full"
            >
              <el-option
                v-for="c in categoryList"
                :key="c.id"
                :label="c.name"
                :value="c.id"
              />
            </el-select>
          </div>

          <div>
            <div class="mb-2 text-xs font-medium text-gray-500">标签</div>
            <el-select
              v-model="form.tags"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入标签"
              class="w-full"
            >
              <el-option
                v-for="t in tagList"
                :key="t.id"
                :label="t.name"
                :value="t.name"
              />
            </el-select>
          </div>

          <div>
            <div class="mb-2 text-xs font-medium text-gray-500">摘要</div>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="3"
              placeholder="一句话介绍这篇文章（可留空）"
            />
          </div>
        </div>

        <p class="mt-3 px-1 text-[11px] leading-5 text-gray-400">
          Ctrl+S 存草稿 · Ctrl+Enter 发布<br />
          粘贴截图会自动上传并插入正文
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
:deep(.vditor) {
  border: none;
}
:deep(.vditor-toolbar) {
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
}
:deep(.vditor-ir) {
  min-height: 460px;
}
</style>
