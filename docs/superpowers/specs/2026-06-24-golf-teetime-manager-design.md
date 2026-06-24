# 골프 티타임 비서 — 설계 문서 (v1)

- 작성일: 2026-06-24
- 상태: 승인 대기 (사용자 리뷰 전)

## 1. 개요 / 목적

미국 오렌지카운티 3개 회원제 골프장(**Coto de Caza, Aliso Viejo, Old Ranch**, 모두 `invitedclubs.com` 운영)의
빈 티타임을 **카카오톡으로 비서처럼 대화하며 조회하고, 동반자를 지정해 예약까지 실행**하는 개인용 도구.

- 사용자: 부부 2명 (daeyoung71@gmail.com / jsyune0517@gmail.com)
- 각 사용자는 클럽마다 **별도의 invited 로그인**을 가짐 → 2명 × 3클럽 = **자격증명 6세트**
- 한국 트리니티클럽(`trinityclub.co.kr`)은 **v1 범위 밖**, 차기 단계에서 `provider=trinity`로 확장

## 2. 핵심 기술 전제 (제약)

1. **invited는 공개 API가 없음** → 사용자 계정으로 **대신 로그인하는 헤드리스 브라우저 자동화(Playwright)** 가 유일한 수단.
   사이트 구조 변경·봇 차단에 깨질 수 있는 본질적 취약성을 가짐.
2. invited 로그인은 (확인된 바) **아이디/비밀번호만**으로 진행 — OTP·캡차 없음. (변동 시 자동화 재검토 필요)
3. **카카오톡 챗봇 응답 시간 제한**: 일반 응답 ~5초. 그보다 오래 걸리는 작업은 **콜백(callback) 기능**(약 1분 비동기)으로
   "처리 중…" 후 결과를 이어 전송. → **알림톡/사업자등록 불필요.**
4. **Vercel 서버리스는 장시간·헤드리스 브라우저에 부적합** → 자동화는 **전용 워커 서비스**에서 실행.

## 3. 목표 / 비목표

**v1 목표**
- 카카오톡에서 자연어로 빈 티타임 **조회**
- 동반자(멤버/게스트) 지정 후 **예약 실행** (반자동: 사용자가 대화 중 최종 확인 → 앱이 실제 예약 완료)
- 자주 함께 치는 사람 **동반자 DB** 저장·호출
- 미국 3클럽 × 2계정 전부 지원

**v1 비목표 (차기)**
- 조건 무인 자동예약("스나이핑")·열림 알림 푸시
- 한국 트리니티클럽
- 웹뷰(웹페이지) — v1은 카카오 버튼/카루셀로 처리
- 본인·아내 외 사용자, 결제

## 4. 범위 / 빌드 순서

최종 v1은 3클럽 × 2계정 전부지만, 자동화 취약성 때문에 **작게 증명 후 확장**한다.

1. **스파이크**: 워커가 *Coto + 당신 계정*으로 로그인·빈 티타임 조회가 실제 되는지 증명 (봇 차단/구조 파악, 클럽별 예약 오픈 N일 확인)
2. 카카오 **조회 E2E** (콜백 패턴) — Coto + 당신 계정
3. **예약 실행 + 동반자 DB** — Coto + 당신 계정
4. **확장**: Aliso Viejo / Old Ranch + 아내 계정(아내 카카오ID·자격증명)
5. (이후) 트리니티 · 자동 알림 · 웹뷰

## 5. 아키텍처

```
[카카오톡]  ──webhook──▶  [Vercel: 카카오 스킬서버 (Next.js / TS)]
 (당신/아내)                 ① 카카오ID 화이트리스트(2개)만 통과
                            ② 자연어 의도 파싱 (Claude API, Haiku)
                            ③ 워커 HTTP 호출(+callbackUrl 전달), 카카오엔 useCallback 응답
                                       │
                                       ▼
                          [워커 서비스: Render/Fly/Railway (Node TS + Playwright)]
                            ④ invited 대신 로그인 (저장 쿠키 세션 재사용)
                            ⑤ 빈 티타임 조회 / 예약 실행
                            ⑥ 결과를 카카오 callbackUrl 로 직접 전송
                                       │
                                       ▼
                              [Supabase (Postgres)]
                   users · clubs · credentials(암호화) · sessions(암호화)
                   · companions · bookings · conversations · job_logs
```

