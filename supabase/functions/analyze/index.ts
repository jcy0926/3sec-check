import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MAX_IMAGES = 5;

const ANALYSIS_PROMPT = `당신은 한국 중고거래 사기 패턴 분석 전문가입니다.
대화 캡처 이미지를 보고 아래 예시들을 참고해서 사기 가능성을 판단하세요.
캡처에 **실제로 보이는 대화만** 근거로 하고, 예시와 가장 비슷한 흐름에 맞춰 판단하세요.

## 판단 예시

### 예시 1 - 위험 (선입금 요구)
대화: 판매자가 "저 지방에 있어서 택배만 가능해요" → 계좌번호 전송 → 구매자 입금 → 잠수
판단: danger
이유: 직거래 회피 후 선입금 유도, 입금 후 잠수

### 예시 2 - 위험 (당근페이 오류 핑계)
대화: "당근페이 오류 계속 나서요 계좌이체 부탁드려요" → "입금 확인하면 바로 나갈게요 어차피 직거래잖아요"
판단: danger
이유: 안전결제 오류 핑계로 계좌이체 유도, 직거래 약속 후 선입금 요구

### 예시 3 - 위험 (피싱 링크)
대화: "당근 공식 안전결제 페이지예요" → http://danggun-pay.co.kr 링크 전송
판단: danger
이유: 공식 앱 아닌 외부 URL로 결제 유도, 피싱 사이트

### 예시 4 - 위험 (가짜 송장)
대화: 운송장 번호 전송 → "조회가 안 되는데요?" → "물류센터 오류래요 내일 되면 조회돼요"
판단: danger
이유: 조회 안 되는 가짜 운송장 + 택배사 오류 핑계

### 예시 5 - 위험 (포인트 결제 유도)
대화: "포인트가 많이 남아있어요 외부 쇼핑몰에 등록해주시면 결제할게요" → 라이브마켓 링크 전송
판단: danger
이유: 생소한 외부 플랫폼으로 유도, 이후 보증금/수수료 요구 전형적 패턴

### 예시 6 - 위험 (수수료 핑계 추가 입금)
대화: "수수료 포함해서 45만1000원 다시 결제하시면 45만원은 자동환불됩니다"
판단: danger
이유: 추가 입금 유도 후 자동환불 거짓말, 반복 입금 강요 패턴

### 예시 7 - 주의 (문고리 거래)
대화: 직거래 약속 → "장모님 모셔다드려야 해서 문앞에 걸어두고 나왔습니다"
판단: caution
이유: 핑계 대며 직접 대면 안 하고 물건만 문앞에 둠. 선입금 요구 없어서 위험은 아니지만 주의 필요

### 예시 8 - 주의 (급처 + 반값)
대화: "파혼해서 싸게 팔아요" + 시세 대비 반값 이하 가격
판단: caution
이유: 감정 호소로 경계심 무너뜨리기, 지나치게 저렴한 가격

### 예시 9 - 안전 (정상 직거래)
대화: "홍대입구역 근처예요" → "토요일 11시 어때요?" → "역 1번 출구 앞에서 만나요" → 작동 영상 전송
판단: safe
이유: 공개 장소 직거래 약속, 구매자 요청으로 영상 전송, 선입금 없음

### 예시 10 - 안전 (정상 택배)
대화: "택배비 포함 35000원이에요" → 계좌번호 전송 → 입금 → 운송장 번호 전송 → "후기 부탁드려요"
판단: safe
이유: 정상적인 택배 거래 순서, 선입금 요구 없음

### 예시 11 - 안전 (대형 가구 집 방문)
대화: "소파 팔아요" → 주소/연락처 공개 → "내일 오전 11시 오실 수 있어요?" → "현금으로 준비해주세요"
판단: safe
이유: 대형 가구는 판매자 집 방문 거래가 일반적, 선입금 요구 없음

### 예시 12 - 안전 (가격 협상)
대화: 구매자 "15만원 어때요?" → 판매자 "18만원 이하는 힘들어요" → "17만원에 가져가세요" → "설치비는 별도 5만원"
판단: safe
이유: 정상적인 네고, 대형 가전 설치비 별도는 업계 관행, 선입금 요구 없음

## 절대 사기로 판단하지 말 것
- "에이 그냥 가져가세요" = 가격 양보 표현, 물건 두고 간다는 뜻 아님
- 가격 협상 자체는 정상
- 매너온도/후기 언급 자체는 정상 (선입금과 함께할 때만 의심)
- 구매자가 먼저 요청한 사진/영상 전송은 정상
- 대형 가구/가전 판매자 집 주소 공개는 정상

## 판단 원칙
- 명확한 사기 시그널 없으면 safe
- 애매하면 danger보다 caution
- 보이는 것만 판단, 과해석 금지
- 부분 캡처일 수 있으므로 신중하게 판단
- 예시 7처럼 문고리·대면 회피만 있고 선입금 없으면 caution (safe 아님)
- 예시 2·6처럼 선입금·계좌이체 유도·추가 입금이 보이면 danger
- "안전해요", "사기 아닙니다" 단정 금지 — safe는 "뚜렷한 시그널이 없습니다" 수준

## 출력 형식 (JSON만, 다른 텍스트 없이)
{
  "risk_level": "safe" | "caution" | "danger",
  "patterns": ["패턴1", "패턴2"],
  "comment": "종합 코멘트",
  "action_items": ["행동요령1", "행동요령2"],
  "partial_capture": true | false,
  "context_note": "부분 캡처 안내"
}

- patterns: 캡처에서 확인된 **의심·사기 시그널만** 구체적 발언으로. 없으면 []
- action_items: 예시 판단에 맞는 **맞춤형** 2~4개 (고정 문구 복사 금지). danger 시 1332·112·182·신고, caution 시 공개장소·안전결제·실물확인 등 **해당만**
- partial_capture: true면 context_note에 "대화 일부만 확인됨, 전체 맥락 확인 권장" 등

## 출력 언어 (필수)
- comment, action_items, context_note는 **반드시 한국어**로 작성
- patterns는 대화 원문 인용 가능하나, 설명·꼬리말이 필요하면 한국어로 작성`;

