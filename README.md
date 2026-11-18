# 크리스마스 광장

눈 내리는 유럽풍 밤 광장을 걸어 다니는 웹 픽셀 공간.

친구에게 보낼 한 줄: **https://christmas-square.ippuku-server.workers.dev — 방향키(휴대폰은 탭)로 광장을 걸어 보세요**

## 실행 방법

Node.js가 필요하다.

```bash
npm install
npm run dev     # 개발 서버 실행 후 브라우저에서 표시된 주소로 접속
npm run build   # 타입 검사 + dist/ 에 빌드
npm test        # 테스트 (vitest)
npm run deploy  # 빌드해서 Cloudflare Workers(christmas-square)에 정적 사이트로 올림
```

처음 한 번은 `npx wrangler login`으로 Cloudflare에 로그인해야 한다. 배포 주소: https://christmas-square.ippuku-server.workers.dev

작업 규칙은 [CLAUDE.md](CLAUDE.md) 참고.
