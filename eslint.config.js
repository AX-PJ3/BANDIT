import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', 'team-wiki/', 'samples/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // MCP 서버의 로그는 @sil/core/node의 createLogger로만 남겨요 (시각·수준·범위가 같은 모양으로 남아서 호스팅 로그에서 찾기 쉬워요).
    files: ['apps/mcp-server/src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // 웹 앱 화면은 브라우저에서 돌아요. DB는 '@sil/core/data'로만 읽고, Node 전용 '@sil/core/node'는 가져오지 않아요 (D50).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@sil/core/node',
              message:
                '화면에서는 브라우저에서도 도는 @sil/core/data를 써요 (D50).',
            },
          ],
        },
      ],
    },
  },
  {
    // PWA 서비스 워커예요. 브라우저 창이 아니라 서비스 워커 환경에서 돌아요.
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  eslintConfigPrettier,
);
