import { Placeholder } from './Placeholder.tsx';

/**
 * ① 나에게 온 변경 + 답하기 (꼭 만들 것, A2~A4)
 * openedCheckId는 알림(A1)을 눌러 연 확인할 변경 ID예요. 있으면 그 변경을 골라 상세(A3)를 보여 줘요 (app.notify.click-to-inbox).
 */
export function MyChangesScreen(props: { openedCheckId?: string | null }) {
  return (
    <Placeholder
      title="나에게 온 변경"
      issue="SIL-74"
      owner="호윤님 (디자인 신지님 SIL-69)"
      needs="결정 사항 버전, 확인할 변경, 이슈 연결, 응답 (SIL-41 정보 목록)"
      note={
        props.openedCheckId
          ? `알림에서 연 변경: ${props.openedCheckId}`
          : undefined
      }
    />
  );
}
