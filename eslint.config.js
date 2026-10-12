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
  eslintConfigPrettier,
);
