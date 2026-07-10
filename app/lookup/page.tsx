import { createLookup } from './actions';

export default function LookupPage() {
  return (
    <main>
      <h1>티타임 조회 — Coto de Caza</h1>
      <form action={createLookup}>
        <label>날짜 <input type="date" name="date" required /></label>
        <button type="submit">조회</button>
      </form>
    </main>
  );
}
