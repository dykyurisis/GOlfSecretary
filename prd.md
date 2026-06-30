# PRD — 골프 티타임 비서 (Golf Tee-Time Manager)

| 항목 | 내용 |
|---|---|
| 문서명 | 제품 요구사항 정의서 (PRD) |
| 버전 | **v2.1** (웹 대시보드 우선 + 다관점 리뷰 2차 반영) |
| 작성일 | 2026-06-24 |
| 상태 | 검토 중 |
| 소유자 | 당신(daeyoung71@gmail.com) |
| 관련 문서 | [설계 문서](docs/superpowers/specs/2026-06-24-golf-teetime-manager-design.md) |
| 변경 이력 | v1 카카오톡 우선 → v2 웹 대시보드 우선 → **v2.1 인증/RLS·잡큐·동시성·신뢰성 보강** |

---

## 1. 배경 / 문제 정의

부부 2명이 미국 오렌지카운티 회원제 골프장 3곳(**Coto de Caza, Aliso Viejo, Old Ranch**, 모두 `invitedclubs.com`)
회원이다. 현재는 사람마다·골프장마다 다른 아이디로 각 사이트에 직접 로그인(2명 × 3클럽 = 6세트)해
티타임을 일일이 조회·예약하고, 동반자 정보도 매번 새로 입력한다.

**원하는 모습(1단계)**: **아이폰에서 쓰기 좋은 웹 대시보드**로 한 곳에서 빈 티타임을 조회하고,
자주 함께 치는 동반자를 불러 예약까지 끝낸다. **카카오톡 대화형은 2단계**에서 같은 백엔드로 추가한다.

---

## 2. 목표 & 성공 지표

**목표**
- G1. 웹 대시보드에서 3개 클럽의 빈 티타임을 **조회**(폼/버튼 + 챗 보조).
- G2. 저장된 동반자(멤버/게스트)를 지정해 **예약을 실제로 완료**(반자동: 사용자 확인 후 실행).
- G3. 자주 함께 치는 사람을 **동반자 DB**에 저장해 재입력하지 않는다.
- G4. 부부 2명이 **각자 Google 로그인**으로, 각자의 invited 계정으로 사용한다.
- G5. **아이폰 모바일 우선 PWA**(홈화면 추가).

**성공 지표** — *"1 스텝 = 사용자의 명시적 탭/제출 1회"(텍스트 입력 중 키 입력 제외; 한 화면에서 여러 필드를 채운 뒤 단일 제출은 1스텝). 측정은 고정 시나리오 "토욜 오전 Coto, 아내"로.*
- **S1a (폼 조회)**: 홈 도착 → [클럽] → [날짜/시간대] → [조회] = **≤3탭**, 슬롯 리스트 렌더까지.
- **S1b (챗 조회)**: 발화 전송 1탭 + 프리필 확인 [조회] 1탭 = **≤2탭**.
- **S2 (예약)**: 슬롯 [선택] → 동반자 [선택] → [예약] = **≤3탭**, 확정 모달까지.
- **S3 (성능)**: 측정창 = [조회]/[예약] 탭 → 결과 화면 렌더. **세션 재사용: p50 ≤ 30초, p95 ≤ 60초 / 콜드 로그인: p95 ≤ 120초** (각 경로 10회 표본, M1b·M2에서 측정).
- **S4**: 동반자 1명 재사용 시 이름 재입력 **0회**.
- *주: S1/S2 스텝 목표는 **폼 경로만으로** 달성해야 한다(챗 보조는 M2.5 편의 계층).*

---

## 3. 비목표 (v1에서 하지 않음)

- N1. **카카오톡 챗봇 → 2단계** (동일 백엔드 재사용)
- N2. 조건 무인 자동예약("스나이핑")·열림 알림 푸시 → 차기
- N3. 한국 트리니티클럽 → 차기 (`provider=trinity`)
- N4. 예약 취소·변경 → 차기 (v1은 invited에서 수동; FR-8에 명시)
- N5. 부부 외 사용자, 결제/정산, 4인 초과 팀 매칭, **오프라인 동작**(네트워크 필요)

---

## 4. 대상 사용자

