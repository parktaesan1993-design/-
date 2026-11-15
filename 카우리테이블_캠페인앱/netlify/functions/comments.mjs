// 고객 댓글: 목록 보기(GET), 남기기(POST)
import { kauriStore, json, cleanStore, readBody, tooSoon, BLOCKED_WORDS, listComments } from "../lib/store.mjs";

export default async (req, context) => {
  const store = kauriStore();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const shop = cleanStore(url.searchParams.get("store"));
    const list = await listComments(store, shop);
    return json({
      comments: list.map(({ id, nick, text, createdAt, likes }) => ({ id, nick, text, createdAt, likes: likes || 0 })),
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const shop = cleanStore(body.store);
    const text = String(body.text || "").replace(/\s+/g, " ").trim();
    const nick = String(body.nick || "").replace(/\s+/g, " ").trim().slice(0, 12) || "익명의 독자";

    if (text.length < 2) return json({ error: "댓글을 두 글자 이상 적어 주세요." }, 400);
    if (text.length > 200) return json({ error: "댓글은 200자까지 남길 수 있어요." }, 400);
    const lower = (text + " " + nick).toLowerCase();
    if (BLOCKED_WORDS.some((w) => lower.includes(w))) {
      return json({ error: "사용할 수 없는 표현이 들어 있어요. 내용을 다듬어 다시 남겨 주세요." }, 400);
    }
    if (await tooSoon(store, "comment", context?.ip, 30)) {
      return json({ error: "잠시 후 다시 남겨 주세요." }, 429);
    }

    const now = Date.now();
    const id = `${String(now).padStart(14, "0")}-${Math.random().toString(36).slice(2, 8)}`;
    const comment = { id, store: shop, nick, text, createdAt: new Date(now).toISOString(), likes: 0, hidden: false };
    await store.setJSON(`comments/${shop}/${id}`, comment);
    return json({ comment: { id, nick, text, createdAt: comment.createdAt, likes: 0 } }, 201);
  }

  return json({ error: "지원하지 않는 요청입니다." }, 405);
};

export const config = { path: "/api/comments" };
