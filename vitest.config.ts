// 테스트는 저장소 루트에서 한 번에 돌려요 (`pnpm test`).
// 각 패키지 src 안에 `*.test.ts` 파일을 두면 자동으로 찾아요.
// 알리기(@sil/notify)는 Node에 들어 있는 node:test를 써서 따로 돌려요 (`pnpm --filter @sil/notify test`).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'packages/notify/**'],
  },
});
