/**
 * 웹 앱(브라우저)용 입구예요 (SIL-100). `import { … } from '@sil/notify/browser'`
 *
 * 패키지 전체 입구(index.ts)는 파일 저장소(store.ts의 node:fs)를 함께 내보내서 브라우저 빌드가 실패해요.
 * 여기서는 브라우저에서 도는 것만 내보내요: 목록 만들기, DB 값 바꾸기, 작업 반영 검사, 타입.
 * 새 함수를 여기 더할 때는 Node 전용 모듈을 (타입이 아닌 값으로) 가져오지 않는지 확인해요. browser.test.ts가 검사해요.
 */
export { CLOSED_VISIBLE_DAYS, buildPendingList } from './listPending.ts';
export type {
  ListPendingInput,
  ListPendingOptions,
  ListPendingResult,
  PendingItem,
  PendingItemAnswer,
  PendingItemIssue,
  PendingItemStandard,
  PreviousAnswer,
} from './listPending.ts';
export {
  loadNotifyData,
  toAnswers,
  toNotifyCheck,
  toVersionRecord,
} from './coreData.ts';
export type { NotifyDataSource } from './coreData.ts';
export { checkReflect } from './reflect.ts';
export type { ReflectErrorCode, ReflectFailure } from './reflect.ts';
export type { NotifyData } from './store.ts';
export type {
  Answer,
  AnswerChannel,
  IsoDateTime,
  Issue,
  IssueKey,
  IssueStatus,
  PendingCheck,
  PendingCheckStatus,
  StandardId,
  StandardSource,
  StandardVersionRecord,
} from './types.ts';
