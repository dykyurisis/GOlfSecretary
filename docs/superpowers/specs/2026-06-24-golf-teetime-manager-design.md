# 골프 티타임 비서 — 설계 문서

- 작성일: 2026-06-24
- 버전: v2 (인터페이스 전환: **웹 대시보드 우선**, 카카오톡은 2단계)
- 상태: 검토 중
- 변경 이력: v1은 카카오톡 챗봇 우선 → v2에서 **Gmail 권한관리 웹 대시보드(아이폰 PWA) 우선**으로 전환, 카카오톡은 2단계로 이동

## 1. 개요 / 목적

미국 오렌지카운티 3개 회원제 골프장(**Coto de Caza, Aliso Viejo, Old Ranch**, 모두 `invitedclubs.com` 운영)의
빈 티타임을 **아이폰에서 쓰기 좋은 웹 대시보드**로 조회하고, 동반자를 지정해 예약까지 실행한다.

- 사용자: 부부 2명 (daeyoung71@gmail.com / jsyune0517@gmail.com) — **Google 로그인**, 허용 Gmail 2개만 접근
- 각 사용자는 클럽마다 **별도의 invited 로그인**을 가짐 → 2명 × 3클럽 = **자격증명 6세트**
- **카카오톡 챗봇은 2단계**(동일 백엔드 재사용). 한국 트리니티클럽은 차기.

## 2. 핵심 기술 전제 (제약)

1. **invited는 공개 API가 없음** → 사용자 계정으로 **대신 로그인하는 헤드리스 브라우저 자동화(Playwright)** 가 유일한 수단.
   사이트 구조 변경·봇 차단에 깨질 수 있는 본질적 취약성.
2. invited 로그인은 (확인된 바) **아이디/비밀번호만** — OTP·캡차 없음. (변동 시 자동화 재검토)
3. **웹 대시보드는 카카오톡의 응답시간 제약이 없음** → "조회 중…" 로딩 후 **Supabase Realtime/폴링**으로 결과를 자연스럽게 갱신. (5초/1분 콜백·알림톡·사업자등록 모두 불필요)
4. **Vercel 서버리스는 장시간·헤드리스 브라우저에 부적합** → 자동화는 **전용 워커 서비스(Render)** 에서 실행.

## 3. 목표 / 비목표

**v1 목표**
- 웹 대시보드에서 빈 티타임 **조회**(폼/버튼 + 챗 보조)
- 동반자(멤버/게스트) 지정 후 **예약 실행**(반자동: 사용자가 확인 후 앱이 실제 예약)
- 자주 함께 치는 사람 **동반자 DB** 저장·호출
- 미국 3클럽 × 2계정 전부 지원, **Google 로그인 + 허용 Gmail 2개**
- **아이폰 모바일 우선 PWA**(홈화면 추가)

**v1 비목표 (차기)**
- **카카오톡 챗봇 (2단계)** — 동일 백엔드 재사용
- 조건 무인 자동예약("스나이핑")·열림 알림 푸시
- 한국 트리니티클럽
- 예약 취소·변경(차기, v1은 invited에서 수동)
- 부부 외 사용자, 결제

## 4. 범위 / 빌드 순서

최종 v1은 3클럽 × 2계정 전부지만, 자동화 취약성 때문에 **작게 증명 후 확장**한다.

1. **M0 스파이크**(로컬 일회성 스크립트): Coto + 당신 계정 로그인·조회·예약폼 도달 증명, 세션 재사용·수명, 예약오픈 N일, 폼 필드, 확인번호 가능 여부
2. **M1**: 대시보드 골격(Next.js/Vercel) + Supabase Auth(Google, 2-이메일 허용) + 스키마 + 자격증명 시드 → Coto 조회 E2E(폼→잡→워커→실시간 결과)
3. **M1.5**: 로그인 세션 재사용
4. **M2**: 예약 실행 + 동반자 DB(CRUD/선택 UI)
5. **M2.5**: 챗 보조(Claude NLU로 폼 자동 채움)
6. **M3a/b/c**: 아내 계정 / Aliso / Old Ranch 확장
7. (차기) 카카오톡 · 트리니티 · 자동알림 · 취소·변경

## 5. 아키텍처