| 사용자 | 로그인 | invited 계정 | 비고 |
|---|---|---|---|
| 당신 | Google (daeyoung71@gmail.com) | Coto/Aliso/Old Ranch 각 1개 | 허용 목록 |
| 아내 | Google (jsyune0517@gmail.com) | Coto/Aliso/Old Ranch 각 1개 | 허용 목록 |

- **허용 Gmail 2개만** 접근. 그 외 Google 계정은 로그인 거부. 두 사용자는 동등 권한.

---

## 5. 사용자 시나리오 (대표 스토리)

- **US-1 (로그인)**: Google 로그인 → 허용 Gmail이면 진입, 아니면 거부(세션 자체가 생성되지 않음).
- **US-2 (조회)**: 홈에서 클럽=Coto·날짜=토요일·시간대=오전 선택(또는 챗 "토욜 아침 코토") → 빈 슬롯 표시.
- **US-3 (예약)**: 슬롯 선택 → 동반자(아내)+게스트1 → 홀수/카트 확인 → [예약] → 진행 표시 → 완료.
- **US-4 (동반자 관리)**: "김철수, 게스트" 추가 → 이후 칩으로 선택.
- **US-5 (다계정)**: 아내가 자기 Google 계정으로 로그인 → 아내 invited 계정으로 동작.
- **US-6 (설정/자격증명)**: 설정에서 클럽별 invited 자격증명을 등록·갱신.
- **US-7 (로그아웃/세션 만료)**: 설정에서 로그아웃. 세션 만료 시 재로그인으로 유도(미확정 예약은 실행하지 않고 폐기).

---

## 6. 기능 요구사항 (Functional Requirements)

### FR-1 인증 & 권한 (Google + 허용목록, DB 강제)
- Supabase Auth Google OAuth로 로그인. **허용 Gmail 2개**만 접근.
- **허용목록은 앱 코드가 아니라 DB가 진실원천**: `allowed_users` 테이블(또는 `is_allowed_user()` SECURITY DEFINER, `auth.jwt()->>'email'` 사용)을 **모든 테이블 RLS의 USING/WITH CHECK에 참조**. 미허용 이메일은 **가입 차단 훅/트리거(auth.users 생성 전)** 로 세션 자체를 발급하지 않는다.
- 세션 수명: 로그아웃(설정), 만료 시 재로그인 유도, **만료 토큰으로는 [예약]을 실행하지 않음**(미확정 예약 상태 폐기). 잡이 큐/실행 중일 때 토큰이 만료돼도 잡은 서버측 `user_id` 소유로 완료되어 다음 로그인 때 노출.
- **AC1**: 인증됐으나 미허용인 JWT는 직접 PostgREST·Realtime 호출에서 **0행/권한거부**(UI 리다이렉트만으로 끝내지 않음). 미허용 이메일 가입 시 `auth.users` 행이 생성되지 않는다.
- **AC2**: 자격증명 없는 클럽 요청 → "이 클럽 자격증명 미등록" 안내, 자동화 미실행.
- **AC3 (만료)**: 만료 인증은 [예약]을 실행·유실 없이 재로그인으로 라우팅.
- *권한 회수 런북(분실/관계 변화)*: `allowed_users`에서 제거 → Supabase admin signOut/delete-user로 리프레시 토큰 폐기 → 대시보드↔워커 공유 시크릿 회전.

### FR-2 자격증명 관리 & 온보딩 (평문은 Vercel을 거치지 않음)
- **초기 6세트 시드** = 소유자가 실행하는 **워커 시드 스크립트**(엔드유저 UI 아님, M1a 산출물).
- **인앱 갱신** = 설정 폼이 평문 id/pw를 **워커의 보호된 관리 엔드포인트로 TLS 직접 전송**. 워커만 `ENC_KEY`로 암호화해 `*_enc` 기록. (대시보드/Vercel 함수는 평문을 보지도 기록하지도 않음)
- "도움말"로 사용법 안내.
- **AC1 (누출 0)**: 평문 비밀번호·아이디·세션 쿠키/storage_state·동반자 멤버번호가 ① DB 텍스트 컬럼 ② 워커/Render 로그 ③ Supabase/Vercel 로그 ④ 저장된 실패 스냅샷 어디에도 없다. 실패 HTML 스냅샷은 **마스킹 후 워커측에만** 저장. 검증: 위 4곳 grep 시 `password`·세션 토큰·`ENC_KEY` **0건**.
- **AC2**: 비번 갱신이 이후 로그인에 즉시 반영.
- **AC3**: 자격증명 저장 중 Vercel 함수 로그/요청 캡처에 평문 비밀번호가 없다.

