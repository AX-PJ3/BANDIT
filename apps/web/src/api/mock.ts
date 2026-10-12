/**
 * Supabase 주소·키 없이 열었을 때 쓰는 예시 데이터 버전의 api예요.
 *
 * SilApi(types.ts)에 함수를 추가하면 여기에도 같은 이름으로 추가해요 (타입이 빠진 걸 알려 줘요).
 * 예시 데이터는 직접 만들지 말고 @sil/core의 쿠폰 예시(couponVersions 등)를 써요.
 * 모두가 같은 예시로 만들어야 10/13 통합 확인 때 모양이 맞아요.
 */
import { currentPlatform } from '../pwa.ts';
import type { SilApi } from './types.ts';

export const mockApi: SilApi = {
  getAppInfo: async () => ({
    version: __APP_VERSION__,
    platform: currentPlatform(),
    dataMode: 'mock',
    db: null,
  }),
};
