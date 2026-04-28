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
    "status": "married"|"cohabit"|"separated"|"divorced"|"partner" } ],
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
- marriage status 매핑:
  · 결혼/혼인/부부 → "married"
  · 동거/사실혼/연인 → "cohabit"
  · 별거 → "separated"
  · 이혼/전남편/전처 → "divorced"
- ★ 중요: 같은 자녀의 부모 쌍은 인터뷰에 "결혼"이라는 단어가 없어도 반드시 marriages 배열에
  married 상태로 추가하세요 (예: "외조부는 일찍 작고, 외조모는 78세"라면 외조부+외조모를
  married로 표기). 이 결혼 관계가 빠지면 가계도 결혼선이 그려지지 않습니다.
- ★★ 가장 중요: 인터뷰에 등장한 모든 가족 구성원은 반드시 parentships로 가족 트리에 연결하세요.
  외톨이 인물(parentships에 등장하지 않는 사람)이 있으면 가계도가 깨집니다.
  한국어 호칭 → parentship 매핑 예시:
  · "본인의 어머니/아버지" → parentships: [{parents:["father","mother"], children:["self"]}]
  · "시어머니/시아버지" (배우자의 부모) → parentships: [{parents:["father_in_law","mother_in_law"], children:["husband"]}]
  · "장인/장모" (배우자의 부모) → 위와 동일 (배우자 ID로 children)
  · "친조부/친조모" → 본인 아버지의 부모 → parentships: [{parents:["pgf","pgm"], children:["father"]}]
  · "외조부/외조모" → 본인 어머니의 부모 → parentships: [{parents:["mgf","mgm"], children:["mother"]}]
  · "형/누나/언니/오빠/동생" → 본인과 같은 부모를 공유 → 본인의 parentship에 children으로 추가
  · "처남/처제/시동생/시누이" → 배우자의 부모를 공유
  · "아들/딸/큰아이/작은아이/자녀" → parentships: [{parents:["self","spouse"], children:[...]}]
  · "조카" → 본인의 형제자매와 그 배우자의 자녀 → 그 형제 부부의 parentship에 children
  외국 출신 가족(예: "베트남 어머니")도 동일하게 parentship으로 연결하세요.
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

  // 한국어 호칭 기반 결정론적 parentship 추론 (LLM 누락 보정)
  inferMissingRelationships(out);

  return out;
}

