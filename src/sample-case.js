// 시연용 가상 케이스 모음 — 모두 학습 시연 목적의 가상 인물·기관이며 실제와 무관.
// "샘플 보기" 클릭마다 다른 케이스를 보여주기 위해 5개 사례를 보유.
//
// 각 케이스는 한국 사회복지 현장에서 자주 만나는 가족 유형:
//   1) 한부모 가정 (이혼)
//   2) 재혼 가정 (의붓자녀)
//   3) 독거 노인 (사별)
//   4) 다문화 가정 (외국인 배우자, 3대 동거)
//   5) 샌드위치 세대 (노부모 부양 + 청소년 자녀)

// ──────────────────────────────────────────────────────────────
// CASE 1 — 한부모 가정 (의뢰인 A, 42세 여성)
// ──────────────────────────────────────────────────────────────
const CASE_SINGLE_PARENT = {
  client_id: 'self',
  people: [
    { id: 'pgf', name: '친조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'pgm', name: '친조모', sex: 'F', alive: false, age: null, gen: 0 },
    { id: 'mgf', name: '외조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'mgm', name: '외조모', sex: 'F', alive: true, age: 78, gen: 0, notes: '농촌 거주' },
    { id: 'father', name: '아버지', sex: 'M', alive: false, age: 75, gen: 1, notes: '5년 전 작고' },
    { id: 'mother', name: '어머니', sex: 'F', alive: true, age: 68, gen: 1, occupation: '전업주부' },
    { id: 'sister', name: '언니', sex: 'F', alive: true, age: 45, gen: 2, occupation: '교사', notes: '같은 동네 거주' },
    { id: 'brother_in_law', name: '형부', sex: 'M', alive: true, age: 47, gen: 2, occupation: '회사원' },
    { id: 'self', name: '의뢰인 A', sex: 'F', alive: true, age: 42, gen: 2, occupation: '사무직', is_client: true, notes: '한부모(이혼)' },
    { id: 'ex_husband', name: '전남편', sex: 'M', alive: true, age: 45, gen: 2, occupation: '직장인', notes: '별도 거주, 양육비 송금' },
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
  household: ['self', 'daughter', 'son'],
  ecomap_systems: [
    { id: 'work', label: '직장(사무직)', category: '직업', linked_to: ['self'], tone: 'tense', strength: 3, direction: 'bi' },
    { id: 'mom_support', label: '친정 어머니 지원', category: '이웃', linked_to: ['self', 'daughter', 'son'], tone: 'positive', strength: 3, direction: 'in' },
    { id: 'sister_family', label: '언니 가족', category: '친구', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'single_parent_group', label: '한부모 자조모임', category: '친구', linked_to: ['self'], tone: 'uncertain', strength: 1, direction: 'bi' },
    { id: 'daughter_school', label: '딸 학교', category: '교육', linked_to: ['daughter'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'son_school', label: '아들 학교', category: '교육', linked_to: ['son'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'after_school', label: '아동 돌봄센터', category: '여가', linked_to: ['daughter', 'son'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'health_center', label: '동네 보건소', category: '의료', linked_to: ['self', 'daughter', 'son'], tone: 'uncertain', strength: 1, direction: 'in' },
  ],
  missing: [],
};

const TEXT_SINGLE_PARENT = `의뢰인 A는 42세 여성으로, 12세 딸과 9세 아들과 함께 거주 중인 한부모 가정의 가장입니다.
5년 전 이혼하였고, 전남편(45세, 직장인)은 별도 거주 중이며 양육비는 정기적으로 송금되나 자녀 면접교섭은 불규칙합니다.

가족 구성:
- 아버지(75세, 5년 전 작고).
- 어머니(68세, 전업주부): 같은 동네 거주, 손주 등하원 도움. 외조모(78세) 농촌 거주, 외조부 일찍 작고.
- 언니(45세 교사)와 형부(47세 회사원): 같은 동네, 조카(15세) 1명.
- 본인(42세 사무직), 딸(12세 초등6), 아들(9세 초등3).

생태계: 본인 사무직 야근으로 강한 긴장 관계. 친정 어머니가 가장 큰 지지. 동네 보건소 정기 검진(접근성 낮음).
한부모 자조모임 가끔 참여. 아동 돌봄센터로 방과 후 돌봄. 종교·취미·평생학습은 거의 없음.`;

// ──────────────────────────────────────────────────────────────
// CASE 2 — 재혼 가정 (의뢰인 B, 38세 여성)
// ──────────────────────────────────────────────────────────────
const CASE_REMARRIAGE = {
  client_id: 'self',
  people: [
    { id: 'pgf', name: '친조부', sex: 'M', alive: true, age: 65, gen: 0, occupation: '은퇴' },
    { id: 'pgm', name: '친조모', sex: 'F', alive: true, age: 63, gen: 0, occupation: '전업주부' },
    { id: 'hgf', name: '시아버지', sex: 'M', alive: true, age: 67, gen: 0, occupation: '은퇴' },
    { id: 'hgm', name: '시어머니', sex: 'F', alive: true, age: 64, gen: 0 },
    { id: 'self', name: '의뢰인 B', sex: 'F', alive: true, age: 38, gen: 1, occupation: '회사원(사무)', is_client: true, notes: '재혼 3년차' },
    { id: 'husband', name: '현 남편', sex: 'M', alive: true, age: 41, gen: 1, occupation: '자영업' },
    { id: 'ex_husband', name: '전남편', sex: 'M', alive: true, age: 40, gen: 1, occupation: '회사원', notes: '별도 거주, 양육비 송금' },
    { id: 'husband_ex', name: '남편의 전부인', sex: 'F', alive: true, age: 38, gen: 1, notes: '별도 거주' },
    { id: 'daughter', name: '딸(친녀)', sex: 'F', alive: true, age: 10, gen: 2, occupation: '초등 4학년' },
    { id: 'stepson', name: '아들(의붓자)', sex: 'M', alive: true, age: 12, gen: 2, occupation: '초등 6학년' },
  ],
  marriages: [
    { a: 'pgf', b: 'pgm', status: 'married' },
    { a: 'hgf', b: 'hgm', status: 'married' },
    { a: 'ex_husband', b: 'self', status: 'divorced' },
    { a: 'husband', b: 'self', status: 'married' },
    { a: 'husband', b: 'husband_ex', status: 'divorced' },
  ],
  parentships: [
    { parents: ['pgf', 'pgm'], children: ['self'] },
    { parents: ['hgf', 'hgm'], children: ['husband'] },
    { parents: ['ex_husband', 'self'], children: ['daughter'] },
    { parents: ['husband', 'husband_ex'], children: ['stepson'] },
  ],
  household: ['self', 'husband', 'daughter', 'stepson'],
  ecomap_systems: [
    { id: 'work', label: '본인 직장', category: '직업', linked_to: ['self'], tone: 'positive', strength: 3, direction: 'bi' },
    { id: 'husband_biz', label: '남편 자영업', category: '직업', linked_to: ['husband'], tone: 'tense', strength: 2, direction: 'bi' },
    { id: 'home', label: '친정', category: '이웃', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'in_laws', label: '시댁', category: '이웃', linked_to: ['self', 'husband'], tone: 'tense', strength: 2, direction: 'bi' },
    { id: 'daughter_school', label: '딸 학교', category: '교육', linked_to: ['daughter'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'stepson_school', label: '의붓아들 학교', category: '교육', linked_to: ['stepson'], tone: 'uncertain', strength: 2, direction: 'bi' },
    { id: 'family_counsel', label: '가족상담센터', category: '의료', linked_to: ['self', 'husband', 'daughter', 'stepson'], tone: 'positive', strength: 2, direction: 'in' },
  ],
  missing: [],
};

const TEXT_REMARRIAGE = `의뢰인 B는 38세 여성으로 재혼 3년 차. 41세 남편, 본인 친딸(10세, 초등4), 남편의 친아들(12세 의붓자녀, 초등6)과 4인 가구를 이룹니다.
본인은 일반회사 사무직으로 안정적, 남편은 자영업 운영(매출 변동 큼).

가족 구성:
- 친정(친조부 65 은퇴, 친조모 63 전업주부): 정서적 지원 가능.
- 시댁(시부 67 은퇴, 시모 64): 재혼·의붓자녀 양육 방식에 의견 차이로 긴장.
- 전남편(40세 회사원): 별도 거주, 양육비 송금하나 친딸 면접교섭 불규칙.
- 남편의 전부인(38세): 별도 거주, 의붓아들 면접교섭 정기적.

생태계: 본인 직장 만족도 높음. 친딸은 학교 적응 양호, 의붓아들은 새 가족 적응에 어려움 → 가족상담센터 정기 이용 중. 시댁과는 거리감.`;

// ──────────────────────────────────────────────────────────────
// CASE 3 — 독거 노인 (의뢰인 C, 75세 남성, 사별)
// ──────────────────────────────────────────────────────────────
const CASE_ELDERLY_ALONE = {
  client_id: 'self',
  people: [
    { id: 'pgf', name: '친조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'pgm', name: '친조모', sex: 'F', alive: false, age: null, gen: 0 },
    { id: 'mgf', name: '외조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'mgm', name: '외조모', sex: 'F', alive: false, age: null, gen: 0 },
    { id: 'father', name: '아버지', sex: 'M', alive: false, age: null, gen: 1 },
    { id: 'mother', name: '어머니', sex: 'F', alive: false, age: null, gen: 1 },
    { id: 'wife_father', name: '장인', sex: 'M', alive: false, age: null, gen: 1 },
    { id: 'wife_mother', name: '장모', sex: 'F', alive: false, age: null, gen: 1 },
    { id: 'brother', name: '형', sex: 'M', alive: true, age: 78, gen: 2, notes: '같은 동네, 왕래 미약' },
    { id: 'self', name: '의뢰인 C', sex: 'M', alive: true, age: 75, gen: 2, occupation: '무직(연금)', is_client: true, notes: '독거' },
    { id: 'wife', name: '아내(사별)', sex: 'F', alive: false, age: 67, gen: 2, notes: '5년 전 작고' },
    { id: 'son', name: '아들', sex: 'M', alive: true, age: 50, gen: 3, occupation: 'IT 회사원', notes: '미국 시애틀 거주' },
    { id: 'son_wife', name: '며느리', sex: 'F', alive: true, age: 48, gen: 3, notes: '미국 거주' },
    { id: 'daughter', name: '딸', sex: 'F', alive: true, age: 47, gen: 3, occupation: '주부', notes: '부산 거주' },
    { id: 'son_in_law', name: '사위', sex: 'M', alive: true, age: 49, gen: 3, occupation: '회사원', notes: '부산 거주' },
    { id: 'grandson', name: '손자', sex: 'M', alive: true, age: 20, gen: 4, occupation: '대학생', notes: '미국 거주' },
    { id: 'granddaughter', name: '손녀', sex: 'F', alive: true, age: 18, gen: 4, occupation: '고등학생', notes: '미국 거주' },
  ],
  marriages: [
    { a: 'pgf', b: 'pgm', status: 'married' },
    { a: 'mgf', b: 'mgm', status: 'married' },
    { a: 'father', b: 'mother', status: 'married' },
    { a: 'wife_father', b: 'wife_mother', status: 'married' },
    { a: 'self', b: 'wife', status: 'married' },
    { a: 'son', b: 'son_wife', status: 'married' },
    { a: 'son_in_law', b: 'daughter', status: 'married' },
  ],
  parentships: [
    { parents: ['pgf', 'pgm'], children: ['father'] },
    { parents: ['mgf', 'mgm'], children: ['mother'] },
    { parents: ['wife_father', 'wife_mother'], children: ['wife'] },
    { parents: ['father', 'mother'], children: ['brother', 'self'] },
    { parents: ['self', 'wife'], children: ['son', 'daughter'] },
    { parents: ['son', 'son_wife'], children: ['grandson', 'granddaughter'] },
  ],
  household: ['self'],
  ecomap_systems: [
    { id: 'senior_center', label: '동네 노인정', category: '여가', linked_to: ['self'], tone: 'positive', strength: 3, direction: 'bi' },
    { id: 'health_center', label: '보건소', category: '의료', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'church', label: '한인교회', category: '종교', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'welfare_center', label: '동네 복지관', category: '이웃', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'son_remote', label: '아들(미국)', category: '친구', linked_to: ['self'], tone: 'uncertain', strength: 1, direction: 'bi' },
    { id: 'daughter_busan', label: '딸(부산)', category: '친구', linked_to: ['self'], tone: 'uncertain', strength: 2, direction: 'bi' },
    { id: 'pension', label: '국민연금·기초연금', category: '직업', linked_to: ['self'], tone: 'positive', strength: 2, direction: 'in' },
  ],
  missing: [],
};

const TEXT_ELDERLY_ALONE = `의뢰인 C는 75세 남성으로 5년 전 아내(당시 67세, 암 투병 끝 작고)를 사별한 후 서울 강북 임대아파트에서 독거 중. 매달 국민연금 90만원과 기초연금으로 생활합니다.

가족: 큰아들(50세 IT 회사원)은 미국 시애틀에 며느리(48세), 손자(20세 대학생), 손녀(18세 고등학생)와 거주, 영상통화 월 1~2회. 작은딸(47세 주부)은 부산에서 사위(49세 회사원)와 거주, 명절 외 방문 어려움.
형(78세) 같은 동네 거주하나 왕래 미약. 친·외조부모, 부모, 장인장모 모두 작고.

외부 활동: 동네 노인정 매일 출입, 보건소에서 당뇨·고혈압 정기 진료, 한인교회 주일 예배, 동네 복지관 무료 식사 주 2~3회. 최근 무릎 통증으로 외출이 줄어들고 있음.`;

// ──────────────────────────────────────────────────────────────
// CASE 4 — 다문화 가정 (의뢰인 D, 35세 남성, 베트남 출신 아내)
// ──────────────────────────────────────────────────────────────
const CASE_MULTICULTURAL = {
  client_id: 'self',
  people: [
    { id: 'pgf', name: '친조부', sex: 'M', alive: false, age: null, gen: 0 },
    { id: 'pgm', name: '친조모', sex: 'F', alive: false, age: null, gen: 0 },
    { id: 'vgf', name: '처가 처부', sex: 'M', alive: true, age: null, gen: 0, notes: '베트남 호치민 거주, 나이 미상' },
    { id: 'vgm', name: '처가 처모', sex: 'F', alive: true, age: null, gen: 0, notes: '베트남 호치민 거주' },
    { id: 'father', name: '아버지', sex: 'M', alive: true, age: 65, gen: 1, occupation: '농업(은퇴)', notes: '같은 집 동거' },
    { id: 'mother', name: '어머니', sex: 'F', alive: true, age: 60, gen: 1, occupation: '전업주부', notes: '같은 집 동거' },
    { id: 'self', name: '의뢰인 D', sex: 'M', alive: true, age: 35, gen: 2, occupation: '농업(과수원)', is_client: true },
    { id: 'wife', name: '아내', sex: 'F', alive: true, age: 30, gen: 2, occupation: '전업주부', notes: '베트남 출신, 한국 거주 7년' },
    { id: 'wife_brother', name: '처남', sex: 'M', alive: true, age: 28, gen: 2, notes: '베트남 거주' },
    { id: 'son', name: '아들', sex: 'M', alive: true, age: 5, gen: 3, occupation: '어린이집' },
  ],
  marriages: [
    { a: 'pgf', b: 'pgm', status: 'married' },
    { a: 'vgf', b: 'vgm', status: 'married' },
    { a: 'father', b: 'mother', status: 'married' },
    { a: 'self', b: 'wife', status: 'married' },
  ],
  parentships: [
    { parents: ['pgf', 'pgm'], children: ['father'] },
    { parents: ['vgf', 'vgm'], children: ['wife', 'wife_brother'] },
    { parents: ['father', 'mother'], children: ['self'] },
    { parents: ['self', 'wife'], children: ['son'] },
  ],
  household: ['self', 'wife', 'son', 'father', 'mother'],
  ecomap_systems: [
    { id: 'farm', label: '본인 과수원', category: '직업', linked_to: ['self'], tone: 'positive', strength: 3, direction: 'bi' },
    { id: 'multi_center', label: '다문화가족지원센터', category: '이웃', linked_to: ['self', 'wife', 'son'], tone: 'positive', strength: 3, direction: 'in' },
    { id: 'korean_class', label: '한국어 교실', category: '학습', linked_to: ['wife'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'kindergarten', label: '어린이집', category: '교육', linked_to: ['son'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'mil_conflict', label: '시모-며느리 갈등', category: '이웃', linked_to: ['wife'], tone: 'tense', strength: 2, direction: 'bi' },
    { id: 'vietnam_family', label: '베트남 친정', category: '친구', linked_to: ['wife'], tone: 'uncertain', strength: 1, direction: 'bi' },
    { id: 'health_center', label: '보건소', category: '의료', linked_to: ['self', 'wife', 'son'], tone: 'uncertain', strength: 1, direction: 'in' },
  ],
  missing: [],
};

const TEXT_MULTICULTURAL = `의뢰인 D는 35세 남성으로 충남 농촌 지역에서 부모님(아버지 65세 농업 은퇴, 어머니 60세 전업주부), 베트남 출신 아내(30세, 한국 거주 7년 차), 5세 아들과 3대 동거 중. 가업인 사과 농사 운영.
아내는 한국어 학습 지속하나 일상 회화 수준. 어린이집 다니는 아들은 한국어 의사소통 가능.

가장 큰 어려움은 아내와 시어머니 간 문화 차이로 인한 갈등(식문화·자녀 양육 방식·종교). 다문화가족지원센터에서 통역·상담·한국어 교실 정기 이용으로 큰 도움. 아내 친정(베트남 호치민, 처부·처모 정확한 나이 미상, 처남 28세)과는 영상통화 월 1~2회. 친조부모는 작고하셨음.`;

// ──────────────────────────────────────────────────────────────
// CASE 5 — 샌드위치 세대 (의뢰인 E, 49세 남성, 노부모 부양 + 청소년 자녀)
// ──────────────────────────────────────────────────────────────
const CASE_SANDWICH = {
  client_id: 'self',
  people: [
    { id: 'father', name: '아버지', sex: 'M', alive: false, age: 82, gen: 0, notes: '5년 전 폐암 작고' },
    { id: 'mother', name: '어머니', sex: 'F', alive: true, age: 78, gen: 0, notes: '치매 중기, 주간보호센터 이용' },
    { id: 'father_in_law', name: '처부', sex: 'M', alive: true, age: 75, gen: 0, occupation: '은퇴', notes: '부산 거주' },
    { id: 'mother_in_law', name: '처모', sex: 'F', alive: true, age: 73, gen: 0, occupation: '전업주부', notes: '부산 거주' },
    { id: 'brother', name: '형', sex: 'M', alive: true, age: 52, gen: 1, occupation: '자영업', notes: '같은 동네, 부양 갈등' },
    { id: 'sister', name: '누나', sex: 'F', alive: true, age: 54, gen: 1, notes: '미국 거주, 1년 1~2회 방문' },
    { id: 'self', name: '의뢰인 E', sex: 'M', alive: true, age: 49, gen: 1, occupation: '중견기업 부장', is_client: true },
    { id: 'wife', name: '아내', sex: 'F', alive: true, age: 47, gen: 1, occupation: '초등 교사' },
    { id: 'wife_brother', name: '처남', sex: 'M', alive: true, age: 50, gen: 1, occupation: '회사원', notes: '부산, 처부모 모심' },
    { id: 'daughter', name: '큰딸', sex: 'F', alive: true, age: 17, gen: 2, occupation: '고등학교 2학년', notes: '입시 스트레스, 등교 거부 2회' },
    { id: 'son', name: '아들', sex: 'M', alive: true, age: 14, gen: 2, occupation: '중학교 2학년', notes: '게임 몰두, 부모 갈등' },
  ],
  marriages: [
    { a: 'father', b: 'mother', status: 'married' },
    { a: 'father_in_law', b: 'mother_in_law', status: 'married' },
    { a: 'self', b: 'wife', status: 'married' },
  ],
  parentships: [
    { parents: ['father', 'mother'], children: ['brother', 'sister', 'self'] },
    { parents: ['father_in_law', 'mother_in_law'], children: ['wife', 'wife_brother'] },
    { parents: ['self', 'wife'], children: ['daughter', 'son'] },
  ],
  household: ['self', 'wife', 'daughter', 'son'],
  ecomap_systems: [
    { id: 'work', label: '직장(중견기업)', category: '직업', linked_to: ['self'], tone: 'tense', strength: 3, direction: 'bi' },
    { id: 'school_wife', label: '아내 직장(초등학교)', category: '직업', linked_to: ['wife'], tone: 'positive', strength: 2, direction: 'bi' },
    { id: 'mom_daycare', label: '주간보호센터', category: '의료', linked_to: ['mother'], tone: 'positive', strength: 3, direction: 'in' },
    { id: 'dementia_center', label: '치매안심센터', category: '의료', linked_to: ['self', 'wife', 'mother'], tone: 'positive', strength: 2, direction: 'in' },
    { id: 'eap', label: '회사 EAP 상담', category: '의료', linked_to: ['self'], tone: 'uncertain', strength: 1, direction: 'in' },
    { id: 'school_counsel', label: '큰딸 학교 상담', category: '교육', linked_to: ['daughter'], tone: 'uncertain', strength: 2, direction: 'bi' },
    { id: 'church', label: '아내 교회', category: '종교', linked_to: ['wife'], tone: 'positive', strength: 3, direction: 'bi' },
    { id: 'brother_conflict', label: '형(부양 분담 갈등)', category: '이웃', linked_to: ['self'], tone: 'tense', strength: 2, direction: 'bi' },
  ],
  missing: [],
};

const TEXT_SANDWICH = `의뢰인 E는 49세 남성으로 47세 아내(초등 교사), 17세 큰딸(고2), 14세 아들(중2)과 서울에서 4인 가구. 본인 중견기업 부장, 야근 잦고 업무 스트레스 큼.

가족: 아버지(82세) 5년 전 폐암 작고. 모친(78세) 치매 중기 진단, 경기도 본가 거주하다가 인지 저하로 주간보호센터 이용 중. 형(52세 자영업)이 같은 동네 살지만 부양 분담으로 갈등. 누나(54세) 미국 거주.
처가는 부산: 처부(75 은퇴), 처모(73), 처남(50 회사원)이 부모님 모심.

자녀 어려움: 큰딸은 입시 스트레스로 등교 거부 2회, 학교 상담교사 1회 면담. 작은아들은 사춘기 게임 몰두로 부모와 자주 다툼.
아내는 교회 활동에 큰 위로를 받음. 본인은 종교·취미·친구 거의 없음.
외부: 모친 주간보호센터(평일), 동네 보건소 치매안심센터에서 가족 상담 시작, 회사 EAP 상담 1회. 운동·취미 거의 없고 수면의 질 악화.`;

// ──────────────────────────────────────────────────────────────
// 수집 — UI에서 누를 때마다 순환 표시
// ──────────────────────────────────────────────────────────────
export const SAMPLE_CASES = [
  {
    id: 'single_parent',
    label: '한부모 가정 — 의뢰인 A (42세 여성)',
    description: '이혼 후 12세 딸·9세 아들과 거주. 친정 어머니 지원망.',
    data: CASE_SINGLE_PARENT,
    interviewText: TEXT_SINGLE_PARENT,
  },
  {
    id: 'remarriage',
    label: '재혼 가정 — 의뢰인 B (38세 여성)',
    description: '재혼 3년차, 친딸 + 의붓아들과 4인 가구.',
    data: CASE_REMARRIAGE,
    interviewText: TEXT_REMARRIAGE,
  },
  {
    id: 'elderly_alone',
    label: '독거 노인 — 의뢰인 C (75세 남성)',
    description: '아내 사별 5년, 자녀 해외/지방 거주. 동네 노인정 의존.',
    data: CASE_ELDERLY_ALONE,
    interviewText: TEXT_ELDERLY_ALONE,
  },
  {
    id: 'multicultural',
    label: '다문화 가정 — 의뢰인 D (35세 남성)',
    description: '베트남 출신 아내, 시부모 동거 3대 가구.',
    data: CASE_MULTICULTURAL,
    interviewText: TEXT_MULTICULTURAL,
  },
  {
    id: 'sandwich',
    label: '샌드위치 세대 — 의뢰인 E (49세 남성)',
    description: '치매 모친 부양 + 청소년 자녀 양육 + 직장 스트레스.',
    data: CASE_SANDWICH,
    interviewText: TEXT_SANDWICH,
  },
];

// 호환성용 (기존 import 깨지지 않도록 첫 케이스 데이터 노출)
export const SAMPLE_CASE = SAMPLE_CASES[0].data;
