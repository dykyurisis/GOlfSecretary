# M0 스파이크 — 정찰 결과 (자격증명 불필요 단계)

- 작성일: 2026-06-30
- 방법: Playwright(헤드리스 자동 브라우저, 워커가 쓸 것과 동일 방식)로 invited 공개/로그인 페이지 정찰
- 범위: 로그인 **전**까지만. 로그인 이후(조회·예약·세션 수명)는 자격증명 필요 → 다음 단계.

## 요약 (한 줄)

invited 회원 포털은 **레거시 Classic ASP 사이트**라 자동화가 **수월하고 안정적**일 것으로 보이며,
공개·로그인 페이지에서 **봇 차단 챌린지는 발생하지 않았다**. 로그인 모델은 **계정 1개 = 멤버십(클럽) 1개**로,
앞서 가정한 **6세트 자격증명 모델과 일치**한다.

## 확정된 사실

### 1. 진입점 / 로그인 폼
- 마케팅 사이트 `https://www.invitedclubs.com` → **"Member Login"** →
  **`https://members.invitedclubs.com/club/scripts/login/login.asp`** (제목: "Invited Member Login")
- 로그인 폼 (`form#frmLogin`, **POST** → `…/login/Login_Validate.asp?GRP=0`):
  - 아이디: `input[name="user"]`
  - 비밀번호: `input[name="pw"]`
  - 자동로그인: `input[name="save_login"]` (체크박스, "remember me")
  - 제출: `button[type=submit]` "Log In"
- 같은 페이지에 **신규 등록 폼**(`form[name=frmNew]` → `user_signup.asp`)이 별도로 있고, 거기에만 클럽 선택 드롭다운(`#NEW_MEMFAC_ID`)이 있음.

### 2. 로그인 모델 = 멤버십당 계정 (6세트 모델 확정)
- **로그인 자체에는 클럽 선택이 없다** — `user`/`pw` 한 쌍으로 로그인. 클럽 드롭다운은 *등록* 전용.
- 즉 멤버는 클럽마다 별도 `user`/`pw`를 가짐 → **2명 × 3클럽 = 6세트** 설계와 정확히 일치.

### 3. 클럽 식별자 (invited facility ID = `MEMFAC_ID`)
| 클럽 | facility ID |
|---|---|
| Coto de Caza Golf & Racquet Club | **29** |
| Aliso Viejo Country Club | **149** |
| Old Ranch Country Club | **40295** |
- 전체 135개 클럽이 같은 포털에 등록됨(Invited/ClubCorp 네트워크). → `clubs` 테이블에 `invited_facility_id` 컬럼 추가 권장.

### 4. 봇 차단 / 캡차 (R1 — 부분 확인)
- 로그인 페이지에 **reCAPTCHA·hCaptcha 없음**. 캡차 위젯 없음.
- **Cloudflare가 앞단에 존재**(HTML/CDN 흔적)하나, 자동 브라우저(Chromium)로 공개·로그인 페이지 접근 시 **챌린지/차단 페이지가 뜨지 않음** — 정상 렌더링.
- 페이지 내 POST는 Google Analytics(GA4)뿐 → 평범한 정적 로그인 페이지.

### 5. 기술 스택 → 자동화 친화적
- `.asp` 확장자 + 폼 POST + `save_login` → **Classic ASP / IIS** 레거시. 모던 SPA가 아니라 **셀렉터가 안정적**이고 깨질 위험이 낮음(R2 완화 신호).
- `save_login`(자동로그인) 존재 → **쿠키 기반 세션 지속** 가능성 높음 → 세션 재사용 전략(R6)에 긍정적.

## 설계에 반영할 점
- 워커 invited 어댑터의 로그인 셀렉터 확정: `#frmLogin input[name="user"]`, `input[name="pw"]`, 제출 버튼.
- `clubs`에 `invited_facility_id`(29/149/40295) 추가.
- Cloudflare 대비: 실제 Chromium(Playwright) 사용 + 사람스러운 페이싱 + 세션 재사용으로 로그인 횟수 최소화 유지(설계대로).
- (참고) `.asp` POST 엔드포인트라 이론상 HTTP 레벨 요청도 가능하나, 쿠키·JS·Cloudflare 안전성 위해 **Playwright 유지** 권장.

