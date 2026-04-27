// Vercel Serverless Function — 인터뷰 텍스트를 가계도/생태도 JSON 스키마로 추출
// Endpoint: POST /api/parse  body: { text: string }
// Response: { client_id, people, marriages, parentships, household, ecomap_systems, missing }

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_INPUT_CHARS = 12000;

const SYSTEM_PROMPT = `당신은 한국 사회복지 실천현장의 사정(assessment) 도구인 가계도(Genogram)와 생태도(Ecomap)를
인터뷰 전사본에서 추출하는 전문가 어시스턴트입니다.

[출력 규칙]
- 반드시 단일 JSON 객체만 출력하세요. 설명·코드펜스·마크다운 금지.
- 모르는 값은 null 또는 빈 배열로 두고, missing_fields 또는 missing 항목에 명시하세요.
- 모든 인물에 안정적 id를 부여하세요(영문 소문자/언더스코어, 예: self, father, mother, son, brother, wife,
  uncle_p1, aunt_m, pgf=친조부, pgm=친조모, mgf=외조부, mgm=외조모).
- client_id는 인터뷰의 의뢰인/본인을 가리킵니다. is_client: true도 함께 표시.

[스키마]
{
  "client_id": "self",
  "people": [
    { "id": "self", "name": "본인", "age": 46, "sex": "M"|"F"|"U",
      "alive": true|false, "occupation": "...", "notes": "...",
      "is_client": true, "missing_fields": ["health"] }
  ],
  "marriages": [ { "a": "self", "b": "wife",
    "status": "married"|"divorced"|"separated"|"partner" } ],
  "parentships": [ { "parents": ["father","mother"], "children": ["self","brother"] } ],
  "household": ["self","wife","son"],
  "ecomap_systems": [
    { "id": "wife_job", "label": "직장(공공기관)",
      "category": "직업"|"교육"|"종교"|"의료"|"이웃"|"친구"|"여가"|"학습"|"기타",
      "linked_to": ["wife"],
      "tone": "positive"|"tense"|"uncertain",
      "strength": 1|2|3,
      "direction": "out"|"in"|"bi" }
  ],
  "missing": [
    { "level": "person"|"system", "id": "father",
      "fields": ["health"], "hint": "..." }
  ]
}

[해석 가이드]
- "긴장/갈등/스트레스" 등 → tone: tense
- "느슨한/약한/불확실/미약/연락 적은" → tone: uncertain
- "친밀/지지/도움이 됨/긍정적" → tone: positive
- "강한/매우/큰/주된" → strength 3, "보통" → 2, "약한/느슨한" → 1
- 도움 방향이 명시되지 않으면 direction: "bi"
- 누락은 가능한 한 풍부하게 포함: 표준 카테고리(직업/교육/종교/의료/이웃/친구/여가/학습) 중 인터뷰에 등장하지
  않은 카테고리, 인구학 정보 미상(나이/성별/생존), 가족 구성원의 직업·건강 정보 미상 등.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }
  const text = (body.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  if (text.length > MAX_INPUT_CHARS) {
    return res.status(413).json({ error: 'text_too_long', limit: MAX_INPUT_CHARS });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'missing_api_key',
      hint: 'Vercel 환경변수에 ANTHROPIC_API_KEY를 설정하세요.',
    });
  }

  const client = new Anthropic({ apiKey });

  // 1차 시도 + JSON 검증 실패 시 1회 재시도
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `다음 인터뷰 전사본에서 가계도/생태도 JSON을 추출하세요.\n` +
              (attempt > 0 ? '\n[중요] 직전 응답이 유효한 JSON이 아니었습니다. 반드시 단일 JSON 객체만 출력하세요.\n' : '') +
              `\n=== 인터뷰 ===\n${text}\n=== 끝 ===`,
          },
        ],
      });

      const out = message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();

      const parsed = extractJson(out);
      if (!parsed) throw new Error('JSON 추출 실패');
      const validated = validateAndNormalize(parsed);
      return res.status(200).json(validated);
    } catch (err) {
      lastError = err;
    }
  }

  console.error('[api/parse] failed:', lastError?.message);
  return res.status(502).json({
    error: 'llm_extraction_failed',
    detail: String(lastError?.message || lastError),
  });
}

// ── JSON 추출: 코드펜스 등 제거 후 가장 큰 {} 블록을 파싱 ──
function extractJson(s) {
  if (!s) return null;
  // 코드펜스 제거
  s = s.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // 첫 { 부터 마지막 } 까지 시도
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = s.slice(start, end + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

// ── 출력 정규화 (필수 필드 채우기, 잘못된 enum 보정) ──
function validateAndNormalize(obj) {
  const out = {
    client_id: obj.client_id || 'self',
    people: Array.isArray(obj.people) ? obj.people.map(normalizePerson) : [],
    marriages: Array.isArray(obj.marriages) ? obj.marriages.filter((m) => m && m.a && m.b) : [],
    parentships: Array.isArray(obj.parentships)
      ? obj.parentships
          .filter((p) => Array.isArray(p?.parents) && Array.isArray(p?.children))
          .map((p) => ({ parents: p.parents.filter(Boolean), children: p.children.filter(Boolean) }))
      : [],
    household: Array.isArray(obj.household) ? obj.household.filter(Boolean) : [],
    ecomap_systems: Array.isArray(obj.ecomap_systems)
      ? obj.ecomap_systems.map(normalizeSystem)
      : [],
    missing: Array.isArray(obj.missing) ? obj.missing : [],
  };

  // client_id 인물 보장
  if (!out.people.find((p) => p.id === out.client_id) && out.people.length) {
    const c = out.people.find((p) => p.is_client) || out.people[0];
    out.client_id = c.id;
    c.is_client = true;
  }
  return out;
}

function normalizePerson(p) {
  const sex = ['M', 'F', 'U'].includes(p.sex) ? p.sex : (p.sex === '남' ? 'M' : p.sex === '여' ? 'F' : 'U');
  return {
    id: p.id,
    name: p.name || p.id,
    age: typeof p.age === 'number' ? p.age : null,
    sex,
    alive: p.alive === false ? false : true,
    occupation: p.occupation || '',
    notes: p.notes || '',
    is_client: !!p.is_client,
    missing_fields: Array.isArray(p.missing_fields) ? p.missing_fields : [],
  };
}

function normalizeSystem(s) {
  const tone = ['positive', 'tense', 'uncertain'].includes(s.tone) ? s.tone : 'uncertain';
  const direction = ['out', 'in', 'bi'].includes(s.direction) ? s.direction : 'bi';
  let strength = parseInt(s.strength, 10);
  if (![1, 2, 3].includes(strength)) strength = 2;
  return {
    id: s.id || `sys_${Math.random().toString(36).slice(2, 8)}`,
    label: s.label || s.category || '체계',
    category: s.category || '기타',
    linked_to: Array.isArray(s.linked_to) ? s.linked_to.filter(Boolean) : [],
    tone, strength, direction,
  };
}
