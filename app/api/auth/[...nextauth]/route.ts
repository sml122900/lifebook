// NextAuth(Auth.js) 의 OAuth 콜백·세션 핸들러 라우트. auth.ts 가 만든
// handlers 를 그대로 GET/POST 로 노출 — /api/auth/* 전부 여기로 들어온다.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