const ANALYSIS_PROMPT_EN = `You are an expert in marketplace scam pattern analysis (Facebook Marketplace, Craigslist, eBay, Gumtree, OfferUp, etc.).
Review the chat screenshot(s) and assess scam likelihood using the examples below.
Base your judgment **only on what is visible** in the capture(s), matching the closest example flow.

## Examples

### Example 1 - danger (advance payment)
Chat: Seller says "I'm out of town, shipping only" → sends Zelle/Venmo/bank details → buyer pays → seller ghosts
Verdict: danger
Reason: Avoids in-person meetup, pushes prepayment, disappears after payment

### Example 2 - danger (fake platform payment error)
Chat: "Facebook Pay keeps failing, please wire me instead" → "I'll meet you after you send proof of payment"
Verdict: danger
Reason: Fake in-app payment error excuse to move off-platform before meetup

### Example 3 - danger (phishing link)
Chat: "Use the official Marketplace checkout here" → link to non-Meta/non-eBay domain
Verdict: danger
Reason: Off-platform payment/verification page, phishing

### Example 4 - danger (fake tracking)
Chat: Tracking number sent → "Carrier site shows nothing" → "Warehouse delay, try tomorrow"
Verdict: danger
Reason: Invalid tracking + delay excuses after payment

### Example 5 - danger (off-platform escrow)
Chat: "Register on this site so I can pay with my balance" → unknown marketplace link
Verdict: danger
Reason: Pushes unknown external platform, typical fee/refund follow-up scam

### Example 6 - danger (extra fee refund lie)
Chat: "Pay $451 including a fee and $450 auto-refunds"
Verdict: danger
Reason: Repeated extra payments promised auto-refund

### Example 7 - caution (porch / door drop)
Chat: Meetup planned → "Had to leave, left it on the porch, take it"
Verdict: caution
Reason: Avoids meeting without prepayment—still risky, not full danger

### Example 8 - caution (too cheap + sob story)
Chat: "Moving sale, divorce, must sell today" + far below market price
Verdict: caution
Reason: Emotional pressure + unrealistic price

### Example 9 - safe (normal local pickup)
Chat: Public place suggested → time agreed → "Meet at mall entrance" → buyer asked for video, seller sent
Verdict: safe
Reason: Public meetup, no prepayment pressure

### Example 10 - safe (normal shipped sale)
Chat: Shipping price agreed → payment after label or on-platform → tracking shared
Verdict: safe
Reason: Normal flow without upfront off-platform prepayment

### Example 11 - safe (large item home visit)
Chat: Couch sale → address shared → "Come tomorrow 11am" → "Cash on pickup"
Verdict: safe
Reason: Large items often picked up at seller home, no prepayment

### Example 12 - safe (price negotiation)
Chat: Buyer offers → seller counters → agree on price + optional delivery fee
Verdict: safe
Reason: Normal negotiation, no prepayment push

### Example 13 - danger (Zelle / Venmo / Cash App prepayment)
Chat: "Please send via Zelle/Venmo/Cash App first" → "I'll ship as soon as payment clears" → no in-person or on-platform protection
Verdict: danger
Reason: P2P apps have no buyer protection; classic prepayment before delivery scam

### Example 14 - danger (fake PayPal / eBay "paid" screenshot)
Chat: Seller sends screenshot "Payment received, ship now" → buyer checks PayPal/eBay, no actual payment → pressure to ship anyway
Verdict: danger
Reason: Forged payment confirmation image; real platforms never require shipping based on a chat screenshot alone

### Example 15 - caution (military / deployment excuse)
Chat: "I'm deployed overseas / in the military" → can't meet → pushes shipping + upfront payment or off-platform contact
Verdict: caution
Reason: Common sympathy excuse to avoid meetup; danger if combined with prepayment or off-platform payment

### Example 16 - caution (spouse / third party handles deal)
Chat: "My husband/wife will handle the transaction" → asks you to pay someone else or wait for their agent
Verdict: caution
Reason: Third-party handoff can hide identity; danger if they request prepayment to an unrelated account

### Example 17 - danger (move to email / SMS off-platform)
Chat: "Let's continue on email/text, Marketplace chat is broken" → shares personal email or phone → payment link sent outside the app
Verdict: danger
Reason: Leaving the platform removes protections and enables phishing or wire fraud

### Example 18 - danger (fake escrow service link)
Chat: "Use this secure escrow site to protect both of us" → unknown domain (not eBay/PayPal/Facebook official escrow)
Verdict: danger
Reason: Fake escrow sites steal payment; legitimate marketplaces use their own built-in checkout

### Example 19 - caution ("too good to be true" price)
Chat: iPhone/laptop/car listed far below market → "need cash today" / "inheritance" / "moving abroad tomorrow"
Verdict: caution
Reason: Extreme underpricing plus urgency is a common lure; danger if prepayment or off-platform payment appears

### Example 20 - danger (courier / shipping fee prepayment)
Chat: Item "free" or very cheap → "Pay $80 courier/delivery fee first" → "refunded when item arrives"
Verdict: danger
Reason: Victim pays fees for a item that never ships; fee is the actual scam

### Example 21 - danger (fake UPS / FedEx tracking link)
Chat: "Here's your tracking" → link to ups-delivery-verify.com or similar (not ups.com/fedex.com) → asks login or payment
Verdict: danger
Reason: Phishing link disguised as carrier tracking; real tracking uses official carrier domains only

### Example 22 - caution (suspicious / AI-like seller profile signals)
Chat: Generic replies, perfect grammar then sudden urgency, stock-photo profile, new account, copy-paste templates, refuses video call or live photo with item
Verdict: caution
Reason: Profile and chat style may indicate bot or scam account; not proof alone—combine with payment/meetup red flags

## Do NOT label as scam
- Normal price haggling
- Seller sharing address for large pickup items
- Buyer-requested photos/videos
- Mentioning ratings/reviews alone (only suspicious with prepayment)

## Rules
- No clear scam signals → safe
- Ambiguous → caution over danger
- Only judge visible content; partial screenshots possible
- Porch drop / meetup avoidance without prepayment → caution (not safe)
- Prepayment via Zelle/Venmo/Cash App/wire, fake PayPal screenshots, courier-fee prepay, fake escrow/tracking links → danger
- Military/deployment excuse, spouse-handled deal, too-good-to-be-true price, AI-like profile → caution (upgrade to danger if prepayment or off-platform payment appears)
- Moving chat to email/SMS + payment outside the app → danger
- Never claim "100% safe" or "definitely a scam"—safe means no strong signals visible

## Output (JSON only, no other text)
{
  "risk_level": "safe" | "caution" | "danger",
  "patterns": ["pattern1", "pattern2"],
  "comment": "summary comment in English",
  "action_items": ["action1", "action2"],
  "partial_capture": true | false,
  "context_note": "partial capture note in English"
}

- patterns: only **suspicious signals** quoted from the chat; [] if none
- action_items: 2–4 tailored steps (no generic copy-paste). danger: stop payment, report platform, FTC/police; caution: public meetup, on-platform payment, verify item. Never cite 112, 1332, or any Korean-only services or phone numbers in English responses
- partial_capture: true → context_note should mention limited context visible

## Output language (REQUIRED)
- Write **every** JSON string field (patterns descriptions, comment, action_items, context_note) in **English only**
- Even if the chat screenshot is in Korean or another language, the analysis and advice must be in English
- You may quote the original chat in patterns, but add a brief English explanation when the quote is not in English`;

