// 시연용 가상 시드 데이터 — 공개 데모용 익명 사례.
// 의뢰인 A: 42세 여성 한부모 가정의 사례 (실제 인물·기관과 무관, 학습 시연 목적).
// 백엔드 API 키가 없거나 오프라인 상태에서도 "샘플 보기"로 즉시 시각화가 가능하도록 한다.

export const SAMPLE_CASE = {
  client_id: 'self',
  people: [
    // === 조부모 세대 (gen 0) ===
    { id: 'pgf', name: '친조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'pgm', name: '친조모', sex: 'F', alive: false, age: null, gen: 0 },
    { id: 'mgf', name: '외조부', sex: 'M', alive: false, age: null, gen: 0, missing_fields: ['age'] },
    { id: 'mgm', name: '외조모', sex: 'F', alive: true, age: 78, gen: 0, notes: '농촌 거주' },

    // === 부모 세대 (gen 1) ===
    { id: 'father', name: '아버지(작고)', sex: 'M', alive: false, age: 75, gen: 1, notes: '5년 전 작고' },
    { id: 'mother', name: '어머니', sex: 'F', alive: true, age: 68, gen: 1, occupation: '전업주부' },

    // === 의뢰인 세대 (gen 2) ===
    { id: 'sister', name: '언니', sex: 'F', alive: true, age: 45, gen: 2, occupation: '교사', notes: '같은 동네 거주' },
    { id: 'brother_in_law', name: '형부', sex: 'M', alive: true, age: 47, gen: 2, occupation: '회사원' },
    { id: 'self', name: '의뢰인 A', sex: 'F', alive: true, age: 42, gen: 2,
      occupation: '사무직', is_client: true, notes: '한부모(이혼)' },
    { id: 'ex_husband', name: '전남편', sex: 'M', alive: true, age: 45, gen: 2,
      occupation: '직장인', notes: '별도 거주, 양육비 송금' },

    // === 자녀 세대 (gen 3) ===
    { id: 'niece', name: '조카', sex: 'F', alive: true, age: 15, gen: 3, occupation: '중학생' },
    { id: 'daughter', name: '딸', sex: 'F', alive: true, age: 12, gen: 3, occupation: '초등 6학년' },
    { id: 'son', name: '아들', sex: 'M', alive: true, age: 9, gen: 3, occupation: '초등 3학년' },
  ],

  marriages: [
    { a: 'pgf', b: 'pgm', status: 'married' },
    { a: 'mgf', b: 'mgm', status: 'married' },
    { a: 'father', b: 'mother', status: 'married' },
    { a: 'brother_in_law', b: 'sister', status: 'married' },
    { a: 'ex_husband', b: 'self', status: 'divorced' },
  ],

  parentships: [
    { parents: ['pgf', 'pgm'], children: ['father'] },
    { parents: ['mgf', 'mgm'], children: ['mother'] },
    { parents: ['father', 'mother'], children: ['sister', 'self'] },
    { parents: ['brother_in_law', 'sister'], children: ['niece'] },
    { parents: ['ex_husband', 'self'], children: ['daughter', 'son'] },
  ],

  household: ['self', 'daughter', 'son'], // 한부모 3인 가구

  ecomap_systems: [
    // 의뢰인 A (본인)
    { id: 'work', label: '직장(사무직)', category: '직업', linked_to: ['self'],
      tone: 'tense', strength: 3, direction: 'bi' },
    { id: 'mom_support', label: '친정 어머니 지원', category: '이웃', linked_to: ['self', 'daughter', 'son'],
      tone: 'positive', strength: 3, direction: 'in' },
    { id: 'sister_family', label: '언니 가족(같은 동네)', category: '친구', linked_to: ['self'],
      tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'single_parent_group', label: '한부모 자조모임', category: '친구', linked_to: ['self'],
      tone: 'uncertain', strength: 1, direction: 'bi' },

    // 자녀
    { id: 'daughter_school', label: '딸 학교', category: '교육', linked_to: ['daughter'],
      tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'son_school', label: '아들 학교', category: '교육', linked_to: ['son'],
      tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'after_school', label: '아동 돌봄센터', category: '여가', linked_to: ['daughter', 'son'],
      tone: 'positive', strength: 2, direction: 'in' },

    // 가족 공동
    { id: 'health_center', label: '동네 보건소', category: '의료', linked_to: ['self', 'daughter', 'son'],
      tone: 'uncertain', strength: 1, direction: 'in' },

    // (의도적으로 종교·학습 카테고리 누락 → 보강 가이드 시연)
  ],

  // LLM이 채워주는 누락 항목 — 샘플에서는 비워두고 missing-checker가 결정론적으로 채운다
  missing: [],
};
