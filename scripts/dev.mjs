// npm run dev: 정적 화면(vite)과 실시간 서버(wrangler dev)를 같이 띄운다.
// 화면은 vite 주소로 열고, /ws는 vite가 wrangler(8787)로 넘겨준다 (vite.config.ts의 proxy).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// wrangler는 assets 폴더(dist)가 있어야 뜬다. 개발 중에는 화면을 vite가 내보내므로 비어 있어도 된다
if (!existsSync('dist')) {
  mkdirSync('dist');
  writeFileSync('dist/index.html', '<!doctype html><title>dev</title>');
}

const run = (command) => spawn(command, { stdio: 'inherit', shell: true });
const children = [run('npx wrangler dev --port 8787 --var DEBUG_GIFTS:1'), run('npx vite')];
const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', stop);
