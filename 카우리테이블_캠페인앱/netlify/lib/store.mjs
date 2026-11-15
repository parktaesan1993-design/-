// 데이터 저장소: Netlify에 배포되면 Netlify Blobs를 사용합니다.
// (로컬 테스트용으로 KAURI_FILE_STORE 환경변수가 있으면 파일에 저장합니다.)
import { getStore } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";

function fileStore(dir) {
  const file = (key) => path.join(dir, encodeURIComponent(key) + ".json");
  return {
    async get(key) {
      try { return JSON.parse(await fs.readFile(file(key), "utf8")); } catch { return null; }
    },
    async setJSON(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(value));
    },
    async delete(key) { try { await fs.unlink(file(key)); } catch {} },
    async list(prefix) {
      try {
        const names = await fs.readdir(dir);
        return names.map((n) => decodeURIComponent(n.replace(/\.json$/, ""))).filter((k) => k.startsWith(prefix));
      } catch { return []; }
    },
  };
}

function blobStore() {
  const s = getStore({ name: "kauri-campaign", consistency: "strong" });
  return {
    get: (key) => s.get(key, { type: "json" }),
    setJSON: (key, value) => s.setJSON(key, value),
    delete: (key) => s.delete(key),
    async list(prefix) {
      const { blobs } = await s.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

export function kauriStore() {
  return process.env.KAURI_FILE_STORE ? fileStore(process.env.KAURI_FILE_STORE) : blobStore();
}

// ---- 공통 도구 ----
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const cleanStore = (v) => (/^[a-z0-9-]{1,30}$/.test(String(v || "")) ? String(v) : "gwanghwamun");

export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// 너무 잦은 요청을 막습니다 (같은 접속 위치 기준).
export async function tooSoon(store, kind, ip, seconds) {
  const key = `rate/${kind}/${String(ip || "unknown").replace(/[^a-zA-Z0-9.:]/g, "_")}`;
  const last = await store.get(key);
  const now = Date.now();
  if (last && now - last.at < seconds * 1000) return true;
  await store.setJSON(key, { at: now });
  return false;
}

// 댓글에 쓰지 못하게 할 단어 (운영하며 추가해 주세요)
export const BLOCKED_WORDS = ["시발", "씨발", "병신", "개새끼", "좆", "꺼져", "카톡", "텔레그램", "http://", "https://", "www."];

// ---- 댓글 목록 ----
const MAX_LIST = 60;

export async function listComments(store, shop, { includeHidden = false } = {}) {
  const keys = (await store.list(`comments/${shop}/`)).sort().reverse();
  const items = await Promise.all(keys.slice(0, includeHidden ? 300 : MAX_LIST * 2).map((k) => store.get(k)));
  return items.filter(Boolean).filter((c) => includeHidden || !c.hidden).slice(0, includeHidden ? 300 : MAX_LIST);
}

