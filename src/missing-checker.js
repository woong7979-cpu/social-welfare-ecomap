// 사회복지 사정의 핵심 누락 항목만 결정론적으로 탐지한다.
// 부수적 인물(조카·외조부모·삼촌 등)의 미상 정보는 제외하고,
// 클라이언트 본인·배우자·자녀·부모와 핵심 외부체계(종교·의료·친구·이웃·여가)만 점검.

const ESSENTIAL_SYSTEMS = [
  { cat: '의료', hint: '주치의/병원·만성질환·정기 진료 체계 확인' },
  { cat: '종교', hint: '종교 활동·신앙 공동체 소속 확인' },
  { cat: '친구', hint: '가까운 친구·또래 지지망 확인' },
  { cat: '이웃', hint: '거주 지역 이웃·비공식 지원 확인' },
  { cat: '여가', hint: '취미·운동·자기관리 활동 확인' },
];

export function checkMissing(data) {
  const items = [];
  const peopleById = new Map((data.people || []).map(p => [p.id, p]));
  const client = peopleById.get(data.client_id);
  if (!client) {
    items.push({ severity: 'high', message: '의뢰인(본인) 식별 정보 미수집' });
    return dedupe(items);
  }

  // 1) 본인 핵심 사정
  if (isEmpty(client.occupation)) {
    items.push({ severity: 'high', message: '본인의 직업·근로형태·소득 안정성 미수집' });
  }
  if (isEmpty(client.health) && isEmpty(client.notes)) {
    items.push({ severity: 'high', message: '본인의 건강 상태·정신건강·스트레스 수준 미수집' });
  }

  // 2) 배우자 관계 (있을 때만 검사)
  const marriages = data.marriages || [];
  const spouseEdge = marriages.find(m => m.a === client.id || m.b === client.id);
  if (spouseEdge) {
    const spouseId = spouseEdge.a === client.id ? spouseEdge.b : spouseEdge.a;
    const spouse = peopleById.get(spouseId);
    if (spouse) {
      if (isEmpty(spouse.occupation)) {
        items.push({ severity: 'high', message: `배우자(${spouse.name || spouseId})의 직업·소득 미수집` });
      }
      // 부부 관계의 질(갈등·지지)은 인터뷰에서 명시적으로 묻고 ecomap 톤에 반영해야 함
      const coupleTone = (data.ecomap_systems || []).some(s =>
        s.category === '부부' || (Array.isArray(s.linked_to) && s.linked_to.includes(client.id) && s.linked_to.includes(spouseId)));
      if (!coupleTone) {
        items.push({ severity: 'high', message: '부부 관계의 질(지지·갈등·의사소통 패턴) 미수집' });
      }
    }
  } else {
    items.push({ severity: 'high', message: '본인의 결혼 상태(미혼·기혼·이혼·사별) 미수집' });
  }

  // 3) 자녀 특성 (자녀가 있을 때만 검사)
  const parentships = data.parentships || [];
  const childrenIds = parentships
    .filter(p => Array.isArray(p.parents) && p.parents.includes(client.id))
    .flatMap(p => p.children);
  const children = [...new Set(childrenIds)].map(id => peopleById.get(id)).filter(Boolean);
  for (const ch of children) {
    const missing = [];
    if (isEmpty(ch.occupation) && isEmpty(ch.notes)) missing.push('학교/소속');
    if (isEmpty(ch.health) && isEmpty(ch.notes)) missing.push('건강·발달·정서');
    if (missing.length) {
      const label = ch.name || (ch.age != null ? `${ch.age}세 자녀` : '자녀');
      items.push({ severity: 'high', message: `자녀(${label}): ${missing.join(', ')} 미수집` });
    }
  }

  // 4) 부모 생사·건강 (생존한 경우 건강 상태가 사정에 핵심)
  const parentEdge = parentships.find(p => Array.isArray(p.children) && p.children.includes(client.id));
  if (parentEdge) {
    for (const pid of parentEdge.parents) {
      const par = peopleById.get(pid);
      if (par && par.alive !== false && isEmpty(par.health) && isEmpty(par.notes)) {
        const label = par.name || pid;
        items.push({ severity: 'high', message: `부모(${label}): 건강·돌봄 필요 여부 미수집` });
      }
    }
  }

  // 5) 외부 체계 핵심 카테고리 누락
  const presentCats = new Set((data.ecomap_systems || []).map(s => s.category).filter(Boolean));
  for (const e of ESSENTIAL_SYSTEMS) {
    if (!presentCats.has(e.cat)) {
      items.push({ severity: 'high', message: `[${e.cat}] 체계 미수집 — ${e.hint}` });
    }
  }

  // 6) LLM이 high로 보고한 missing 항목만 합치기
  for (const m of (data.missing || [])) {
    if ((m.severity === 'high' || !m.severity) && m.hint) {
      items.push({ severity: 'high', message: m.hint });
    }
  }

  return dedupe(items);
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    if (!it.message) return false;
    if (seen.has(it.message)) return false;
    seen.add(it.message);
    return true;
  });
}
