/** 아직 만들지 않은 화면 자리 표시예요. 화면을 만들면 이 컴포넌트는 지워요. */
export function Placeholder(props: {
  title: string;
  issue: string;
  owner: string;
  needs: string;
  note?: string;
}) {
  return (
    <section className="placeholder">
      <h1>{props.title}</h1>
      <p>
        이 화면은 {props.issue}에서 만들어요 · 담당 {props.owner}
      </p>
      <p className="muted">필요한 데이터: {props.needs}</p>
      {props.note && <p>{props.note}</p>}
    </section>
  );
}
