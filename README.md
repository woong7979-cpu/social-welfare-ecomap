# 사회복지 가계도 · 생태도 자동작성 웹앱

인터뷰 텍스트만 넣으면 가계도(Genogram)와 생태도(Ecomap)를 자동으로 그려주고, 누락된 사정(assessment) 항목을 시각적으로 알려주는 웹 도구입니다.

> 사회복지실천 사정 도구 학습용 오픈 데모.  
> 📌 개인정보 비저장 — 인터뷰 본문은 서버에 보관되지 않습니다.  
> 📌 샘플 케이스는 학습 시연 목적의 가상 사례로, 실제 인물·기관과 무관합니다.

---

## ✨ 기능 (v0.1)

- 📝 **인터뷰 텍스트 입력** → Claude API가 가족구조·외부체계로 자동 추출
- 👨‍👩‍👦 **가계도 SVG 자동 렌더** — 3세대까지, 사망/본인/누락 시각화
- 🌐 **생태도 SVG 자동 렌더** — 방사형 외부체계, 긴장/긍정/불확실 라인
- 🧩 **보강 인터뷰 가이드** — 8대 표준 카테고리(직업/교육/종교/의료/이웃/친구/여가/학습) 중 빠진 항목 알림
- 🎁 **샘플 케이스 1클릭 시연** — 가상 한부모 가정 사례(의뢰인 A)로 즉시 시각화

> 후속 단계: 음성(녹음) 입력 → Whisper 전사 / 클라이언트 상황별 복지서비스 추천

---

## 🚀 5분 배포 (GitHub → Vercel)

### 1. GitHub 레포 생성

```powershell
cd C:\Users\error\Desktop\사회복지_생태도
git init
git add .
git commit -m "init: 사회복지 가계도/생태도 자동작성 v0.1"
gh repo create social-welfare-ecomap --public --source=. --push
```

> `gh`(GitHub CLI)가 없으면 [github.com/new](https://github.com/new)에서 빈 레포 만든 뒤 `git remote add origin ...` + `git push -u origin main`.

### 2. Anthropic API 키 발급

1. [console.anthropic.com](https://console.anthropic.com/settings/keys) 접속
2. **Create Key** → 복사 (`sk-ant-...`)

### 3. Vercel 연동

1. [vercel.com/new](https://vercel.com/new) 접속 → GitHub 레포 import
2. Framework Preset: **Other** (자동 인식됨)
3. **Environment Variables** 추가:
   - `ANTHROPIC_API_KEY` = 위에서 발급한 키
   - (선택) `ANTHROPIC_MODEL` = `claude-sonnet-4-5` (정확도↑, 비용↑)
4. **Deploy** 클릭

배포 완료 후 `https://<프로젝트명>.vercel.app` 으로 접속.  
이후 `git push` 마다 자동 재배포됩니다.

---

## 🖥️ 로컬 개발

```powershell
npm install
npx vercel dev          # API 함수까지 로컬에서 시뮬레이션
# 또는: API 없이 정적 미리보기만 (샘플 보기로 확인)
npx serve .
```

`.env.example`을 `.env.local`로 복사하고 키 입력:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 📐 가계도/생태도 표기 규칙

| 표기 | 의미 |
|---|---|
| ▢ 사각형 | 남자 |
| ○ 원 | 여자 |
| ◇ 마름모 | 성별 미상 |
| ⊠/⊗ | 사망 |
| 굵은 파란 테두리 | 본인(클라이언트) |
| 회색 점선 + ❓ | 정보 누락 |
| ─── 실선 | 긍정적 관계 |
| ┄┄┄ 점선 | 불확실/미약 관계 |
| ╫╫╫ 톱니선 | 긴장 관계 |
| → 화살표 | 도움을 주고받는 방향 |
| 선 굵기 1~3 | 관계 강도 |

---

## 🗂️ 프로젝트 구조

```
사회복지_생태도/
├── index.html              # UI 진입점
├── public/styles.css       # 스타일
├── src/
│   ├── render-genogram.js  # 가계도 SVG (세대별 레이아웃)
│   ├── render-ecomap.js    # 생태도 SVG (방사형 레이아웃)
│   ├── missing-checker.js  # 누락 사정항목 결정론적 탐지
│   └── sample-case.js      # 샘플 데이터 (가상 한부모 가정 사례)
├── api/parse.js            # Vercel Serverless: Claude API 호출
├── package.json            # @anthropic-ai/sdk
├── vercel.json             # 함수 런타임 설정
└── README.md               # 이 파일
```

---

## 🔒 개인정보·보안

- **API 키는 서버사이드(`api/parse.js`)에서만 사용** — 브라우저에 절대 노출되지 않습니다.
- 인터뷰 본문은 Claude API에 1회 전송되며, **자체 서버에 저장되지 않습니다**.
- 실제 클라이언트 정보를 다룰 때는 **사전 동의** 후 익명화하여 입력하는 것을 권장합니다.

---

## 📚 참고

- NASW Code of Ethics, 한국사회복지사 윤리강령
- McGoldrick et al. *Genograms: Assessment and Intervention* — 표기법 표준
- Hartman, A. *Diagrammatic Assessment of Family Relationships* — 생태도 원전