```
[아이폰 브라우저 / PWA]
   │   ▲
   │   │  Supabase Realtime/폴링 (잡 상태·결과)
   ▼   │
[Vercel: Next.js (TS)]                      [Supabase (Postgres + Auth + Realtime)]
   · Google 로그인(Supabase Auth)+허용목록      users · clubs · credentials(암호화)
   · 폼 API / 서버액션                          · sessions(암호화) · companions
   · 챗 보조 NLU(Claude Haiku) → 폼 프리필         · bookings · jobs(큐+감사) · chat_sessions
   · 잡 생성(status=queued)
                       │  잡 픽업/HTTP 트리거
                       ▼
[워커: Render (Node TS + Playwright)]
   · 자격증명/세션 복호화 → invited 로그인(세션 재사용/프로브)
   · 조회 / 예약 실행 → jobs·bookings 갱신 → 사이트 변경 시 마스킹 스냅샷
```

**책임 분리**
- **대시보드(Vercel/Next.js)**: 인증·권한, 폼/화면, 챗 보조 NLU, 잡 생성, 결과 표시. **원문 자격증명은 다루지 않음.**
- **워커(Render)**: Playwright 자동화 전담. 자격증명/쿠키 복호화·로그인·조회·예약.
- **Supabase**: 데이터 + 인증 + **잡 큐 + Realtime 결과 채널**.
- 대시보드 백엔드 ↔ 워커는 **공유 시크릿**으로 상호 인증.

## 6. 데이터 모델 (Supabase / Postgres)

- **users**: `id`(=Supabase auth uid), `email`(Google), `display_name`, `created_at` — 허용 이메일은 환경설정/상수
- **clubs**: `id`, `name`, `provider`('invited'|'trinity'(차기)), `timezone`('America/Los_Angeles'), `booking_window_days`, 그룹/게스트 제한 등 어댑터 파라미터
- **credentials**: `id`, `user_id→users`, `club_id→clubs`, `username_enc`, `password_enc`, `enc_iv`, `enc_tag`, `status`, `last_login_at`, **unique(user_id, club_id)**
- **sessions**: `id`, `credential_id→credentials`, `storage_state_enc`, `expires_at`, `updated_at`/`version`
- **companions**: `id`, `name`, `type`('member'|'guest'), `member_number`(nullable), `tags`(jsonb), `note`, `created_by→users`, `created_at` — **부부 공용**(RLS로 두 사용자 모두 조회)
- **bookings**: `id`, `user_id`, `club_id`, `tee_datetime`(timestamptz), `players`(jsonb), `holes`, `transport`, `status`('requested'|'confirmed'|'failed'|'cancelled'(차기)), `confirmation_ref`, `error`, **부분 유니크(user_id, club_id, tee_datetime)**, `created_at`/`updated_at`
- **jobs**: `id`, `user_id`, `type`('lookup'|'book'), `params`(jsonb), `status`('queued'|'running'|'done'|'failed'), `result`(jsonb), `error`, `auth_mode`, `created_at`/`updated_at` — 큐 + 감사, Realtime 구독 대상
- **chat_sessions**: `id`, `user_id`, `state`(jsonb), `expires_at` — 챗 보조 멀티턴 맥락(TTL)

**RLS**: 사용자는 자신의 credentials/bookings/jobs만, companions/clubs는 부부 공용으로 조회. 허용 이메일 외 로그인 차단.

## 7. UI / 화면 흐름 (아이폰 모바일 우선)

- **로그인**: Google 로그인 → 허용 Gmail 아니면 차단
- **홈/조회**: 클럽·날짜·시간대·인원·홀수 선택 폼 + 상단 **챗 입력창**("토욜 아침 코토 와이프랑" → 폼 자동 채움)
- **결과**: 빈 슬롯 리스트(현지 시간 표기), 슬롯 선택
- **예약 확인**: 동반자 선택(저장 동반자 칩 + 즉석 게스트), 홀수/카트, 인원·포섬 검증 → [예약] 확정
- **진행 상태**: "조회/예약 중…" → Realtime로 완료/실패 갱신
- **동반자 관리**: 추가/수정/삭제
- **설정**: 클럽별 자격증명 등록·갱신(워커 경유 암호화 저장), 예약 이력

> 챗은 **보조**: 자유 발화를 NLU가 해석해 폼을 채우고, **사용자가 화면에서 확인**한 뒤 실행 → 오인식 위험 차단.

## 8. NLU (챗 보조)

Claude `claude-haiku-4-5`로 자유 발화를 `{intent, club, date(YYYY-MM-DD, 클럽 현지), time_range, player_count, holes, transport}`로 구조화 → 폼 프리필.
규칙: `오전`=12:00 이전, `이번 ○요일`=현지 기준 미래 가장 가까운 해당 요일, 홀수 기본 18, 모호하면 폼에서 비워두고 표시.

