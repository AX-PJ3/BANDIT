// 세 기능이 함께 쓰는 표의 타입이에요. 칸은 착수 안내 "데이터 항목 목록 v2"를 따라요 (SIL-65).
// 기준(standard.ts), 이슈·확인할 변경·답(notify.ts), 예전 위키 불러오기(wiki-import.ts)
// 타입은 여기에만 정의해요. 다른 패키지에서 같은 모양을 다시 만들지 말고 가져다 써요 (SIL-17).
export type * from './common.js';
export type * from './person.js';
export type * from './standard.js';
export type * from './notify.js';
export type * from './detect.js';
export type * from './wiki-import.js';
