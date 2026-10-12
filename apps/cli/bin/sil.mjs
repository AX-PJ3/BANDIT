#!/usr/bin/env node
// `sil` 명령어 시작 파일이에요. Node 24.18이 TypeScript를 빌드 없이 바로 실행해요 (D48).
// (Claude Code SessionStart hook처럼 다른 폴더에서 불려도 이 파일 위치 기준으로 동작해요.)
if (!process.features.typescript) {
  console.error(
    `Node ${process.versions.node}에서는 TypeScript를 바로 실행할 수 없어요. 저장소 폴더에서 \`nvm use\`로 Node 24.18을 써 주세요.`,
  );
  process.exit(1);
}
await import('../src/index.ts');
