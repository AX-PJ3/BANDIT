/**
 * 화면과 데이터 사이의 약속이에요.
 *
 * 왜 이 파일이 따로 있나요:
 * - 화면 담당(신지님)과 데이터 담당(정민님)이 이 인터페이스 하나만 맞추면 서로 기다리지 않고 따로 만들 수 있어요.
 *   화면은 예시 데이터(mock.ts)로 먼저 만들고, 데이터는 database.ts에 붙이고, 합치는 날 바꿀 코드가 없어요.
 *
 * 함수를 추가하는 순서:
 * 1. 아래 SilApi에 함수 타입을 추가해요
 * 2. database.ts에 실제 동작을 넣어요 (데이터는 '@sil/core/data' 함수로. 화면에서 '@sil/core/node'는 쓰지 않아요)
 * 3. mock.ts에 예시 데이터 버전을 넣어요 (타입이 빠진 걸 알려 줘요)
 */
import type { DataMode } from '@sil/core';

export interface AppInfo {
  version: string;
  /** 'installed'는 PWA로 설치한 앱 창, 'browser'는 브라우저 탭이에요 */
  platform: 'browser' | 'installed';
  /** 'mock'은 Supabase 주소·키 없이 예시 데이터로 열었을 때예요 */
  dataMode: DataMode | 'mock';
  /**
   * DB에 붙었는지예요. 예시 데이터면 null이에요.
   * 못 붙었으면 이유를 그대로 보여 줘요. 실패를 "변경 없음"처럼 숨기지 않아요 (notify.error.not-empty).
   */
  db:
    { ok: true; standardCount: number } | { ok: false; message: string } | null;
}

export interface SilApi {
  getAppInfo(): Promise<AppInfo>;
}
