import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해서 어느 주소(Cloudflare, GitHub Pages 하위 주소)에서도 그대로 동작하게 한다
  base: './',
  server: {
    // 개발 중 실시간 서버: /ws를 wrangler dev(8787)의 Worker로 넘긴다
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
