// 세 기능이 함께 쓰는 타입이에요. 다른 패키지는 같은 모양을 다시 만들지 않고 여기서 가져다 써요.
// 예: import type { PendingCheck, StandardVersion } from '@sil/core';
// 칸 하나하나의 뜻과 DB 칸 이름은 docs/타입명세서.md에 있어요.
// 에러·규칙 상수·DB 함수는 다음 PR에서 이 패키지에 더해요.
export type * from './types/index.js';