### FR-3 자연어 챗 보조 (NLU, M2.5 편의 계층)
- 챗 자유 발화에서 `의도(조회/예약/동반자/도움말)`, `클럽`, `날짜`, `시간대`, `인원`, `홀수`, `이동수단`을 추출해 **폼을 자동으로 채운다**.
- **기준 시각 `now`는 항상 클럽 현지(America/Los_Angeles)**, KST 단말·Supabase 리전과 무관. NLU는 **절대 날짜(YYYY-MM-DD, 현지)** 출력.
- 규칙: `오전`=tee_time<12:00, `오후`=tee_time≥12:00(12:00은 오후), `아침`=오전 동일. `이번/다음 ○요일`=오늘 이후 다음 발생, **오늘이 그 요일이면 오늘 제외 +7일**. `홀수` 미지정 시 18.
- **모호 항목**(=① 미언급 ② 다중 해석 ③ 단일 절대값 도출 불가)은 폼에서 **빈칸**으로 두고, 필수 필드가 비면 [조회]/[예약] 비활성.
- **AC**: 챗으로 채워진 폼을 **사용자가 확인·수정한 뒤** 실행(자동 실행 금지). 예시(오늘=2026-06-24 수, 현지 PT):
  | 발화 | club | date | time | players | holes |
  |---|---|---|---|---|---|
  | "토욜 아침 코토 와이프랑" | Coto de Caza | 2026-06-27 | 오전 | 2 | 18 |
  | "내일 오후 알리소" | Aliso Viejo | 2026-06-25 | 오후 | 미지정 | 18 |
  | "다음주 일요일 올드랜치 4명 9홀" | Old Ranch | 2026-07-05 | 미지정(빈칸) | 4 | 9 |
  | "이번 수요일" (오늘=수) | — | 2026-07-01 | — | — | — (오늘 제외 +7) |
  | "이번 주말" / "오전 늦게" | (모호) | 빈칸 | 빈칸 | — | — (필수면 버튼 비활성) |
  | KST 자정 직후 발화 "오늘" | — | 현지 PT 날짜 | — | — | — (전날 PT 선택 검증) |

### FR-4 빈 티타임 조회
- 해당 사용자·클럽 계정으로 invited 로그인 후 조건에 맞는 빈 슬롯을 조회·표시(현지 시간 표기).
- **AC1 (사전 검증, 워커 호출 전; 기준 `now`=클럽 현지)**: ① 과거 날짜/지난 시간(현지 기준) → 거절+가장 가까운 유효 날짜 제안. ② `booking_window` 초과 → **예약 오픈 날짜 AND 오픈 시각** 안내("6월 30일 오전 7시(현지)부터").
- **AC2 (빈자리 없음, 결정적 정렬)**: 요청 시간대 내에서 요청 기준시각에 **가장 가까운 슬롯 3개(오름차순)**; 그 시간대에 0건이면 같은 규칙을 하루 전체로 확대; 그래도 0건이면 `booking_window` 내 가용한 다음 날짜 안내.

### FR-5 동반자 DB
- 동반자 추가/조회/수정/삭제. 필드: `이름`, `멤버/게스트`(필수), `멤버번호`·`태그`·`메모`(선택). **부부 공용 읽기/쓰기**(둘 다 편집·삭제 가능 — 부부 전제). `created_by`/`updated_by` 기록(멤버번호 변경 추적).
- **AC**: 저장된 동반자가 예약 화면에서 칩/버튼으로 노출.

### FR-6 동반자 선택 / 즉석 게스트 / 필수 필드
- 예약 시 저장 동반자 선택 또는 즉석 게스트 추가.
- **AC1**: 멤버/게스트 구분 반영.
- **AC2**: 예약 폼이 요구하는 필드(예: **플레이어별 멤버번호**, 게스트 이름)가 동반자 레코드에 없으면 **되물어 입력**(조용한 실패 금지). 정확한 필드 목록은 **M0 ⑥** 산출물에서 확정(가장 흔한 무음 실패 지점).

