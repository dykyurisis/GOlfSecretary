# Golf Tee-Time Manager

미국 invited 골프장(Coto de Caza / Aliso Viejo / Old Ranch)의 빈 티타임을
**카카오톡으로 대화하며 조회하고 동반자를 지정해 예약**하는 개인용 도구.

## 구성

- **스킬서버** (Vercel / Next.js): 카카오 챗봇 웹훅, 의도 파싱(Claude), 오케스트레이션
- **워커** (Render/Fly / Node + Playwright): invited 자동 로그인·조회·예약
- **DB** (Supabase / Postgres): 사용자·자격증명(암호화)·동반자·예약 로그

## 문서

- 설계: [docs/superpowers/specs/2026-06-24-golf-teetime-manager-design.md](docs/superpowers/specs/2026-06-24-golf-teetime-manager-design.md)

## 상태

설계 단계 (v1 미착수).
