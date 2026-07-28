import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api/recommend 는 Python 추천 서비스(8000), 그 외 /api 는 Spring Boot(8080)로 프록시됩니다.
// Spring 쪽 임베딩 추천은 /api/reco 로 분리돼 있습니다 — 같은 이름을 쓰면 아래 규칙에
// 가려서 호출 자체가 안 됩니다(경로가 겹치면 더 구체적인 규칙이 항상 이깁니다).
// (더 구체적인 규칙을 먼저 선언해야 우선 매칭됩니다.)
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api/recommend': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/agent': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/portfolio': { target: 'http://localhost:8000', changeOrigin: true },
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true },
    }
  }
})