**책임 분리**
- **스킬서버(Vercel)**: 카카오 웹훅 수신, 인증, 의도 파싱, 워커 오케스트레이션, 대화 상태 관리. **원문 자격증명은 다루지 않음.**
- **워커(Render/Fly)**: Playwright 자동화 전담. 자격증명/쿠키 복호화·로그인·조회·예약. 카카오 콜백 전송.
- **Supabase**: 영속 데이터 + 감사 로그.
- 스킬서버 ↔ 워커는 **공유 시크릿(HMAC 또는 Bearer)** 으로 상호 인증.

## 6. 데이터 모델 (Supabase / Postgres)

- **users**: `id`, `kakao_user_id`(unique), `email`, `display_name`, `created_at`
- **clubs**: `id`, `name`, `provider`('invited'|'trinity'), `timezone`('America/Los_Angeles'), `booking_window_days`(스파이크에서 확인), `created_at`
- **credentials**: `id`, `user_id→users`, `club_id→clubs`, `username_enc`, `password_enc`, `enc_iv`, `enc_tag`, `status`('active'|'invalid'), `last_login_at`, **unique(user_id, club_id)**
- **sessions**: `id`, `credential_id→credentials`, `storage_state_enc`(쿠키·로컬스토리지 암호화), `expires_at`, `updated_at`
- **companions**: `id`, `name`, `type`('member'|'guest'), `member_number`(nullable), `tags`(jsonb,nullable), `note`(nullable), `created_by→users`(nullable, 부부 공용으로 조회), `created_at`
- **bookings**: `id`, `user_id→users`(예약에 쓴 계정), `club_id→clubs`, `tee_datetime`(timestamptz), `players`(jsonb: `[{companion_id|name, type}]`), `status`('requested'|'confirmed'|'failed'|'cancelled'), `confirmation_ref`(nullable), `error`(nullable), `created_at`, `updated_at`
- **conversations**: `id`, `user_id→users`, `state`(jsonb: 진행 중 클럽/날짜/슬롯/동반자), `updated_at`
- **job_logs**: `id`, `user_id`, `type`('lookup'|'book'), `params`(jsonb), `status`, `result`(jsonb), `error`, `created_at` — 감사·재시도용

## 7. 대화 흐름 (대화 + 버튼 하이브리드)

1. 당신: "이번 토요일 코토 아침 티타임 있어?"
2. 봇: "조회 중이에요…" (useCallback) → 워커가 Coto 로그인·조회 → 슬롯들을 **퀵리플라이/카루셀 버튼**으로 표시
3. 당신: 슬롯 탭 → 봇: "누구랑 치세요?" → 저장 동반자 **버튼** + "게스트 추가"
4. 당신: 동반자 선택 → 봇: "토 7:10 Coto, 본인+아내+게스트1 — 예약할까요? [예약][취소]"
5. 당신: [예약] → 워커가 예약 실행 → "예약 완료 ✅ (확인번호 …)"

**자연어 이해(NLU)**: Claude API(저렴한 `claude-haiku-4-5`)로 자유 발화를
`{intent, club, date, time_range, player_count}` 로 구조화. **슬롯·동반자 선택은 버튼**으로 받아 오인식을 차단.
다국어/구어체("와이프", "토욜 아침") 대응은 Claude에 위임.

## 8. 보안 / 자격증명 관리

- 자격증명·세션 쿠키는 **AES-256-GCM 앱레벨 암호화**. 복호화 키 `ENC_KEY`는 **워커 환경변수에만** 보관
  → Supabase가 유출돼도 평문 노출 없음. Vercel 스킬서버는 원문 자격증명·키를 갖지 않음.