### FR-7 예약 실행 (반자동)
- 슬롯·동반자·홀수·이동수단 확정 후 사용자가 **[예약]** 을 누르면 앱이 invited에 실제 예약.
- **AC1**: 사용자 확인 없이는 예약이 발생하지 않는다.
- **AC2 (인원 검증)**: 총 인원(본인+동반자)과 `player_count` 대조, **포섬 최대(본인 포함 4인)** 및 클럽 제한 초과 시 차단·안내, 자동화 미실행.
- **AC3 (신선도, TTL=10분)**: 선택 상태 TTL 10분. 만료 또는 동일 조건 재조회가 없으면 실행 시 **강제 재조회**. 실행 직전 슬롯 가용성 재확인.
- **AC4 (배우자 충돌, 자문성)**: 확정 직전 `(club_id, tee_datetime)` 충돌을 **워커(service_role)** 또는 **SECURITY DEFINER RPC `slot_conflict()`**(불리언/소유자 표시명만 반환)로 조회 → 배우자가 같은 슬롯을 `requested/confirmed`면 경고·재확인. invited에서 직접 한 예약은 보이지 않아 **자문성**임을 안내. 3개 클럽 간 같은 사람/동반자 시간 겹침도 자문성 경고.
- **AC5 (중복 차단)**: 생성 시점에 중복 활성 잡 차단 — `jobs`에 `(user_id, type, club_id, tee_datetime) WHERE status IN ('queued','running')` 부분 유니크(기존 잡 id 반환). `bookings`에도 `(user_id, club_id, tee_datetime)` 부분 유니크. 생성 응답 전까지 [예약] 버튼 비활성. 결과 불명/타임아웃 시 **자동 재시도 금지**, "예약 상태 확인 필요" 표시.

### FR-8 결과 보고
- **성공 판정은 확인번호와 독립**: 제출 후 검증(확인 페이지 감지 **또는** 계정 예약 목록 노출). 확인번호 있으면 포함, 없으면 "확인번호 미제공" 명시.
- 실패 시 **분류 사유**: `자격증명 오류`/`슬롯 마감`/`봇 차단·캡차`/`사이트 구조 변경`/`타임아웃`/`기타`.
- **CAPTCHA/OTP/기기 인증 시** 막다른 실패 대신 **수동 인계**: invited 해당 페이지 딥링크 + 선택한 슬롯·동반자·홀수를 보여줘 사용자가 직접 마무리(반자동 → 보조-수동으로 격하).
- 취소·변경은 비목표(N4): "취소는 invited 사이트에서 직접" 안내.
- **AC**: 성공/실패가 명확히 구분, 실패는 위 분류 중 하나.

### FR-9 비동기 잡 & 실시간 갱신
- **픽업 방식 확정**: Vercel 서버액션이 `jobs`를 INSERT한 뒤 **동기적으로 워커 `POST /run`(잡 id, 공유 시크릿 헤더)** 호출 → 워커가 **원자적으로 클레임**해 처리. 30초 저빈도 폴링은 **누락 트리거 백업**으로만. Render는 **상시 가동**(유료 또는 cron 핑)으로 스핀다운/콜드스타트를 성능 예산에 반영.
- **원자적 클레임**: `UPDATE jobs SET status='running', claimed_by, claimed_at, locked_until=now()+budget WHERE id=:id AND status='queued' RETURNING *`(0행=이미 클레임, 스킵). 폴링은 `FOR UPDATE SKIP LOCKED`.
- **정체 잡 reaper + 타임아웃**: `locked_until`(lookup 90s, book 120s) 경과한 `running` 잡을 reaper가 `failed`('worker_lost/timeout')로 전환. **book 잡은 자동 재시도 금지** — "예약 상태 확인 필요"로 표시, 예약 생성 안 함(FR-7 AC5).
- **Realtime 끊김 보정**(iOS Safari PWA 백그라운드/WS 드롭 대비): ① 페이지 로드·visibilitychange→visible·Realtime 재연결 시 진행 중 잡 상태 1회 fetch ② 열린 잡이 있는 동안 5초 폴링 폴백(Realtime와 독립) ③ 생성 응답이 준 잡 id로 구독(구독 전 전이는 즉시 fetch로 백필).
- **AC**: [조회]/[예약] 탭 후 **1초 내 진행 표시**, 잡 done/failed 시 **새로고침 없이 ≤2초 내 결과 갱신**. Realtime가 끊겨도 최종 상태가 화면에 N초 내 표시.