type Lang = "ko" | "en";

const LANG_SUFFIX: Record<Lang, string> = {
  ko: `

[시스템] 응답 JSON의 comment, action_items, context_note는 한국어로만 작성하세요.`,
  en: `

[SYSTEM] Respond with JSON only. Every value in patterns (as needed), comment, action_items, and context_note must be in English—even if the chat image is Korean.`,
};

const RISK_LEVEL_LABELS: Record<Lang, Record<"safe" | "caution" | "danger", string>> = {
  ko: { safe: "안전", caution: "주의", danger: "위험" },
  en: { safe: "Safe", caution: "Caution", danger: "High risk" },
};

const MSGS: Record<Lang, Record<string, string>> = {
  ko: {
    parseFail: "AI 응답을 파싱할 수 없습니다.",
    invalidRisk: "유효하지 않은 위험도 값입니다.",
    defaultContext: "대화 일부만 확인됨, 전체 맥락 확인 권장",
    defaultComment: "분석 코멘트를 생성하지 못했습니다.",
    maxImages: `이미지는 최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.`,
    badImage: "번째 이미지 정보가 올바르지 않습니다.",
    badType: "번째 이미지: 지원하지 않는 형식입니다.",
    badSize: "번째 이미지: 크기는 5MB 이하여야 합니다.",
    methodNotAllowed: "Method not allowed",
    serverConfig: "서버 설정이 완료되지 않았습니다. ANTHROPIC_API_KEY를 설정해 주세요.",
    badRequest: "잘못된 요청 형식입니다.",
    imagesRequired: "images 배열 또는 image_base64/media_type이 필요합니다.",
    analyzeError: "분석 중 오류가 발생했습니다.",
    claudeError: "Claude API 오류",
  },
  en: {
    parseFail: "Could not parse the AI response.",
    invalidRisk: "Invalid risk level in AI response.",
    defaultContext: "Only part of the chat is visible—review the full conversation if possible.",
    defaultComment: "Could not generate a summary comment.",
    maxImages: `You can upload up to ${MAX_IMAGES} images.`,
    badImage: " image: invalid image data.",
    badType: " image: unsupported file type.",
    badSize: " image: must be 5MB or smaller.",
    methodNotAllowed: "Method not allowed",
    serverConfig: "Server is not configured. Set ANTHROPIC_API_KEY.",
    badRequest: "Invalid request body.",
    imagesRequired: "images array or image_base64/media_type is required.",
    analyzeError: "Something went wrong during analysis.",
    claudeError: "Claude API error",
  },
};