## 9. 보안 / 인증

- **인증**: Supabase Auth Google OAuth. **허용 Gmail 2개 화이트리스트**(그 외 거부). RLS로 데이터 접근 통제.
- **자격증명·세션**: AES-256-GCM 암호화. 키 `ENC_KEY`는 **워커 환경변수에만**. 대시보드는 원문 자격증명·키를 다루지 않음. 분실 시 6세트 재시드 필요(백업 권장).
- 자격증명 등록/갱신은 키 보유 측(워커)을 통해 수행(보호된 관리 엔드포인트/시드 스크립트).
- 대시보드↔워커 호출은 공유 시크릿. 전 구간 HTTPS. 실패 HTML 스냅샷은 비밀번호 마스킹.
- ⚠️ **ToS 리스크**: invited 약관상 자동화 제한 가능. 저빈도 개인 사용 전제, 차단 시 중단.

## 10. 비동기 / 실시간

- 대시보드가 `jobs`에 `queued`로 삽입 → 워커가 픽업(폴링 또는 HTTP 트리거) → `running`→`done/failed`로 갱신 + 결과 기록.
- 대시보드는 **Supabase Realtime**(또는 폴링)으로 해당 잡을 구독해 화면 갱신. 카카오 콜백 1분 한계 **없음**.
- 같은 계정 작업은 **자격증명 단위 직렬화**(짧은 큐/락), 사용자별 독립 BrowserContext, 세션 갱신은 조건부.

## 11. 에러 처리

- 로그인 실패 → `credentials.status='invalid'` + "자격증명 갱신" 안내
- 봇 차단/캡차·OTP 등장 → **재시도 금지, 즉시 중단·통지** (재시도는 차단 악화)
- 일시 오류 → 백오프 재시도
- 예약 직전 슬롯 마감 → 재확인·대체 슬롯 제안
- 결과 불명/타임아웃 → 자동 재시도 금지, "상태 확인 필요"; 재시도 전 동일 슬롯 예약 존재 확인(멱등)
- 사용자 노출 실패 사유 분류: 자격증명오류/슬롯마감/봇차단·캡차/사이트변경/타임아웃/기타

## 12. 워커 인터페이스 (내부)

- 잡 픽업: `jobs`에서 `queued` 픽업(또는 대시보드가 `POST /run` 트리거 + 공유 시크릿)
- `lookup` `{user_id, club_id, date, time_range}` → 빈 슬롯 → `jobs.result`
- `book` `{user_id, club_id, tee_datetime, players, holes, transport}` → 예약 실행 → `bookings`/`jobs`
- 공통: 복호화 → (세션 만료 시) 로그인 → 동작 → 세션 갱신 → 감사 기록. 셀렉터·플로우는 **클럽 어댑터 모듈**로 분리.

## 13. 기술 스택

- **프론트/백엔드**: Next.js (TypeScript) on Vercel — 대시보드 + API/서버액션. PWA(매니페스트·설치). 모바일 우선 반응형.
- **인증**: Supabase Auth (Google)
- **워커**: Node.js (TypeScript) + Playwright on Render
- **DB/Realtime**: Supabase (Postgres + Realtime)
- **NLU**: Claude API `claude-haiku-4-5`
- **암호화**: AES-256-GCM (Node `crypto`)
- **버전관리/배포**: GitHub + Vercel + Render

## 14. 테스트 전략

- **단위**: NLU 파서(Claude 모킹), 암호화 라운드트립, 데이터 접근/RLS, 클럽 어댑터 HTML 파싱(고정 픽스처)
- **자동화 E2E**: 실제 invited는 CI 불가 → 픽스처 기반 파서 검증 + 수동/스테이징 e2e. "드라이런(예약 직전까지)" 모드.
- **프론트**: 핵심 흐름(로그인 허용목록, 조회→예약 확인) 컴포넌트/통합 테스트. 순수 로직은 TDD.

## 15. 리스크 / 미해결 (M0에서 해소)

- 클럽별 예약 오픈 N일·조회 범위 / invited 봇 탐지(Cloudflare) 유무 / 예약 폼의 동반자·홀수·카트·멤버번호 입력 방식 / 확인번호 취득 가능 여부 / **로그인 세션 재사용 가능성·수명**

## 16. 차기 단계

**카카오톡 챗봇(2단계, 동일 백엔드 재사용)** · 트리니티클럽 · 조건부 자동예약/열림 알림 · 예약 취소·변경 ·
(선택) Gmail의 invited 확인메일 연동으로 예약 상태 교차검증.