### FR-10 다계정 라우팅 (워커 권한·잡 소유권)
- 로그인 사용자에 따라 해당 사용자의 invited 계정·자격증명 사용.
- 워커→Supabase는 **service_role 키**(Render env에만). 워커는 매 잡마다 `credentials WHERE user_id=job.user_id AND club_id=job.club_id`로 자격증명을 **재도출**하고, params의 credential_id를 신뢰하지 않는다. `jobs` INSERT 정책은 `WITH CHECK (user_id = auth.uid())`.
- **AC**: 해당 `user_id`가 `club_id` 자격증명을 소유하지 않는 잡은 **로그인 시도 없이 실패(fail-closed)**.

### FR-11 로그인 세션 재사용 (성능 최적화)
- `storage_state`를 암호화 저장·재사용해 재로그인 빈도 감소.
- **유효 세션 정의**: `expires_at` 미래 **그리고** 경량 인증 프로브가 "로그인됨" 반환.
- `storage_state` 쓰기는 **해당 자격증명 advisory lock 보유 중에만**(또는 충돌 시 낙관적 version 체크)으로 두 잡이 서로 덮어쓰지 않게 한다.
- **AC**: `jobs.auth_mode`에 `session_reuse`/`full_login` 기록. 가능 여부·수명은 M0 확인(R6).

### FR-12 예약 이력 (도구 발생분 한정)
- 도구로 발생한 예약 `요청(requested)·확정(confirmed)·실패(failed)`를 로그로 저장(감사·멱등). invited에서 직접 한 예약은 범위 밖.
- 이력 화면(설정/이력)에서 최근 예약 조회.

### FR-13 PWA / 모바일 (객관 기준)
- 아이폰 모바일 우선 반응형. 매니페스트로 **홈화면 추가(PWA)** 가능. 오프라인 동작은 비목표.
- **AC (체크리스트, 지정 기기 = 예: iPhone 14 / 최신 iOS Safari)**: ① `manifest.webmanifest`에 name·start_url·`display:standalone`·192/512px 아이콘, iOS "홈 화면에 추가" 동작 ② 홈 아이콘 실행 시 주소창 없는 standalone ③ 390px 뷰포트에서 **US-2·US-3 가로 스크롤 없음**, 주요 버튼([조회]/[예약]/슬롯선택) 탭 타깃 ≥44×44pt ④ 위 항목이 지정 기기에서 통과. *주요 흐름 = US-2 + US-3.*

---

## 7. 비기능 요구사항 (Non-Functional)

- **NFR-인증/권한**: Supabase Auth Google + **DB 강제 허용목록**(`is_allowed_user()`)을 모든 RLS에 적용. `bookings/credentials/jobs`는 per-user, `companions/clubs/allowed_users`는 공용/공통. **유일한 교차사용자 읽기 경로 = `slot_conflict()` RPC와 워커(service_role)**(FR-7 AC4) — §9가 FR-7과 모순되지 않음.
- **NFR-보안**: 자격증명·세션 AES-256-GCM, `ENC_KEY`는 워커 env에만. **Vercel 서버/함수는 평문 자격증명을 보거나 기록하지 않음.** 워커 관리 엔드포인트는 **Supabase JWT 서명+허용목록을 서버측 검증**, 레이트리밋, **브라우저 오리진에서 도달 가능한 유일 라우트**(나머지 워커 라우트는 브라우저 오리진 거부), CORS는 대시보드 오리진으로 제한. 전 구간 HTTPS.
  - **키 관리**: `ENC_KEY` 안전 백업. 분실 → 6세트 재시드. **회전(노출 의심) 런북**: 워커가 구키로 전체 `*_enc` 복호화→신키로 재암호화하는 점검 스크립트(대시보드는 키가 없어 불가).