## 자격증명 단계 결과 (로그인 이후 — Coto + 남편 계정, 2026-06-30)

> 방법: `.env`를 직접 읽는 Node Playwright 스크립트(`scripts/m0-spike.mjs`, `m0-teetime.mjs`, `m0-teesheet.mjs`). 비밀번호는 도구 인자·출력에 노출 안 됨. 결과 덤프는 `.m0-out/`(gitignore).

- **로그인 성공** ✅ — **데이터센터(클라우드) IP에서 캡차/2FA/기기인증 없이** 로그인 → 회원홈 `mylocker.asp` ("Coto … Members Home"). → **Render 같은 클라우드 워커도 로그인 가능하다는 강한 신호.**
- **세션/쿠키 (R6 긍정)**: `ASPSESSIONID…`(httpOnly, 세션), `MemberToken`(httpOnly, **~2시간**), **`LOGIN_KEY`(remember-me, ~1년)** + `LAST_ENTERED_USER`. → 세션 재사용·지속 가능성 높음(재로그인 실측은 추가 확인 권장).
- **티타임 예약 = 별도 Oracle Portal 앱 `CCTTWEB`** (`apps.invitedclubs.com/portal/pls/portal/!CCTTWEB.controller`). 회원홈 **"Book A Tee Time"** 이 SSO(ID 토큰) 링크로 진입, 같은 세션 쿠키로 접근 성공. (다른 호스트 `apps.invitedclubs.com`)
- 앱 진입 화면 = 클럽 선택(네트워크 state→club / 대체 홈클럽 / **Continue to Home Club**). 이 계정엔 대체 홈클럽으로 **Aliso**도 노출됨.
- **빈 티타임 조회(스크래핑) 가능** ✅ — "Continue to Home Club" → 티타임 시트. 행 구조: **Club / Course(NORTH·SOUTH) / Play Date / Tee Time / Player Slots Available**. 예: SOUTH Tue 06/30 02:20PM=**2**, Wed 07/01 08:10AM=**0**, Thu 07/02 02:30PM=**1**. → 잔여 슬롯 그대로 파싱 가능.
- **예약 가능 범위(R3, 부분 확인)**: 날짜 스트립 **오늘(6/30)~7/14 ≈ 14일** 노출 → 사용자가 말한 "2주 전 오픈"과 일치. (별도 "06/30–07/29" 30일 표기도 보임 — *조회 범위 vs 예약 범위* 구분 추가 확인 필요.) **정확한 오픈 시각(6:30am·초 단위)** 은 1회 로드로는 불가 → 별도 관측 필요.

## ⚠️ 핵심 리스크 발견 — 예약 앱에 invisible reCAPTCHA Enterprise

- 티타임 앱(`apps.invitedclubs.com`)에 **invisible reCAPTCHA Enterprise** 프레임 존재 (site key `6LdkWCUsAAAAAD3GpH6MnrHDDTieVv2wtUGE5R6Y`, `size=invisible`).
- 로그인·**티타임 조회/스크래핑은 차단되지 않음**(데이터 정상 수신). 그러나 invisible reCAPTCHA는 보통 **점수 기반**으로 **민감 액션(예약 제출)** 시 평가 → **자동 브라우저가 낮은 점수로 차단될 수 있음.**
- **함의**: 조회는 안전, **실제 예약 제출(특히 스나이핑의 빠른 자동 제출)이 막힐 위험** = 자동 예약 신뢰성의 **최대 미확인 리스크.**
- **검증 딜레마**: booking-submit reCAPTCHA 확인 = **실제 예약 생성** 필요(원치 않는 예약). → 스파이크에서 임의 예약 금지. 별도 전략 필요.

## 예약 폼 구조 (매핑 완료 — 제출/수정 안 함)