// LLM이 인물은 추출했지만 parentships로 가족 트리에 연결하지 않은 경우,
// 이름의 한국어 호칭(어머니/아버지/시어머니/남동생 등)으로 관계를 자동 추론.
function inferMissingRelationships(data) {
  const peopleById = new Map(data.people.map(p => [p.id, p]));
  const client = peopleById.get(data.client_id);
  if (!client) return;

  // 클라이언트 배우자 찾기
  const clientMarriage = data.marriages.find(m => m.a === client.id || m.b === client.id);
  const spouseId = clientMarriage ? (clientMarriage.a === client.id ? clientMarriage.b : clientMarriage.a) : null;

  // 이미 어떤 parentship에 등장하는 사람 식별
  const inParentship = (id) => data.parentships.some(ps =>
    ps.parents.includes(id) || ps.children.includes(id));

  // 클라이언트 부모 parentship 가져오기/생성
  const ensureClientParentship = () => {
    let ps = data.parentships.find(p => p.children.includes(client.id));
    if (!ps) {
      ps = { parents: [], children: [client.id] };
      data.parentships.push(ps);
    }
    return ps;
  };
  // 배우자 부모 parentship 가져오기/생성
  const ensureSpouseParentship = () => {
    if (!spouseId) return null;
    let ps = data.parentships.find(p => p.children.includes(spouseId));
    if (!ps) {
      ps = { parents: [], children: [spouseId] };
      data.parentships.push(ps);
    }
    return ps;
  };

  // 클라이언트 부모 ID(아버지/어머니) 식별 — 조부모 추가 시 필요
  const getClientFather = () => {
    const ps = data.parentships.find(p => p.children.includes(client.id));
    if (!ps) return null;
    return ps.parents.find(pid => peopleById.get(pid)?.sex === 'M') || null;
  };
  const getClientMother = () => {
    const ps = data.parentships.find(p => p.children.includes(client.id));
    if (!ps) return null;
    return ps.parents.find(pid => peopleById.get(pid)?.sex === 'F') || null;
  };

  // 호칭 → 추론 규칙
  const RULES = [
    // 시어머니/시아버지 (배우자의 부모) — 시 prefix 우선 매칭
    { match: (n) => /시어머니|시모|장모/.test(n), target: 'spouse_parent' },
    { match: (n) => /시아버지|시부|장인/.test(n), target: 'spouse_parent' },
    { match: (n) => /시동생|시누이|시형|시누|처남|처제|처형|처남댁|올케/.test(n), target: 'spouse_sibling' },

    // 친조부모 (아버지의 부모)
    { match: (n) => /친조부|친조모|할아버지|할머니/.test(n) && !/외/.test(n), target: 'paternal_grandparent' },
    // 외조부모 (어머니의 부모)
    { match: (n) => /외조부|외조모|외할아버지|외할머니/.test(n), target: 'maternal_grandparent' },

    // 본인의 부모 (시/외/장 단어 없을 때)
    { match: (n) => /어머니|엄마|모친/.test(n) && !/시|장|외|친조/.test(n), target: 'client_parent' },
    { match: (n) => /아버지|아빠|부친/.test(n) && !/시|장|외|친조/.test(n), target: 'client_parent' },

    // 본인의 형제자매
    { match: (n) => /^(형|오빠|언니|누나|남동생|여동생|동생|쌍둥이)$|본인.{0,3}(형|오빠|언니|누나|동생)/.test(n) && !/시|처|조카/.test(n),
      target: 'client_sibling' },

    // 본인의 자녀
    { match: (n) => /(아들|딸|자녀|큰아이|작은아이|첫째|둘째|셋째|장남|장녀|차남|차녀|막내)/.test(n) && !/시|조카/.test(n),
      target: 'client_child' },

    // 조카 (본인 형제의 자녀)
    { match: (n) => /조카/.test(n), target: 'nibling' },
  ];

  // 고정점 반복: 한 패스에서 부모가 생성되어야 같은 패스 후반에 형제·조부모를 연결할 수 있음.
  // 변화가 없을 때까지 반복.
  let changed = true;
  let iter = 0;
  while (changed && iter < 8) {
    iter++;
    changed = false;
    for (const p of data.people) {
      if (p.id === client.id || p.id === spouseId) continue;
      if (inParentship(p.id)) continue;

      const name = p.name || '';
      const rule = RULES.find(r => r.match(name));
      if (!rule) continue;

      const before = data.parentships.length + data.parentships.reduce((acc, ps) =>
        acc + ps.parents.length + ps.children.length, 0);

      applyRule(p, rule.target);

      const after = data.parentships.length + data.parentships.reduce((acc, ps) =>
        acc + ps.parents.length + ps.children.length, 0);
      if (after !== before) changed = true;
    }
  }

  function applyRule(p, target) {
    switch (target) {
      case 'client_parent': {
        const ps = ensureClientParentship();
        if (!ps.parents.includes(p.id)) ps.parents.push(p.id);
        break;
      }
      case 'spouse_parent': {
        const ps = ensureSpouseParentship();
        if (ps && !ps.parents.includes(p.id)) ps.parents.push(p.id);
        break;
      }
      case 'paternal_grandparent': {
        const father = getClientFather();
        if (!father) break;
        let ps = data.parentships.find(p => p.children.includes(father));
        if (!ps) {
          ps = { parents: [], children: [father] };
          data.parentships.push(ps);
        }
        if (!ps.parents.includes(p.id)) ps.parents.push(p.id);
        break;
      }
      case 'maternal_grandparent': {
        const mother = getClientMother();
        if (!mother) break;
        let ps = data.parentships.find(p => p.children.includes(mother));
        if (!ps) {
          ps = { parents: [], children: [mother] };
          data.parentships.push(ps);
        }
        if (!ps.parents.includes(p.id)) ps.parents.push(p.id);
        break;
      }
      case 'client_sibling': {
        const ps = data.parentships.find(p => p.children.includes(client.id));
        if (!ps) break;
        if (!ps.children.includes(p.id)) ps.children.push(p.id);
        break;
      }
      case 'spouse_sibling': {
        if (!spouseId) break;
        const ps = data.parentships.find(p => p.children.includes(spouseId));
        if (!ps) break;
        if (!ps.children.includes(p.id)) ps.children.push(p.id);
        break;
      }
      case 'client_child': {
        // 본인+배우자가 부모인 parentship 찾기/생성
        let ps = data.parentships.find(p => p.parents.includes(client.id) &&
          (spouseId ? p.parents.includes(spouseId) : true));
        if (!ps) {
          ps = { parents: spouseId ? [client.id, spouseId] : [client.id], children: [] };
          data.parentships.push(ps);
        }
        if (!ps.children.includes(p.id)) ps.children.push(p.id);
        break;
      }
      case 'nibling': {
        // 본인 형제 + 그 배우자의 자녀 — 적절한 형제를 찾기 어려우면 스킵
        const siblingPs = data.parentships.find(p => p.children.includes(client.id));
        if (!siblingPs) break;
        const siblingIds = siblingPs.children.filter(id => id !== client.id);
        if (siblingIds.length === 0) break;
        // 첫 번째 형제 + (그 형제의 배우자)의 parentship에 자녀로 추가
        const siblingId = siblingIds[0];
        const siblingMarriage = data.marriages.find(m => m.a === siblingId || m.b === siblingId);
        const siblingSpouse = siblingMarriage
          ? (siblingMarriage.a === siblingId ? siblingMarriage.b : siblingMarriage.a) : null;
        let ps = data.parentships.find(p => p.parents.includes(siblingId) &&
          (siblingSpouse ? p.parents.includes(siblingSpouse) : true));
        if (!ps) {
          ps = { parents: siblingSpouse ? [siblingId, siblingSpouse] : [siblingId], children: [] };
          data.parentships.push(ps);
        }
        if (!ps.children.includes(p.id)) ps.children.push(p.id);
        break;
      }
    }
  }
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