- **NFR-개인정보**: 2인 전용. 동반자·자격증명 최소 보관(멤버번호 포함). 동반자는 의도적 부부 공용.
- **NFR-신뢰성**: 자동화 실패 시 **안전 실패**(임의 예약 금지). 일시 오류만 백오프 재시도. **CAPTCHA/OTP/기기 인증 시 재시도 없이 중단·수동 인계**(FR-8). 정체 잡 reaper(FR-9). 실패 시 마스킹된 HTML 스냅샷(워커측).
- **NFR-성능**: 측정창=탭→결과 렌더. 세션 재사용 p50≤30s·p95≤60s, 콜드 로그인 p95≤120s. 진행 1초 내 표시.
- **NFR-동시성**: `jobs` 원자적 클레임(`claimed_by/claimed_at/locked_until/attempt`), 같은 계정은 **`pg_try_advisory_lock(credential_id)` 비블로킹 직렬화**(획득 실패 시 슬롯 점유 없이 소폭 백오프 후 재큐 또는 "같은 계정 작업 진행 중"). 사용자별 독립 BrowserContext. `sessions` 쓰기는 락 보유/낙관적 version.
- **NFR-비용**: 2인용 무료~소액(단, Render 상시 가동분 고려). NLU는 `claude-haiku-4-5`.
- **NFR-유지보수**: 클럽별 셀렉터·플로우를 **어댑터 모듈**로 격리.
- **NFR-준법/ToS**: invited 약관상 자동화 제한 가능. 저빈도 개인 사용, 차단 시 중단·수동 전환.

---

## 8. 시스템 구성 / 핵심 기술 결정

```
[아이폰 브라우저/PWA] ⇅ Supabase Realtime + 5초 폴링 폴백(잡 상태)
        │  ① Google 로그인(허용목록 DB 강제)
        ▼
[Vercel: Next.js(TS)]  ── ② 잡 INSERT(queued) ─▶ [Supabase(Postgres+Auth+Realtime, RLS)]
  · 폼 API/서버액션                                    ▲  ④ 잡 상태/결과 (service_role)
  · 챗 NLU(Claude): 발화→폼 필드(자격증명 미포함)         │
        │  ③ POST /run(잡 id, 공유 시크릿)  ┌── 평문 자격증명 직행(TLS, JWT+허용목록 검증)
        ▼                                  │
[워커: Render(Node/Playwright), service_role + ENC_KEY]
  · 원자적 클레임 → 자격증명 재도출/복호화 → invited 로그인(세션 재사용/프로브) → 조회·예약 → jobs/bookings 갱신
```

- **인터페이스**: 웹 대시보드(폼/버튼 + 챗 보조), 아이폰 모바일 우선 PWA.
- **인증**: Supabase Auth Google, DB 강제 허용목록 + RLS.
- **자동화**: invited 공개 API 없음 → Playwright(아이디/비번). 워커(Render 상시).
- **비동기**: `jobs` 큐(원자 클레임+reaper) + Realtime(+폴링 폴백).
- **NLU**: Claude `claude-haiku-4-5` (Vercel에서 **발화만** 처리, 자격증명/세션 미접촉; 발화는 제3자 Claude API로 전송됨 — 10절).

---

## 9. 데이터 요구사항 (요약)

- **allowed_users** (email) — 허용목록 진실원천, `is_allowed_user()`가 참조, 모든 RLS에 적용
- **users** (id=auth uid, email, display_name)
- **clubs** (name, provider[invited|trinity(차기)], timezone, **booking_window_days**, **open_time_local**, 그룹/게스트 제한)
- **credentials** (user×club, 암호화 username/password, status) — unique(user, club), **per-user RLS**
- **sessions** (credential별 암호화 storage_state, expires_at, version) — 쓰기는 advisory lock/version
- **companions** (name, type[member/guest], member_number?, tags?, note?, created_by, updated_by) — **부부 공용 RLS**
- **bookings** (user, club, tee_datetime, players[], holes, transport, **status[requested|confirmed|failed|cancelled(차기)]**, confirmation_ref?, error?) — `(user,club,tee_datetime)` 부분 유니크, per-user RLS
- **jobs** (user, type[lookup/book], params, status[queued|running|done|failed], result, error, auth_mode, **claimed_by, claimed_at, locked_until, attempt**) — 큐+감사, Realtime 구독, `(user,type,club,tee_datetime) WHERE status IN(queued,running)` 부분 유니크, per-user RLS, INSERT `WITH CHECK(user_id=auth.uid())`
- **chat_sessions** (user, state, expires_at[TTL 10분])

