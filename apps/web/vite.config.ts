/**
 * 웹 앱(PWA) 설정이에요 (SIL-65 조건 11, D50, D52).
 *
 * - 데이터: 저장소 루트 .env(또는 배포한 곳의 환경 변수)에서 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY 두 값만 화면에 넣어요.
 *   공용 키는 읽기와 저장 함수만 되는 키라 화면에 넣어도 돼요 (D21). MCP 토큰 같은 다른 값은 넣지 않아요.
 *   두 값이 없으면 예시 데이터로 열려요 (src/api/index.ts).
 * - PWA: public/의 manifest.webmanifest, sw.js, icons/가 그대로 배포돼요. 서비스 워커는 배포본에서만 등록해요 (src/pwa.ts).
 *   빌드가 끝나면 serviceWorkerPrecache가 dist/sw.js에 저장할 파일 목록을 넣어요.
 * - 주소: base를 './'로 둬서 어느 경로에 올려도 열려요 (예: https://<팀>.github.io/HARIBO/ 같은 하위 경로).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

/**
 * dist/sw.js의 `const BUILD = 'dev';`와 `const PRECACHE = [];`를 채워요.
 * - PRECACHE: dist 안 파일 전부(sw.js, index.html 빼고). index.html은 서비스 워커가 './'로 따로 저장해요.
 * - BUILD: 그 파일들과 index.html 내용으로 만든 번호. 하나라도 바뀌면 서비스 워커가 새 저장 이름으로 다시 받아요.
 * 두 줄을 못 찾으면 빌드를 멈춰요. 조용히 넘어가면 오프라인 첫 실행이 빈 화면이 돼요.
 */
function serviceWorkerPrecache(): Plugin {
  let outDir = '';
  return {
    name: 'haribo-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((file) => relative(outDir, file).split(sep).join('/'))
        .filter(
          (path) =>
            path !== 'sw.js' && path !== 'index.html' && !path.endsWith('.map'),
        )
        .sort();
      const hash = createHash('sha256');
      for (const path of ['index.html', ...files]) {
        hash.update(path).update(readFileSync(join(outDir, path)));
      }
      const build = hash.digest('hex').slice(0, 12);

      const swPath = join(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf8');
      const filled = source
        .replace("const BUILD = 'dev';", `const BUILD = '${build}';`)
        .replace(
          'const PRECACHE = [];',
          `const PRECACHE = ${JSON.stringify(files)};`,
        );
      if (
        !filled.includes(`'${build}'`) ||
        filled.includes('const PRECACHE = [];')
      ) {
        throw new Error(
          "dist/sw.js에서 `const BUILD = 'dev';`나 `const PRECACHE = [];` 줄을 못 찾았어요. public/sw.js의 두 줄을 그대로 두세요.",
        );
      }
      writeFileSync(swPath, filled);
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

export default defineConfig(({ mode }) => {
  // 셋째 인자 ''는 접두어 없이 읽는다는 뜻이에요. 읽은 것 중 아래 두 값만 화면에 넣어요.
  const env = loadEnv(mode, repoRoot, '');
  return {
    base: './',
    plugins: [react(), serviceWorkerPrecache()],
    server: { port: 5173 },
    preview: { port: 4173 },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      'import.meta.env.SIL_SUPABASE_URL': JSON.stringify(
        env.SUPABASE_URL ?? '',
      ),
      'import.meta.env.SIL_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.SUPABASE_PUBLISHABLE_KEY ?? '',
      ),
    },
  };
});
