# 골프 티타임 비서 — 설계 문서

- 작성일: 2026-06-24
- 버전: **v2.1** (웹 대시보드 우선 + 인증/RLS·잡큐·동시성·신뢰성 보강)
- 상태: 검토 중
- 변경 이력: v1 카카오톡 우선 → v2 웹 대시보드(아이폰 PWA) 우선 → **v2.1 다관점 리뷰 2차 반영**

## 1. 개요 / 목적

미국 오렌지카운티 3개 회원제 골프장(**Coto de Caza, Aliso Viejo, Old Ranch**, 모두 `invitedclubs.com` 운영)의
빈 티타임을 **아이폰에서 쓰기 좋은 웹 대시보드**로 조회하고, 동반자를 지정해 예약까지 실행한다.

- 사용자: 부부 2명 (daeyoung71@gmail.com / jsyune0517@gmail.com) — **Google 로그인**, 허용 Gmail 2개만 접근
- 각 사용자는 클럽마다 **별도의 invited 로그인** → 2명 × 3클럽 = **자격증명 6세트**
- **카카오톡 챗봇은 2단계**(동일 백엔드 재사용). 한국 트리니티클럽은 차기.

## 2. 핵심 기술 전제 (제약)

1. **invited는 공개 API 없음** → 사용자 계정으로 **대신 로그인하는 헤드리스 브라우저 자동화(Playwright)**. 사이트 변경·봇 차단에 취약.
2. invited 로그인은 **아이디/비밀번호만**(OTP·캡차 없음, 변동 시 재검토).
3. **웹 대시보드는 카카오톡 응답시간 제약 없음** → "조회 중…" 후 **Realtime/폴링**으로 결과 갱신.
4. **Vercel 서버리스는 헤드리스 브라우저·장시간 작업에 부적합** → 자동화는 **전용 워커(Render 상시)**.

## 3. 목표 / 비목표

**v1 목표**: 웹 대시보드 조회(폼+챗 보조) / 동반자 지정 반자동 예약 / 동반자 DB / 3클럽×2계정 / Google 로그인+허용 2명 / 아이폰 PWA.
**v1 비목표(차기)**: 카카오톡(2단계) · 스나이핑·열림알림 · 트리니티 · 예약 취소·변경 · 부부 외 사용자·결제 · 오프라인.

## 4. 범위 / 빌드 순서

1. **M0 스파이크**(로컬 일회성): Coto+당신 계정 로그인·조회·예약폼 도달, 세션 재사용·수명, **예약오픈 날짜+시각**, 폼 필드(홀수/카트/플레이어별 멤버번호/게스트), 확인번호 가능 여부, 봇차단 유무
2. **M1a 기반**: Next.js+Vercel + Supabase Auth(Google, DB 허용목록) + 전체 스키마/RLS + AES 자격증명 시드/라운드트립 + 모바일 반응형 (워커 없이 검증)
3. **M1b 비동기 루프**: jobs 큐 + Render 워커 + 공유시크릿 트리거 + 원자클레임/reaper + Realtime/폴링 → Coto 조회 E2E
4. **M1.5** 세션 재사용 → **M2** 예약+동반자(+PWA 검증) → **M2.5** 챗 보조 → **M3a/b/c** 아내·Aliso·Old Ranch
5. (차기) 카카오톡 · 트리니티 · 자동알림 · 취소·변경

## 5. 아키텍처

```
[아이폰 브라우저/PWA] ⇅ Supabase Realtime + 5초 폴링 폴백(잡 상태)
        │  ① Google 로그인(허용목록 DB 강제, RLS)
        ▼
[Vercel: Next.js(TS)]  ── ② 잡 INSERT(queued) ─▶ [Supabase(Postgres+Auth+Realtime, RLS)]
  · 폼 API/서버액션                                     ▲  ④ 잡/결과 (워커=service_role)
  · 챗 NLU(Claude): 발화→폼(자격증명 미포함)               │
        │  ③ POST /run(잡 id, 공유 시크릿)   ┌── 평문 자격증명 직행(TLS, JWT+허용목록 서버검증)
        ▼                                   │
[워커: Render 상시(Node/Playwright), service_role + ENC_KEY]
  · 원자 클레임 → 자격증명 재도출/복호화 → invited 로그인(세션 재사용/프로브) → 조회·예약 → jobs/bookings 갱신
```