- 자격증명 등록/비번 갱신은 **워커(키 보유 측)** 를 통해 수행(초기 시드 스크립트 또는 보호된 관리 엔드포인트).
- 카카오 사용자 ID **화이트리스트 2개**만 허용, 그 외 차단.
- 스킬서버↔워커 호출은 공유 시크릿 검증. 모든 통신 HTTPS, 시크릿은 각 플랫폼 환경변수.
- ⚠️ **ToS 리스크**: invited 약관상 자동화가 제한될 수 있음. 개인용·저빈도 사용 전제이며, 차단 시 즉시 중단·수동 전환.

## 9. 워커 인터페이스 (내부 API)

- `POST /lookup` `{ user_id, club_id, date, time_range, callbackUrl }` → 빈 슬롯 목록 산출 후 카카오 콜백 전송
- `POST /book` `{ user_id, club_id, tee_datetime, players, callbackUrl }` → 예약 실행 후 결과 콜백 전송
- 공통: 자격증명/세션 복호화 → (세션 만료 시) 로그인 → 동작 → 세션 갱신 저장 → `job_logs` 기록
- 셀렉터·플로우는 **클럽 어댑터 모듈**로 분리(`invited` provider 공통 + 클럽별 차이 흡수) → 구조 변경 시 한 곳만 수정

## 10. 에러 처리

- 로그인 실패(비번 변경/계정 오류) → `credentials.status='invalid'` + "자격증명 갱신해 주세요" 안내
- 봇 차단/캡차 등장 → 백오프 후 재시도, 지속 실패 시 수동 안내 + 실패 시점 HTML 스냅샷 로깅
- **콜백 1분 초과** → 결과를 DB(`job_logs`/`bookings`)에 저장, 사용자가 "결과"라고 보내면 다시 조회·표시 (알림톡 없이 동작)
- 예약 직전 슬롯 마감 → "방금 마감됐어요" + 대체 슬롯 제안
- 부분 실패(동반자 일부 추가 실패 등) → 명확히 상태 보고, 임의 진행 금지

## 11. 기술 스택

- **Vercel**: Next.js (TypeScript) — 카카오 스킬서버(API Routes) (+ 차기 웹뷰)
- **워커**: Node.js (TypeScript) + Playwright — **기본값 Render** (콜드스타트는 DB 저장 세션 재사용으로 완화). 필요 시 Fly/Railway로 교체 가능
- **DB**: Supabase (Postgres)
- **NLU**: Claude API (`claude-haiku-4-5`)
- **암호화**: AES-256-GCM (Node `crypto`)
- **버전관리/배포**: GitHub + Vercel(스킬서버) + 워커 호스트

## 12. 테스트 전략

- **단위**: NLU 파서(Claude 모킹), 암호화 라운드트립, 데이터 접근, 클럽 어댑터의 HTML 파싱(고정 픽스처)
- **자동화 E2E**: 실제 invited는 CI 불가 → 저장된 HTML 픽스처로 파서 검증 + **수동/스테이징 e2e**
- 순수 로직은 TDD 적용. 자동화 부분은 "드라이런(예약 직전까지만)" 모드로 안전 검증.

## 13. 리스크 / 미해결(스파이크에서 해소)

- 클럽별 **예약 오픈 N일 전** 규칙 (조회·예약 가능 범위)
- invited의 봇 탐지(예: Cloudflare) 유무 및 우회 가능성
- 예약 폼에서 동반자(멤버/게스트) 입력의 정확한 필드·검색 방식
- 예약 확인번호(`confirmation_ref`) 취득 가능 여부

## 14. 차기 단계 (참고)

트리니티클럽 · 조건부 자동예약/열림 알림(콜백 한계로 별도 워치 워커+알림 채널 필요) · 웹뷰 ·
(선택) Gmail의 invited 예약 확인메일 연동으로 예약 상태 교차검증.
