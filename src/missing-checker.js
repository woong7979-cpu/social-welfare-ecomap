// 사회복지 사정의 누락 항목을 결정론적으로 탐지한다.
// LLM 출력에 의존하지 않고도 표준 체크리스트(가계도/생태도)를 비교하여 보강 인터뷰 가이드를 생성.

import { STANDARD_CATEGORIES } from './render-ecomap.js';

// 가계도 인구학 필수 필드
const PERSON_REQUIRED = [
  { field: 'age', label: '나이' },
  { field: 'sex', label: '성별' },
  { field: 'alive', label: '생존여부' },
];
// 가계도 권장 필드 (있으면 좋음)
const PERSON_RECOMMENDED = [
  { field: 'occupation', label: '직업' },
  { field: 'health', label: '건강상태/질환' },
];

export function checkMissing(data) {
  const items = [];

  // 1) 인물별 누락 필드
  for (const p of (data.people || [])) {
    const missingReq = PERSON_REQUIRED.filter(f => isEmpty(p[f.field])).map(f => f.label);
    const missingRec = PERSON_RECOMMENDED.filter(f => isEmpty(p[f.field])).map(f => f.label);
    const personMissing = (p.missing_fields || []).map(f => translateField(f));
    const all = [...new Set([...missingReq, ...missingRec, ...personMissing])];
    if (all.length) {
      items.push({
        kind: 'person',
        target: p.name || p.id,
        targetId: p.id,
        severity: missingReq.length ? 'high' : 'medium',
        message: `${p.name || p.id}: ${all.join(', ')} 미수집`,
      });
    }
  }

  // 2) 생태도 표준 카테고리 누락
  const presentCats = new Set((data.ecomap_systems || []).map(s => s.category).filter(Boolean));
  for (const cat of STANDARD_CATEGORIES) {
    if (!presentCats.has(cat)) {
      items.push({
        kind: 'system',
        target: cat,
        severity: 'medium',
        message: `[${cat}] 체계 미수집 — ${categoryHint(cat)}`,
      });
    }
  }

  // 3) 가구(household) 미정의
  if (!data.household || data.household.length === 0) {
    items.push({
      kind: 'structure',
      target: '가구',
      severity: 'high',
      message: '동거 가구원(household) 정보가 없습니다 — 누구와 함께 사는지 확인 필요',
    });
  }

  // 4) 클라이언트 미지정
  if (!data.client_id) {
    items.push({
      kind: 'structure',
      target: '본인',
      severity: 'high',
      message: '클라이언트(본인) 식별이 없습니다',
    });
  }

  // 5) LLM이 직접 보고한 missing 항목 합치기
  for (const m of (data.missing || [])) {
    items.push({
      kind: m.level === 'system' ? 'system' : 'person',
      target: m.id || m.category || '?',
      severity: m.severity || 'medium',
      message: m.hint || '',
    });
  }

  // 중복 제거 (메시지 기준)
  const seen = new Set();
  return items.filter(it => {
    if (seen.has(it.message)) return false;
    seen.add(it.message);
    return true;
  });
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function translateField(f) {
  const map = {
    age: '나이', sex: '성별', alive: '생존여부',
    occupation: '직업', health: '건강', education: '학력',
    contact: '연락 가능 여부', notes: '특이사항',
  };
  return map[f] || f;
}

function categoryHint(cat) {
  const hints = {
    '직업': '본인/배우자 직장, 근로형태, 소득원 확인',
    '교육': '재학/학업 상태, 학교, 학습 환경',
    '종교': '종교활동, 신앙 공동체 소속',
    '의료': '주치의/병원, 만성질환, 정기 진료 여부',
    '이웃': '거주 지역 이웃·동네 모임 등 비공식 지원',
    '친구': '가까운 친구·또래 지지망',
    '여가': '취미·여가활동 (운동, 동호회 등)',
    '학습': '평생학습·자기계발 활동',
  };
  return hints[cat] || '';
}