function resolveLang(...candidates: unknown[]): Lang {
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const v = raw.toLowerCase().trim();
    if (v === "en" || v === "english" || v === "en-us" || v === "en-gb") {
      return "en";
    }
    if (v === "ko" || v === "korean" || v === "kr" || v === "ko-kr") {
      return "ko";
    }
  }
  return "ko";
}

function getPrompt(lang: Lang): string {
  const base = lang === "en" ? ANALYSIS_PROMPT_EN : ANALYSIS_PROMPT;
  return base + LANG_SUFFIX[lang];
}

async function logAnalysis(
  imageCount: number,
  riskLevel: "safe" | "caution" | "danger",
  lang: Lang,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "analysis_logs: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.",
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.from("analysis_logs").insert({
    image_count: imageCount,
    risk_level: RISK_LEVEL_LABELS[lang][riskLevel],
  });

  if (error) {
    console.error("analysis_logs insert failed:", error.message);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lang",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseAnalysis(text: string, lang: Lang) {
  const m = MSGS[lang];
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(m.parseFail);
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!["safe", "caution", "danger"].includes(parsed.risk_level)) {
    throw new Error(m.invalidRisk);
  }
  const partialCapture = Boolean(parsed.partial_capture);
  let contextNote =
    typeof parsed.context_note === "string" ? parsed.context_note.trim() : "";
  if (partialCapture && !contextNote) {
    contextNote = m.defaultContext;
  }

  let actionItems: string[] = [];
  if (Array.isArray(parsed.action_items)) {
    actionItems = parsed.action_items
      .filter((item: unknown) => typeof item === "string" && item.trim())
      .map((item: string) => item.trim())
      .slice(0, 4);
  }

  return {
    risk_level: parsed.risk_level,
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    comment: parsed.comment || m.defaultComment,
    action_items: actionItems,
    partial_capture: partialCapture,
    context_note: contextNote,
  };
}

