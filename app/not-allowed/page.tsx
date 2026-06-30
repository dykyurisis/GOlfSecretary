export default function NotAllowed() {
  return (
    <main>
      <h1>접근 권한 없음</h1>
      <p>이 앱은 등록된 사용자만 사용할 수 있습니다.</p>
      <form action="/auth/signout" method="post"><button type="submit">로그아웃</button></form>
    </main>
  );
}
