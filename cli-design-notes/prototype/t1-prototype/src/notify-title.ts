// 시안용 작업 파일: 운영체제 알림 제목을 자르는 곳
// 결정 사항 app.notify.title-length (앱 알림 제목은 40자 이하로 쓴다)를 따른다
export const MAX_TITLE_LENGTH = 40;

export function cutTitle(title: string): string {
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : title;
}
