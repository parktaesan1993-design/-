// 직원 전용: 쿠폰 확인·사용 처리, 댓글 숨김/복구, 현황 (관리자 PIN 필요)
import { kauriStore, json, cleanStore, readBody, listComments } from "../lib/store.mjs";

function status(c) {
  if (!c) return "none";
  if (c.usedAt) return "used";
  if (Date.now() > Date.parse(c.expiresAt)) return "expired";
  return "valid";
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, 405);
  const PIN = process.env.ADMIN_PIN;
  if (!PIN) return json({ error: "관리자 PIN이 아직 설정되지 않았어요. 배포 가이드를 확인해 주세요." }, 503);

  const store = kauriStore();
  const body = await readBody(req);
  if (String(body.pin || "") !== PIN) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: "PIN이 맞지 않아요." }, 401);
  }

  const shop = cleanStore(body.store);
  const code = String(body.code || "").toUpperCase().replace(/\s/g, "");
  const codeKey = /^KT-[A-Z0-9]{6}$/.test(code) ? `coupons/${code}` : null;

  switch (body.action) {
    case "login":
      return json({ ok: true });

    case "check": {
      if (!codeKey) return json({ status: "none" });
      const c = await store.get(codeKey);
      return json({ status: status(c), coupon: c });
    }

    case "redeem": {
      if (!codeKey) return json({ error: "쿠폰 번호 형식이 맞지 않아요." }, 400);
      const c = await store.get(codeKey);
      const s = status(c);
      if (s !== "valid") return json({ status: s, coupon: c, error: "사용할 수 없는 쿠폰이에요." }, 409);
      c.usedAt = new Date().toISOString();
      c.usedStore = shop;
      await store.setJSON(codeKey, c);
      return json({ status: "used", coupon: c });
    }

    case "comments": {
      const list = await listComments(store, shop, { includeHidden: true });
      return json({ comments: list });
    }

    case "hide":
    case "show": {
      const id = String(body.id || "");
      if (!/^[0-9]{14}-[a-z0-9]{1,8}$/.test(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const key = `comments/${shop}/${id}`;
      const c = await store.get(key);
      if (!c) return json({ error: "댓글을 찾을 수 없어요." }, 404);
      c.hidden = body.action === "hide";
      await store.setJSON(key, c);
      return json({ comment: c });
    }

    case "stats": {
      const keys = await store.list("coupons/");
      const all = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean).filter((c) => c.store === shop);
      const comments = await listComments(store, shop, { includeHidden: true });
      return json({
        coupons: { issued: all.length, used: all.filter((c) => c.usedAt).length },
        comments: { total: comments.length, hidden: comments.filter((c) => c.hidden).length },
      });
    }

    default:
      return json({ error: "알 수 없는 요청입니다." }, 400);
  }
};

export const config = { path: "/api/admin" };
