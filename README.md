# 3초체크

중고거래 대화 캡처 이미지를 AI로 분석해 사기 가능성을 점검하는 웹 앱입니다.

## 구조

```
index.html                    # 프론트엔드 (이미지만 업로드)
supabase/
  config.toml                 # Supabase 프로젝트 설정
  functions/analyze/index.ts  # Claude API 호출 Edge Function
```

- **프론트엔드**: Supabase Edge Function `analyze` 호출 (anon 키만 사용)
- **백엔드**: Edge Function에서 `ANTHROPIC_API_KEY`로 Claude API 호출

## 배포 방법

### 1. Supabase CLI 설치 및 로그인

```bash
brew install supabase/tap/supabase
supabase login
```

### 2. 프로젝트 연결

```bash
cd "/Users/jcy/3sec Check"
supabase link --project-ref fuoecdqugmjzuyvbwmfo
```

### 3. Claude API 키를 Supabase Secret으로 등록

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-여기에-본인-키
```

### 4. Edge Function 배포

```bash
supabase functions deploy analyze
```

### 5. 사이트 열기

```bash
open index.html
```

또는 정적 호스팅(Netlify, Vercel, GitHub Pages 등)에 `index.html` 업로드.

## 환경 변수

| 이름 | 위치 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Supabase Secrets | Claude API 키 (서버 전용) |

프론트엔드의 Supabase URL·anon 키는 `index.html`에 설정되어 있습니다. anon 키는 공개되어도 되는 키이며, Claude API 키는 Edge Function에만 존재합니다.

## API 스펙 (Edge Function)

**POST** `https://fuoecdqugmjzuyvbwmfo.supabase.co/functions/v1/analyze`

**Headers**
- `Authorization: Bearer <SUPABASE_ANON_KEY>`
- `apikey: <SUPABASE_ANON_KEY>`
- `Content-Type: application/json`

**Body** (여러 장 권장, 최대 5장)
```json
{
  "images": [
    { "image_base64": "<base64>", "media_type": "image/jpeg" },
    { "image_base64": "<base64>", "media_type": "image/png" }
  ]
}
```

단일 이미지(하위 호환):
```json
{
  "image_base64": "<base64 문자열>",
  "media_type": "image/jpeg"
}
```

**Response (성공)**
```json
{
  "risk_level": "safe",
  "patterns": [],
  "comment": "...",
  "action_items": ["맞춤 행동 요령 1", "맞춤 행동 요령 2"],
  "partial_capture": true,
  "context_note": "대화 일부만 확인됨, 전체 맥락 확인 권장"
}
```

**Response (실패)**
```json
{
  "error": "오류 메시지"
}
```