type ImageInput = { image_base64: string; media_type: string };

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function normalizeImages(body: {
  image_base64?: string;
  media_type?: string;
  images?: ImageInput[];
}): ImageInput[] | null {
  if (Array.isArray(body.images) && body.images.length > 0) {
    return body.images;
  }
  if (body.image_base64 && body.media_type) {
    return [{ image_base64: body.image_base64, media_type: body.media_type }];
  }
  return null;
}

function validateImages(images: ImageInput[], lang: Lang): string | null {
  const m = MSGS[lang];
  if (images.length > MAX_IMAGES) {
    return m.maxImages;
  }
  for (let i = 0; i < images.length; i++) {
    const { image_base64, media_type } = images[i];
    const n = lang === "ko" ? `${i + 1}번째` : `#${i + 1}`;
    if (!image_base64 || !media_type) {
      return lang === "ko" ? `${n} 이미지 정보가 올바르지 않습니다.` : `Image ${n}${m.badImage}`;
    }
    if (!ALLOWED_TYPES.includes(media_type)) {
      return lang === "ko" ? `${n} 이미지: 지원하지 않는 형식입니다.` : `Image ${n}${m.badType}`;
    }
    const estimatedBytes = Math.ceil((image_base64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return lang === "ko" ? `${n} 이미지: 크기는 5MB 이하여야 합니다.` : `Image ${n}${m.badSize}`;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: MSGS.en.methodNotAllowed }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: MSGS.ko.serverConfig }, 500);
  }

  let body: {
    lang?: string;
    language?: string;
    image_base64?: string;
    media_type?: string;
    images?: ImageInput[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: MSGS.ko.badRequest }, 400);
  }

  const lang = resolveLang(body.lang, body.language, req.headers.get("x-lang"));

  const images = normalizeImages(body);
  if (!images || images.length === 0) {
    return jsonResponse({ error: MSGS[lang].imagesRequired }, 400);
  }

  const validationError = validateImages(images, lang);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const imageBlocks = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.media_type,
      data: img.image_base64,
    },
  }));

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1536,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              { type: "text", text: getPrompt(lang) },
            ],
          },
        ],
      }),
    });

    const anthropicBody = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const msg =
        anthropicBody.error?.message ||
        `${MSGS[lang].claudeError} (${anthropicRes.status})`;
      return jsonResponse({ error: msg }, anthropicRes.status >= 500 ? 502 : 400);
    }

    const text =
      anthropicBody.content
        ?.filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("") || "";

    const analysis = parseAnalysis(text, lang);
    await logAnalysis(images.length, analysis.risk_level, lang);
    return jsonResponse(analysis);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : MSGS[lang].analyzeError;
    return jsonResponse({ error: message }, 500);
  }
});
