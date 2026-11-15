// 퀴즈 문제 전달 + 쿠폰 발급 조건 안내
import { QUIZ } from "../lib/quiz.mjs";
import { json } from "../lib/store.mjs";

export default async () =>
  json({
    quiz: QUIZ,
    couponEnabled: process.env.COUPON_ENABLED !== "false",
  });

export const config = { path: "/api/quiz" };
