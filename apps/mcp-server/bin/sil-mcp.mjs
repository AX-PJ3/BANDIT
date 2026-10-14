#!/usr/bin/env node
// MCP 서버(Streamable HTTP)를 켜는 파일이에요. 내 컴퓨터에서도, 호스팅에서도 이 파일 하나로 켜요.
//
// 왜 .mjs 한 장을 따로 두나요:
// - Node 24.18이 TypeScript를 빌드 없이 바로 실행해요 (D48). 그 전에 이 Node가 TypeScript를 읽을 수 있는지 먼저 확인해요.
// - 빌드 단계가 없으니 "고쳤는데 옛날 결과가 실행됨" 같은 일이 없어요.
if (!process.features.typescript) {
  console.error(
    `Node ${process.versions.node}에서는 TypeScript를 바로 실행할 수 없어요. Node 24.18로 켜 주세요 (저장소의 .nvmrc).`,
  );
  process.exit(1);
}
await import('../src/index.ts');
