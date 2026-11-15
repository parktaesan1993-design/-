// 퀴즈를 모두 맞힌 고객에게 기한이 있는 쿠폰 번호를 발급합니다.
import { kauriStore, json, cleanStore, readBody, tooSoon } from "../lib/store.mjs";
import { allCorrect } from "../lib/quiz.mjs";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0,O,1,I 제외
const newCode = () => "KT-" + Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

// 만료 시각: 발급일로부터 COUPON_DAYS일째 되는 날 23:59(한국 시간). COUPON_END(YYYY-MM-DD)가 있으면 그날을 넘지 않습니다.
export function expiryFrom(nowMs) {
  const days = Math.max(1, parseInt(process.env.COUPON_DAYS || "14", 10) || 14);
  const kst = new Date(nowMs + 9 * 3600e3);
  const ymd = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + days - 1));
  let end = ymd.toISOString().slice(0, 10);
  const cap = process.env.COUPON_END;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cap || "") && cap < end) end = cap;
  return new Date(`${end}T23:59:59+09:00`).toISOString();
}

export default async (req, context) => {
  // 고객 화면에서 내 쿠폰의 사용 여부를 다시 확인합니다 (발급한 기기에서만).
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") || "").toUpperCase();
    const device = String(url.searchParams.get("device") || "");
    const store = kauriStore();
    const own = /^[a-z0-9]{12,40}$/.test(device) ? await store.get(`devices/${device}`) : null;
    if (!own || own.code !== code) return json({ error: "쿠폰을 찾을 수 없어요." }, 404);
    const c = await store.get(`coupons/${code}`);
    return c ? json({ coupon: publicCoupon(c) }) : json({ error: "쿠폰을 찾을 수 없어요." }, 404);
  }
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, 405);
  if (process.env.COUPON_ENABLED === "false") return json({ error: "지금은 쿠폰 발급 기간이 아니에요." }, 403);

  const store = kauriStore();
  const body = await readBody(req);
  const shop = cleanStore(body.store);
  const device = String(body.device || "");
  if (!/^[a-z0-9]{12,40}$/.test(device)) return json({ error: "잘못된 요청입니다." }, 400);
  if (!allCorrect(body.answers)) return json({ error: "퀴즈를 모두 맞혀야 쿠폰을 받을 수 있어요." }, 400);

  // 같은 기기에는 쿠폰을 한 번만 발급합니다.
  const deviceKey = `devices/${device}`;
  const existing = await store.get(deviceKey);
  if (existing) {
    const c = await store.get(`coupons/${existing.code}`);
    if (c) return json({ coupon: publicCoupon(c), again: true });
  }
  if (await tooSoon(store, "coupon", context?.ip, 10)) return json({ error: "잠시 후 다시 시도해 주세요." }, 429);

  let code = newCode();
  for (let i = 0; i < 5 && (await store.get(`coupons/${code}`)); i++) code = newCode();
  const now = Date.now();
  const coupon = { code, store: shop, issuedAt: new Date(now).toISOString(), expiresAt: expiryFrom(now), usedAt: null };
  await store.setJSON(`coupons/${code}`, coupon);
  await store.setJSON(deviceKey, { code });
  return json({ coupon: publicCoupon(coupon) }, 201);
};

const publicCoupon = ({ code, issuedAt, expiresAt, usedAt }) => ({ code, issuedAt, expiresAt, used: !!usedAt });

export const config = { path: "/api/coupon" };