상세 스키마·RLS 정책은 설계 문서 6·9절 참조.

---

## 10. 외부 의존성 & 제약

- **invited**: 공개 API 없음(자동화 의존), ToS상 자동화 제한 가능, 구조 변경 위험.
- **Supabase**: Auth(Google)·DB·Realtime·service_role 의존.
- **Vercel**: 서버리스 실행시간·헤드리스 브라우저 한계 → 자동화는 워커로 분리.
- **Render / Claude API**: 가용성·요금 의존. 워커 상시 가동 필요.
- **Claude API(제3자)**: 챗 발화("와이프랑" 등)가 외부로 전송됨 — 발화 외 PII는 보내지 않고, 자격증명/세션은 절대 포함하지 않음.
- **아이폰 PWA**: iOS Safari의 PWA 제약(푸시·백그라운드 제한) — v1은 포그라운드 사용 전제.

---

## 11. 범위 & 단계 (Milestones)

| 단계 | 내용 | 산출물 |
|---|---|---|
| **M0 스파이크** | *로컬 일회성 Playwright 스크립트(인프라 없음)* | Coto+당신 계정 ①로그인 ②조회 ③예약폼 도달 ④세션 저장·재사용·수명 ⑤예약오픈 **날짜+시각** ⑥**예약 폼 필드(홀수/카트/플레이어별 멤버번호/게스트)** ⑦확인번호 가능 여부 ⑧봇차단 유무 |
| **M1a 기반** | Next.js+Vercel + Supabase Auth(Google, DB 허용목록) + **전체 스키마/RLS** + AES 자격증명 시드/라운드트립 + **모바일 반응형 레이아웃** | 워커 없이 서버측 단순 read로 검증 |
| **M1b 비동기 루프** | `jobs` 큐 + Render 워커 + 공유시크릿 트리거 + 원자클레임/reaper + Realtime/폴링 | Coto 조회 어댑터로 E2E. *매 요청 풀로그인 허용* |
| **M1.5 세션 재사용** | (M0 확인 시) | 세션 재사용으로 응답 단축 |
| **M2 예약+동반자** | Coto 예약 실행(M0 ⑥ 선행) + 동반자 CRUD/선택 UI + **PWA 매니페스트·iOS 홈추가·standalone 검증(FR-13 AC)** | 예약 가능 + PWA |
| **M2.5 챗 보조** | Claude NLU 폼 자동채움(확인 후 실행) | 챗 입력 지원 |
| **M3a 다계정** | 아내 Google + 아내 Coto 자격증명 | 2계정, 공용 동반자 검증 |
| **M3b/M3c 클럽 확장** | Aliso / Old Ranch 어댑터 | 각각 M0식 미니검증 후 추가 |
| (차기) | **카카오톡(2단계)** · 트리니티 · 자동알림 · 취소·변경 | — |

---

## 12. 리스크 & 미해결 (M0에서 해소)

- **R1**: invited 봇 탐지(Cloudflare 등) → 차단 시 자동화 불가.
- **R2**: 사이트 구조 변경으로 자동화 깨짐 → 어댑터로 영향 최소화.
- **R3**: 클럽별 예약 오픈 **날짜+시각**·조회 범위 미확정.
- **R4**: 예약 폼의 동반자·홀수·카트·플레이어별 멤버번호 입력 방식 미확정.
- **R5**: 예약 확인번호 취득 가능 여부(미취득이어도 FR-8 검증으로 성공 판정).
- **R6**: 로그인 세션 재사용 가능성·유효기간 미확정(불가 시 콜드 로그인 예산으로 운영).
- **R7**: Render 상시 가동 비용/방식(유료 vs cron 핑) 확정 필요.

---

## 13. 향후 확장

**카카오톡 챗봇(2단계, 동일 백엔드 재사용)** · 트리니티클럽 · 조건부 자동예약/열림 알림 · 예약 취소·변경 ·
(선택) Gmail의 invited 확인메일 연동으로 예약 상태 교차검증.