- 티타임 행의 **"View/Edit"**(`.cc-col-action-only.cc-selectable` div, onclick) 클릭 → 인라인으로 **플레이어 그리드** 펼쳐짐.
- 그리드 = **최대 4인(포섬)**, 컬럼: **Player(1–4) / Player Type / Player Name / Player Email**.
  - Player Type: **Member / Guest / Open**(빈 슬롯=Open).
  - 매핑 시 열린 행은 *본인의 기존 예약*이었음: `1 Member Ellie Yune`, `2 Member Dae Young Kim`, `3 Open`, `4 Open` → **신규 생성/수정 없음(무해)**.
- `p_sel_all` 체크박스(플레이어 일괄선택), **"Cancel"** 버튼 존재.
- **보너스 규칙**: *"Today's tee times cannot be maintained if you are within 24 hour(s) of your tee time. (CCTT-535B)"* → **티타임 24시간 이내 수정 불가**.
- **reCAPTCHA가 booking 상호작용에서 실제 execute됨**(`recaptchaExecuted=true`). 단 **제출은 안 했으므로 차단 여부는 여전히 미확정**.
- **중요 뉘앙스**: 이 "My Tee Times" 화면은 **본인이 속한 티타임**(기존 예약+빈자리)을 보여주는 것으로 보임. *빈 슬롯에 신규 예약하는 플로우*(날짜 스트립의 특정 날짜 → 그날 예약 가능한 티타임)는 추가 매핑 필요(구현 단계).
- **설계 반영**: 동반자 필드에 **이메일** 추가 고려(폼에 Player Email 존재). 타입 Member/Guest/Open, **포섬 4인 제한 확정**. 홀수/카트는 이 수정뷰엔 없음 → 신규예약 플로우에서 확인.

## M0 체크리스트 현황

| 항목 | 상태 |
|---|---|
| ① 로그인 | ✅ 캡차/2FA 없음, 클라우드 IP OK |
| ② 빈 티타임 조회 | ✅ 구조화된 시트, 잔여 슬롯 파싱 가능 |
| ③ 예약 폼 도달 | ✅ 플레이어 그리드 매핑(4인, Type/Name/Email) |
| ④ 세션 재사용 | 🟡 긍정(LOGIN_KEY 1년·MemberToken 2h), 실측 재확인 권장 |
| ⑤ 예약 오픈 | 🟡 ~14일 창 확인, 정확 오픈 시각 미확인 |
| ⑥ 폼 필드 | 🟡 플레이어 그리드(Member/Guest/Open·Name·Email) 확정; 홀수/카트는 신규예약 플로우에서 확인 |
| ⑦ 확인번호 | ⏸ 미확인 (신규예약 제출 시) |
| ⑧ 봇 탐지 | ⚠️ invisible reCAPTCHA Enterprise — 조회 통과, booking 상호작용서 execute 확인, **제출 차단 여부 미확정** |
| ⑨ (보너스) 24h 수정 제한 | ✅ 발견 (CCTT-535B) |

## 결론 / 권고

- **조회 기능은 확실히 가능**(로그인+스크래핑 검증됨). 핵심 자동화의 절반은 청신호.
- **자동 예약의 관건은 reCAPTCHA Enterprise.** 다음 중 하나로 진행 결정 필요:
  - (A) 슬롯 1개를 클릭해 **예약 폼 구조만 매핑(최종 제출 안 함)** → ⑥ 필드 확보 (소량의 임시 홀드 가능성)
  - (B) **reCAPTCHA 대응 전략**: 실제로 원하는 라운드 1건을 의도적으로 예약해 제출 동작·reCAPTCHA 결과 확인 / 막히면 **보조-수동(딥링크 인계)** 으로 격하하는 설계 채택
  - (C) **정확한 오픈 시각**은 실제 오픈 시점(특정일 6:30am 전후) 관측 필요 — 스나이핑 설계의 선행 조건
- 설계 영향: `clubs`에 `invited_facility_id`, 코스(NORTH/SOUTH) 개념, 예약앱 호스트(`apps.invitedclubs.com`)·SSO 흐름·reCAPTCHA 대응을 어댑터에 반영.