**책임 분리**
- **대시보드(Vercel)**: 인증·권한, 폼/화면, 챗 NLU(발화만), 잡 생성, 결과 표시. **원문 자격증명·`ENC_KEY` 미접촉.**
- **워커(Render)**: Playwright 자동화 전담. service_role로 DB 접근, 자격증명/세션 복호화·로그인·조회·예약. 평문 자격증명 암호화의 유일 지점.
- **Supabase**: 데이터 + 인증 + 잡 큐 + Realtime 결과 채널 + RLS.

## 6. 데이터 모델 (Supabase / Postgres)

- **allowed_users**: `email` — **허용목록 진실원천**. `is_allowed_user()`(SECURITY DEFINER, `auth.jwt()->>'email'`)가 참조하며 **모든 테이블 RLS의 USING/WITH CHECK에 포함**.
- **users**: `id`(=auth uid), `email`, `display_name`, `created_at`
- **clubs**: `id`, `name`, `provider`('invited'|'trinity'(차기)), `timezone`('America/Los_Angeles'), `booking_window_days`, **`open_time_local`**(오픈 시각), 그룹/게스트 제한 등 어댑터 파라미터
- **credentials**: `user_id→users`, `club_id→clubs`, `username_enc`, `password_enc`, `enc_iv`, `enc_tag`, `status`, `last_login_at`, **unique(user_id, club_id)** — per-user RLS
- **sessions**: `credential_id→credentials`, `storage_state_enc`, `expires_at`, **`version`** — 쓰기는 advisory lock/낙관적 version
- **companions**: `name`, `type`('member'|'guest'), `member_number`?, `tags`?, `note`?, **`created_by`/`updated_by`** — **부부 공용 읽기/쓰기 RLS**
- **bookings**: `user_id`, `club_id`, `tee_datetime`(tz), `players`(jsonb), `holes`, `transport`, `status`('requested'|'confirmed'|'failed'|'cancelled'(차기)), `confirmation_ref`?, `error`? — **부분 유니크(user_id, club_id, tee_datetime)**, per-user RLS
- **jobs**: `user_id`, `type`('lookup'|'book'), `params`, `status`('queued'|'running'|'done'|'failed'), `result`, `error`, `auth_mode`, **`claimed_by`/`claimed_at`/`locked_until`/`attempt`** — 큐+감사, Realtime 구독, **부분 유니크(user_id, type, club_id, tee_datetime) WHERE status IN('queued','running')**, per-user RLS, INSERT `WITH CHECK(user_id=auth.uid())`
- **chat_sessions**: `user_id`, `state`(jsonb), `expires_at`(TTL 10분)

**RLS / 교차사용자 읽기**: `credentials/bookings/jobs`는 per-user, `companions/clubs/allowed_users`는 공용/공통. 모든 정책에 `is_allowed_user()` 포함(미허용 JWT는 0행). **유일한 교차사용자 읽기 = `slot_conflict(club_id, tee_datetime)` SECURITY DEFINER RPC**(불리언/소유자 표시명만) **+ 워커(service_role)** → 배우자 충돌 검사(FR-7 AC4)와 per-user RLS가 모순되지 않음. 미허용 이메일은 **가입 차단 훅/트리거(auth.users 생성 전)**.

## 7. UI / 화면 흐름 (아이폰 모바일 우선)

- **네비게이션(IA)**: 하단 탭바 **홈 / 동반자 / 설정**. 예약 이력·로그아웃은 설정 안.
- **로그인**: Google → 허용 Gmail 아니면 거부
- **홈/조회**: 클럽·날짜·시간대·인원·홀수 폼 + 상단 챗 입력창(폼 자동 채움). **자격증명 없는 클럽은 비활성/배지 + 설정 링크**(FR-1 AC2)
- **결과**: 빈 슬롯 리스트(현지 시간), 슬롯 선택. **빈 상태**("빈자리 없음"+대안)
- **예약 확인**: 동반자 선택(저장 칩 + 즉석 게스트, **동반자 없을 때 추가 유도**), 홀수/카트, 인원·포섬 검증 → [예약]
- **진행 상태**: 즉시 진행 표시 → Realtime/폴링 갱신. **워커 시동 지연/콜드 상태**를 실패와 구분, **Realtime 끊김 표시 + 수동 새로고침**. 무한 스피너 금지
- **동반자 관리**: 추가/수정/삭제 (빈 상태 안내)
- **설정**: 내 3개 클럽 자격증명(상태 배지: 유효/갱신필요/미설정) + 갱신, 예약 이력, 로그아웃, `ENC_KEY` 백업/재시드 안내

