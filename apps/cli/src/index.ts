import { Command } from 'commander';
import { commands } from './commands/index.ts';

// 명령어 이름과 도움말 문구는 부건님이 정해요 (SIL-39). 정해지면 각 명령 파일의 description만 바꾸면 돼요.
const program = new Command()
  .name('sil')
  .description('팀 위키 명령어')
  .version('0.0.0')
  .showHelpAfterError();

for (const register of commands) register(program);

await program.parseAsync();
