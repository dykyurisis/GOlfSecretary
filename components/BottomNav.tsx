import Link from 'next/link';

export default function BottomNav() {
  return (
    <nav style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, padding: '8px 0', borderTop: '1px solid #ddd', background: '#fff' }}>
      <Link className="btn" href="/">홈</Link>
      <Link className="btn" href="/companions">동반자</Link>
      <Link className="btn" href="/settings">설정</Link>
    </nav>
  );
}
