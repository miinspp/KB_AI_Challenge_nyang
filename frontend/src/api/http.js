// ─────────────────────────────────────────────
// Spring Boot 연동 기반 fetch 헬퍼.
// vite.config.js 의 프록시가 /api → http://localhost:8080 으로 전달합니다.
// VITE_API_BASE 를 지정하면 절대 주소로도 호출할 수 있습니다.
// ─────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_BASE || '';

export async function req(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    let msg = `요청 실패 (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body && body.message) msg = body.message;
    } catch { /* JSON 아님 — 기본 메시지 유지 */ }
    throw new Error(msg);
  }
  return res.json();
}

export const getJson = (path) => req(path);

export const postJson = (path, payload) =>
  req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
