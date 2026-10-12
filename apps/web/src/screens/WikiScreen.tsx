import { Placeholder } from './Placeholder.tsx';

/** ② 위키: 영역별 목록, 결정 사항 상세, 버전 기록. 되돌리기 버튼은 만들지 않아요. 되돌리기는 MCP 도구로만 해요 (app.screen.no-revert-button) */
export function WikiScreen() {
  return (
    <Placeholder
      title="위키"
      issue="SIL-44"
      owner="신지님"
      needs="결정 사항, 결정 사항 버전 (SIL-41 정보 목록)"
    />
  );
}
