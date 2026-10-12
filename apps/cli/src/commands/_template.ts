/**
 * 새 명령을 만들 때 복사해서 쓰는 본보기예요. 이 파일 자체는 등록되지 않아요.
 *
 * 1. 이 파일을 복사해요. 예: commands/brief.ts
 * 2. 이름, 설명, 옵션, action을 채워요.
 * 3. commands/index.ts 배열에 registerXxx를 넣어요.
 * 4. `pnpm sil <명령> --help`로 확인해요.
 *
 * 화면에 보여 줄 결과는 console.log, 진행 로그는 createLogger(stderr)로 남겨요.
 * Claude Code hook에서 불리는 명령은 stdout이 그대로 AI 작업 맥락에 들어가니 출력을 짧게 유지해요.
 */
import { NotImplementedError } from '@sil/core';
import type { Command } from 'commander';

export function registerExample(program: Command): void {
  program
    .command('example')
    .description('명령 설명 한 줄 (SIL-39 문구 규칙을 따라요)')
    .option('--json', '결과를 JSON으로 출력')
    .action((_options: { json?: boolean }) => {
      throw new NotImplementedError('sil example', 'SIL-xx');
    });
}
