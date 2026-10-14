// '@sil/core/data' 입구예요. 브라우저(웹 앱)와 Node 모두에서 도는 DB 연결과 읽기·쓰기예요 (D50).
// 웹 앱은 connectDb(주소, 공용 키)로 연결한 뒤 이 함수를 써요.
// Node(MCP 서버, 명령어)는 '@sil/core/node'에서 같은 함수를 가져와요. 그쪽은 .env로 알아서 연결해요.
export * from './client.ts';
export * from './standards.ts';
export * from './notify.ts';
