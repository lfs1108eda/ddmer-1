import { post } from "@/router/enums";
const Layout = () => import("@/layout/index.vue");

export default {
  path: "/create",
  name: "Create",
  component: Layout,
  redirect: "/create/index",
  meta: {
    icon: "ri:quill-pen-line",
    title: "写文章",
    rank: post - 1
  },
  children: [
    {
      path: "/create/index",
      name: "CreateIndex",
      component: () => import("@/views/create/index.vue"),
      meta: {
        title: "写文章",
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
