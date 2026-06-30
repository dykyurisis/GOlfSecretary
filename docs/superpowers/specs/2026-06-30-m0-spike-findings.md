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

## 아직 미확인 (자격증명 필요 — 다음 단계)
- ② 로그인 성공 후 **빈 티타임 조회** 페이지(URL/파라미터/날짜·시간 필터)
- ③ **예약 폼** 도달 및 ⑥ 입력 필드(홀수/카트/**플레이어별 멤버번호**/게스트 — FR-6 AC2)
- ④ **세션 쿠키 이름·수명**, 재사용 가능 여부 실측 (R6)
- ⑤ 클럽별 **예약 오픈 날짜+시각** (R3)
- ⑦ 예약 **확인번호** 취득 가능 여부 (R5)
- ⑧ **인증 영역**에서의 Cloudflare/봇 탐지 강도 (R1 잔여) — 로그인 POST와 로그인 후 페이지에서 재확인 필요

## 다음 단계
Coto(facility 29) + 남편 계정으로 실제 로그인 → 조회·예약폼까지 매핑.
→ invited 자격증명 입력 방식(평문을 채팅에 붙여넣지 않는 안전한 방법)을 먼저 정한 뒤 진행.