> 챗은 **보조**: NLU가 폼을 채우고 **사용자가 확인 후 실행** → 오인식 차단. S1/S2 스텝 목표는 **폼 경로만으로** 충족(챗은 M2.5).

## 8. NLU (챗 보조)

Claude `claude-haiku-4-5`로 발화를 `{intent, club, date(YYYY-MM-DD, 클럽 현지), time_range, player_count, holes, transport}`로 구조화 → 폼 프리필.
기준 `now`는 **항상 클럽 현지(PT)**. 규칙: `오전`<12:00, `오후`≥12:00(12:00=오후), `아침`=오전, `이번/다음 ○요일`=오늘 이후 다음 발생(오늘이 그 요일이면 오늘 제외 +7), `홀수` 기본 18. **모호 항목**(미언급/다중해석/단일값 불가)은 빈칸, 필수 빈칸이면 버튼 비활성. 발화는 **제3자 Claude API로 전송**되며 자격증명/세션은 절대 포함하지 않음.

## 9. 보안 / 인증

- **인증/권한**: Supabase Auth Google. **허용목록을 DB(`allowed_users`)로 강제**해 모든 RLS에 `is_allowed_user()` 적용 → 미허용 JWT는 PostgREST·Realtime에서 0행. 미허용 이메일은 가입 단계에서 차단(세션 미발급).
- **세션 수명**: 로그아웃(설정), 만료 시 재로그인 유도, **만료 토큰으로 [예약] 미실행**(미확정 예약 폐기). 잡은 서버측 `user_id` 소유로 완료되어 다음 로그인 때 노출. 회수 런북: `allowed_users` 제거 → admin signOut/delete-user → 공유 시크릿 회전.
- **자격증명·세션 암호화**: AES-256-GCM. `ENC_KEY`는 **워커 env에만**. **Vercel은 평문 자격증명을 보거나 기록하지 않음.**
  - 초기 시드 = 워커 시드 스크립트(소유자 실행). 인앱 갱신 = 설정 폼이 평문을 **워커 관리 엔드포인트로 TLS 직행**, 워커만 암호화.
  - 키 분실 → 6세트 재시드. **회전 런북**: 워커가 구키 복호화→신키 재암호화(대시보드는 키가 없어 불가).
- **워커 권한**: service_role 키(Render env). 매 잡마다 `credentials WHERE user_id=job.user_id AND club_id=job.club_id`로 자격증명 **재도출**(params의 credential_id 불신). 소유 없는 잡은 **로그인 시도 없이 fail-closed**.
- **워커 관리 엔드포인트 하드닝**: Supabase JWT 서명+허용목록 **서버측 검증**, 레이트리밋, **브라우저 오리진에서 도달 가능한 유일 라우트**(나머지 라우트는 브라우저 오리진 거부), CORS=대시보드 오리진. 대시보드↔워커 `/run`은 공유 시크릿 헤더.
- **누출 방지**: 실패 HTML 스냅샷은 비밀번호·아이디·세션쿠키·멤버번호 **마스킹**, **워커측에만** 저장. 전 구간 HTTPS.
- ⚠️ **ToS 리스크**: invited 약관상 자동화 제한 가능. 저빈도 개인 사용, 차단 시 중단.

## 10. 비동기 / 실시간 / 동시성

- **픽업 확정**: Vercel 서버액션이 `jobs` INSERT 후 **동기 `POST /run`(잡 id, 공유 시크릿)** → 워커가 **원자 클레임**. 30초 폴링은 **누락 트리거 백업**으로만. Render **상시 가동**.
- **원자 클레임**: `UPDATE jobs SET status='running', claimed_by, claimed_at, locked_until=now()+budget WHERE id=:id AND status='queued' RETURNING *`(0행=스킵). 폴링은 `FOR UPDATE SKIP LOCKED`.
- **정체 잡 reaper**: `locked_until`(lookup 90s/book 120s) 경과한 `running`을 `failed`('worker_lost/timeout')로. **book 잡은 자동 재시도 금지** → "예약 상태 확인 필요"(예약 생성 안 함).
- **Realtime 보정**: 로드·visibilitychange→visible·재연결 시 진행 중 잡 1회 fetch / 열린 잡 동안 5초 폴링 폴백 / 생성 응답의 잡 id로 구독(전이는 즉시 fetch 백필).
- **동시성**: 같은 계정은 **`pg_try_advisory_lock(credential_id)` 비블로킹 직렬화**(실패 시 슬롯 점유 없이 소폭 백오프 후 재큐), 사용자별 독립 BrowserContext, `sessions` 쓰기는 락 보유/낙관적 version.

