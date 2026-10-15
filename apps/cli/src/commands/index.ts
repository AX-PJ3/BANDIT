import type { Command } from 'commander';
import { registerBackup } from './backup.ts';
import { registerChangelog } from './changelog.ts';
import { registerDeprecate } from './deprecate.ts';
import { registerDoctor } from './doctor.ts';
import { registerExport } from './export.ts';
import { registerImport } from './import.ts';
import { registerScopeCheck } from './scope-check.ts';
import { registerSeedDemo } from './seed-demo.ts';

/**
 * 명령 목록이에요. 명령 하나 = 파일 하나 = 이 배열의 한 줄이에요.
 *
 * 앞으로 들어올 명령 (민수님, 문구는 부건님):
 * | 명령    | 하는 일                                         | 이슈            |
 * | brief   | 확인할 변경 보기. Claude Code를 켤 때 자동 실행  | SIL-28, SIL-21  |
 * | status  | 내 이슈와 이어진 기준 보기                       | SIL-29          |
 */
export const commands: Array<(program: Command) => void> = [
  registerDoctor,
  registerImport,
  registerDeprecate,
  registerChangelog,
  registerExport,
  registerBackup,
  registerScopeCheck,
  registerSeedDemo,
];
