// 댓글 공감 (+1 / 취소 -1)
import { kauriStore, json, cleanStore, readBody } from "../lib/store.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, 405);
  const store = kauriStore();
  const body = await readBody(req);
  const shop = cleanStore(body.store);
  const id = String(body.id || "");
  if (!/^[0-9]{14}-[a-z0-9]{1,8}$/.test(id)) return json({ error: "잘못된 요청입니다." }, 400);

  const key = `comments/${shop}/${id}`;
  const c = await store.get(key);
  if (!c || c.hidden) return json({ error: "댓글을 찾을 수 없어요." }, 404);
  c.likes = Math.max(0, (c.likes || 0) + (body.undo ? -1 : 1));
  await store.setJSON(key, c);
  return json({ likes: c.likes });
};

export const config = { path: "/api/like" };