## 11. 에러 처리

- 로그인 실패 → `credentials.status='invalid'` + "자격증명 갱신" 안내
- 봇 차단/캡차·OTP → **재시도 금지, 즉시 중단**. 막다른 실패 대신 **수동 인계**(invited 딥링크 + 선택한 슬롯/동반자/홀수)
- 일시 오류 → 백오프 재시도 / 정체 잡 → reaper
- 예약 직전 슬롯 마감 → 재확인·대체 슬롯
- 결과 불명/타임아웃 → 자동 재시도 금지, "상태 확인 필요"; 재시도 전 동일 슬롯 예약 존재 확인(멱등)
- 사용자 노출 실패 사유 분류: 자격증명오류/슬롯마감/봇차단·캡차/사이트변경/타임아웃/기타

## 12. 워커 인터페이스 (내부)

- 트리거: 대시보드 `POST /run {jobId}` (공유 시크릿). 폴링은 백업.
- 처리: 원자 클레임 → 자격증명 재도출/복호화 → (세션 만료 시) 로그인 → 동작 → 세션 갱신(락/version) → `jobs`/`bookings` 갱신.
- `lookup` {club_id, date, time_range} → 빈 슬롯 → `jobs.result`
- `book` {club_id, tee_datetime, players, holes, transport} → 예약 실행 → `bookings`
- 셀렉터·플로우는 **클럽 어댑터 모듈**로 분리. 관리 엔드포인트(자격증명 암호화 저장)는 §9 하드닝 적용.

## 13. 기술 스택

- **프론트/백엔드**: Next.js (TS) on Vercel — 대시보드 + API/서버액션, PWA, 모바일 우선 반응형
- **인증**: Supabase Auth (Google) + DB 허용목록 + RLS
- **워커**: Node.js (TS) + Playwright on Render(상시)
- **DB/Realtime**: Supabase (Postgres + Realtime), 워커는 service_role
- **NLU**: Claude API `claude-haiku-4-5`
- **암호화**: AES-256-GCM (Node `crypto`)
- **버전관리/배포**: GitHub + Vercel + Render

## 14. 테스트 전략

- **단위**: NLU 파서(Claude 모킹), 암호화 라운드트립, 데이터 접근/**RLS 정책**(미허용 JWT 0행, per-user 격리, slot_conflict RPC), 클럽 어댑터 HTML 파싱(픽스처)
- **동시성**: 원자 클레임/advisory lock/ reaper 단위·통합 테스트(이중 처리·정체 잡)
- **자동화 E2E**: 실제 invited는 CI 불가 → 픽스처 파서 검증 + 수동/스테이징 e2e. "드라이런(예약 직전까지)" 모드.
- **프론트**: 로그인 허용목록, 조회→예약 확인, Realtime 끊김 보정, PWA(FR-13 체크리스트). 순수 로직 TDD.

## 15. 리스크 / 미해결 (M0에서 해소)

- 클럽별 예약 오픈 **날짜+시각**·조회 범위 / invited 봇 탐지(Cloudflare) 유무 / 예약 폼의 동반자·홀수·카트·**플레이어별 멤버번호** 입력 방식 / 확인번호 취득 가능 여부 / **로그인 세션 재사용 가능성·수명** / **Render 상시 가동 비용·방식**(유료 vs cron 핑)

## 16. 차기 단계

**카카오톡 챗봇(2단계, 동일 백엔드 재사용)** · 트리니티클럽 · 예약 취소·변경 ·
(선택) Gmail의 invited 확인메일 연동으로 예약 상태 교차검증.

**자동 예약/스나이핑 (요청됨, 차기 우선 후보)**: 인기 티타임 경쟁 대응. 보통 **약 2주 전 오전 6:30경(현지)** 오픈 → 사전 등록한 "워치"(클럽·날짜·시간대·동반자)를 스케줄러가 오픈 순간 실행(세션 워밍업 → 빠른 폴-앤-그랩 → 차순위 폴백 → 결과 알림). 별도 **워치 워커 + 스케줄러 + 알림 채널** 필요. 봇 탐지 위험↑·정확한 오픈 타임스탬프 의존(M0 R3 선행). 상세는 PRD §13.1.
