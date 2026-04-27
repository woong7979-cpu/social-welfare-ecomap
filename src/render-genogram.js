// 가계도 SVG 렌더러 v2 — 부모-중심 정렬, 부부 세대 전파, 자녀 그룹 정렬
//
// 알고리즘
//   1) 세대 할당: 명시 gen → 시작값. 그 다음 부모-자녀 관계와 부부 관계를 통해 saturate.
//      (부부는 같은 세대, 자녀는 부모 세대+1, 부모는 자녀 세대-1)
//   2) 단위 구성: 같은 세대 안에서 부부=한 묶음(couple), 단독=solo로 묶음.
//   3) 톱-다운 배치: 세대를 0부터 차례로 배치.
//      - 각 단위는 부모(상위 세대)의 X 중심 아래에 배치하려고 시도
//      - 좌→우 cursor로 충돌(겹침) 방지
//      - 단위 정렬 키: 부모X(없으면 0), 같은 부모면 출생순(나이 desc)
//   4) 보텀-업 보정: 자녀 그룹 중심이 부모 중심보다 오른쪽으로 밀렸으면 부모 단위를 우측으로 시프트.
//   5) 세대 끝나면 다음 세대도 동일.

const NODE_W = 64;
const NODE_H = 64;
const COL_GAP = 28;       // 형제 단위 간 가로 여백
const COUPLE_GAP = 28;    // 부부 사이 결혼선 여백
const ROW_GAP = 110;      // 세대간 세로 간격
const PAD = 60;

export function renderGenogram(svg, data) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const peopleById = new Map((data.people || []).map(p => [p.id, { ...p }]));
  const marriages = (data.marriages || []).filter(m => peopleById.has(m.a) && peopleById.has(m.b));
  const parentships = (data.parentships || [])
    .map(ps => ({
      parents: (ps.parents || []).filter(id => peopleById.has(id)),
      children: (ps.children || []).filter(id => peopleById.has(id)),
    }))
    .filter(ps => ps.parents.length > 0 && ps.children.length > 0);

  if (peopleById.size === 0) return;

  // 1) 세대 할당
  assignGenerations(peopleById, parentships, marriages, data.client_id);

  // 2) 부부 인덱스
  const couples = marriages.map((m, i) => ({
    id: `c${i}`, a: m.a, b: m.b, status: m.status || 'married',
  }));

  // 2-b) 부모 쌍에서 implicit couple 추론
  //   LLM이 인터뷰에서 부부 관계를 명시적으로 안 뽑은 경우(예: "외조부는 일찍 작고, 외조모는 농촌 거주"
  //   처럼 결혼/혼인 단어 없이 부모만 언급된 경우)에도, 같은 자녀의 부모 쌍이라면 결혼 관계로 보고
  //   결혼선이 그려지도록 자동 보완.
  const knownPair = new Set(couples.map(c => [c.a, c.b].sort().join('|')));
  for (const ps of parentships) {
    if (ps.parents.length !== 2) continue;
    const key = [ps.parents[0], ps.parents[1]].sort().join('|');
    if (knownPair.has(key)) continue;
    couples.push({
      id: `c_implicit_${couples.length}`,
      a: ps.parents[0], b: ps.parents[1],
      status: 'married',
    });
    // marriages 배열에도 추가 — drawMarriageLine 루프에서 결혼선 그려지도록
    marriages.push({ a: ps.parents[0], b: ps.parents[1], status: 'married' });
    knownPair.add(key);
  }

  // 3) 톱-다운 배치
  const positions = layoutTopDown(peopleById, parentships, couples);

  // 4) 보텀-업 정렬: 부모 단위를 자녀 중심에 맞춰 우측 시프트 (필요 시)
  alignParentsToChildren(positions, parentships, couples, peopleById);

  // 5) 좌측 음수 보정 + 충돌 재정리
  normalizePositions(positions, peopleById, couples);

  // 6) 캔버스 크기
  const allX = [...positions.values()].map(p => p.x);
  const allY = [...positions.values()].map(p => p.y);
  const width = Math.max(...allX) + NODE_W + PAD * 2;
  const height = Math.max(...allY) + NODE_H + PAD * 2;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // 7) 결혼선
  for (const m of marriages) drawMarriageLine(svg, positions.get(m.a), positions.get(m.b), m.status);

  // 8) 부모-자녀선
  for (const ps of parentships) drawParentChildLines(svg, ps, positions);

  // 9) 인물 노드
  for (const p of peopleById.values()) {
    const pos = positions.get(p.id);
    if (pos) drawPerson(svg, p, pos, p.id === data.client_id);
  }
}

// ──────────────────────────────────────────────────────────────
// 1) 세대 할당 (saturating BFS, 명시 gen + parentship + marriage)
// ──────────────────────────────────────────────────────────────
function assignGenerations(peopleById, parentships, marriages, clientId) {
  for (const p of peopleById.values()) {
    if (typeof p.gen === 'number') p._gen = p.gen;
  }
  // 시드: 클라이언트 = 0 (없으면 첫 인물)
  if (clientId && peopleById.has(clientId) && peopleById.get(clientId)._gen === undefined) {
    peopleById.get(clientId)._gen = 0;
  }
  if (![...peopleById.values()].some(p => p._gen !== undefined)) {
    [...peopleById.values()][0]._gen = 0;
  }

  let changed = true, iter = 0;
  while (changed && iter < 100) {
    iter++; changed = false;

    // 부부는 같은 세대
    for (const m of marriages) {
      const a = peopleById.get(m.a), b = peopleById.get(m.b);
      if (a._gen !== undefined && b._gen === undefined) { b._gen = a._gen; changed = true; }
      else if (b._gen !== undefined && a._gen === undefined) { a._gen = b._gen; changed = true; }
    }
    // 부모-자녀
    for (const ps of parentships) {
      const childGens = ps.children.map(id => peopleById.get(id)._gen).filter(g => g !== undefined);
      const parentGens = ps.parents.map(id => peopleById.get(id)._gen).filter(g => g !== undefined);
      if (childGens.length) {
        const gParent = Math.min(...childGens) - 1;
        for (const pid of ps.parents) {
          const par = peopleById.get(pid);
          if (par._gen === undefined) { par._gen = gParent; changed = true; }
        }
      }
      if (parentGens.length) {
        const gChild = Math.max(...parentGens) + 1;
        for (const cid of ps.children) {
          const ch = peopleById.get(cid);
          if (ch._gen === undefined) { ch._gen = gChild; changed = true; }
        }
      }
    }
  }
  // 미할당 → 0, 정규화
  for (const p of peopleById.values()) if (p._gen === undefined) p._gen = 0;
  const minGen = Math.min(...[...peopleById.values()].map(p => p._gen));
  for (const p of peopleById.values()) p._gen -= minGen;
}

// ──────────────────────────────────────────────────────────────
// 2) 단위 구성 헬퍼
// ──────────────────────────────────────────────────────────────
function buildUnitsForGen(peopleInGen, couples) {
  const used = new Set();
  const units = [];
  for (const p of peopleInGen) {
    if (used.has(p.id)) continue;
    const couple = couples.find(c =>
      (c.a === p.id || c.b === p.id) &&
      peopleInGen.some(q => q.id === (c.a === p.id ? c.b : c.a))
    );
    if (couple) {
      const spouseId = couple.a === p.id ? couple.b : couple.a;
      const spouse = peopleInGen.find(q => q.id === spouseId);
      // 표준: 남자 좌측, 여자 우측
      const left = p.sex === 'M' ? p : (spouse.sex === 'M' ? spouse : p);
      const right = left === p ? spouse : p;
      units.push({ kind: 'couple', id: couple.id, left, right, status: couple.status, members: [p.id, spouseId] });
      used.add(spouseId);
    } else {
      units.push({ kind: 'solo', id: p.id, person: p, members: [p.id] });
    }
  }
  return units;
}

function unitWidth(unit) {
  return unit.kind === 'couple' ? (NODE_W * 2 + COUPLE_GAP) : NODE_W;
}

// ──────────────────────────────────────────────────────────────
// 3) 톱-다운 배치
// ──────────────────────────────────────────────────────────────
function layoutTopDown(peopleById, parentships, couples) {
  // 세대별 분류
  const byGen = new Map();
  for (const p of peopleById.values()) {
    if (!byGen.has(p._gen)) byGen.set(p._gen, []);
    byGen.get(p._gen).push(p);
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b);

  const positions = new Map();

  for (const g of gens) {
    const peopleInGen = byGen.get(g);
    const units = buildUnitsForGen(peopleInGen, couples);

    // 부모 X 중심을 미리 계산 (이미 배치된 상위 세대에서)
    for (const u of units) {
      u._desiredX = computeDesiredCenter(u, parentships, positions);
      u._maxAge = u.kind === 'couple'
        ? Math.max(u.left.age || 0, u.right.age || 0)
        : (u.person.age || 0);
      // 가계 정렬 우선순위: 자녀가 다음 세대 부부에서 M(좌) 이면 -1, F(우)이면 +1
      // 이걸로 친조부모(아들=아버지의 부모)는 좌측, 외조부모(딸=어머니의 부모)는 우측에 자동 배치
      u._lineage = lineagePriority(u, parentships, peopleById);
    }

    // 정렬:
    //  1) desiredX가 충분히 다르면 그 순서
    //  2) 같은 부모군(형제)이면 나이 desc (출생순)
    //  3) 부모군이 다르면 가계 정렬 (친=좌, 외=우)
    //  4) 그 외 tiebreaker: 나이 desc
    units.sort((a, b) => {
      const ax = a._desiredX === null ? Number.POSITIVE_INFINITY : a._desiredX;
      const bx = b._desiredX === null ? Number.POSITIVE_INFINITY : b._desiredX;
      if (Number.isFinite(ax) && Number.isFinite(bx) && Math.abs(ax - bx) > 1) return ax - bx;
      if (sameParentGroup(a, b, parentships)) return b._maxAge - a._maxAge;
      if (a._lineage !== b._lineage) return a._lineage - b._lineage;
      return b._maxAge - a._maxAge;
    });

    // 좌→우 cursor 배치
    let cursor = PAD;
    const y = PAD + g * (NODE_H + ROW_GAP);
    for (const u of units) {
      const w = unitWidth(u);
      let startX;
      if (u._desiredX !== null) {
        startX = Math.max(cursor, u._desiredX - w / 2);
      } else {
        startX = cursor;
      }
      placeUnit(u, startX, y, positions);
      cursor = startX + w + COL_GAP;
    }
  }
  return positions;
}

function placeUnit(u, x, y, positions) {
  if (u.kind === 'couple') {
    positions.set(u.left.id, { x, y, person: u.left });
    positions.set(u.right.id, { x: x + NODE_W + COUPLE_GAP, y, person: u.right });
  } else {
    positions.set(u.person.id, { x, y, person: u.person });
  }
}

// 두 단위가 같은 부모군(형제)에서 나왔는지 판별
function sameParentGroup(uA, uB, parentships) {
  for (const ps of parentships) {
    const aMatch = uA.members.some(id => ps.children.includes(id));
    const bMatch = uB.members.some(id => ps.children.includes(id));
    if (aMatch && bMatch) return true;
  }
  return false;
}

// 가계 정렬 우선순위 — 자녀가 다음 세대 부부에서 M(좌측)이면 음수, F(우측)이면 양수.
// 부모 세대(예: gen 0)에서 자녀의 결혼 위치를 미리 보고 친(아버지의 부모)을 좌측,
// 외(어머니의 부모)를 우측에 자연스럽게 배치하기 위함.
function lineagePriority(unit, parentships, peopleById) {
  let p = 0;
  for (const memberId of unit.members) {
    for (const ps of parentships) {
      if (!ps.parents.includes(memberId)) continue;
      for (const childId of ps.children) {
        const ch = peopleById.get(childId);
        if (!ch) continue;
        if (ch.sex === 'M') p -= 1;       // 아들 = 좌측 가계
        else if (ch.sex === 'F') p += 1;  // 딸 = 우측 가계
      }
    }
  }
  return p;
}

// 부모(들)의 위치를 보고, 자식 단위가 위치할 X 중심을 계산
// - couple 단위면 두 배우자의 부모군 모두 평균
// - solo 단위면 본인 부모군 1개
function computeDesiredCenter(unit, parentships, positions) {
  const memberIds = unit.members;
  const centers = [];
  for (const memberId of memberIds) {
    for (const ps of parentships) {
      if (!ps.children.includes(memberId)) continue;
      const placed = ps.parents.map(pid => positions.get(pid)).filter(Boolean);
      if (placed.length === 0) continue;
      const minX = Math.min(...placed.map(p => p.x));
      const maxX = Math.max(...placed.map(p => p.x)) + NODE_W;
      centers.push((minX + maxX) / 2);
    }
  }
  if (centers.length === 0) return null;
  return centers.reduce((a, b) => a + b, 0) / centers.length;
}

// ──────────────────────────────────────────────────────────────
// 4) 보텀-업 보정: 부모 단위를 자녀 그룹 중심에 맞춰 시프트
// ──────────────────────────────────────────────────────────────
function alignParentsToChildren(positions, parentships, couples, peopleById) {
  // 가장 깊은 세대부터 위로 올라오면서, 각 부모 그룹이 자녀 중심보다 왼쪽이면
  // 부모 단위(부부 또는 솔로)를 자녀 중심에 맞춰 우측 시프트
  const gens = [...new Set([...peopleById.values()].map(p => p._gen))].sort((a, b) => b - a);
  for (const g of gens) {
    if (g === 0) continue;
    for (const ps of parentships) {
      // ps의 자녀 중 한 명이라도 g 세대인지 확인
      const childPos = ps.children.map(id => positions.get(id)).filter(Boolean);
      if (childPos.length === 0) continue;
      const childGen = childPos[0]?.person?._gen;
      if (childGen !== g) continue;

      const parentPos = ps.parents.map(id => positions.get(id)).filter(Boolean);
      if (parentPos.length === 0) continue;

      const childMinX = Math.min(...childPos.map(p => p.x));
      const childMaxX = Math.max(...childPos.map(p => p.x)) + NODE_W;
      const childCenter = (childMinX + childMaxX) / 2;

      const parentMinX = Math.min(...parentPos.map(p => p.x));
      const parentMaxX = Math.max(...parentPos.map(p => p.x)) + NODE_W;
      const parentCenter = (parentMinX + parentMaxX) / 2;

      const dx = childCenter - parentCenter;
      if (dx > 1) {
        // 부모 단위(부부면 같이) 우측으로 시프트, 그리고 같은 세대에서 부모보다 우측에 있는 모든 노드도 함께 시프트
        const parentGen = parentPos[0]?.person?._gen;
        const shiftIds = new Set();
        // 부모 본인들
        for (const pp of parentPos) shiftIds.add(pp.person.id);
        // 부모의 배우자(있으면 같이)
        for (const pid of ps.parents) {
          const couple = couples.find(c => c.a === pid || c.b === pid);
          if (couple) {
            shiftIds.add(couple.a); shiftIds.add(couple.b);
          }
        }
        // 같은 세대에서 부모보다 우측에 있는 모든 노드
        for (const [id, pos] of positions.entries()) {
          if (pos.person._gen === parentGen && pos.x >= parentMinX) {
            shiftIds.add(id);
          }
        }
        for (const id of shiftIds) {
          const p = positions.get(id);
          if (p) p.x += dx;
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 5) 음수 보정 + 같은 세대 충돌 해소
// ──────────────────────────────────────────────────────────────
function normalizePositions(positions, peopleById, couples) {
  // 음수 X 보정
  const minX = Math.min(...[...positions.values()].map(p => p.x));
  if (minX < PAD) {
    const shift = PAD - minX;
    for (const v of positions.values()) v.x += shift;
  }

  // 같은 세대 내 충돌 해소 (부부 묶음 단위)
  const gens = [...new Set([...peopleById.values()].map(p => p._gen))].sort((a, b) => a - b);
  for (const g of gens) {
    const peopleInG = [...peopleById.values()].filter(p => p._gen === g);
    const groupMap = new Map();
    for (const p of peopleInG) {
      const couple = couples.find(c =>
        (c.a === p.id || c.b === p.id) &&
        peopleInG.some(q => q.id === (c.a === p.id ? c.b : c.a)));
      const key = couple ? couple.id : p.id;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(p.id);
    }
    const groups = [...groupMap.values()].map(ids => ({
      ids, ps: ids.map(id => positions.get(id)).filter(Boolean),
    }));
    const left = (gr) => Math.min(...gr.ps.map(p => p.x));
    const right = (gr) => Math.max(...gr.ps.map(p => p.x)) + NODE_W;
    groups.sort((a, b) => left(a) - left(b));
    for (let i = 1; i < groups.length; i++) {
      const minLeft = right(groups[i - 1]) + COL_GAP;
      if (left(groups[i]) < minLeft) {
        const dx = minLeft - left(groups[i]);
        groups[i].ps.forEach(p => { p.x += dx; });
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 6) 그리기
// ──────────────────────────────────────────────────────────────
function drawPerson(svg, p, pos, isClient) {
  const cx = pos.x + NODE_W / 2;
  const cy = pos.y + NODE_H / 2;
  const stroke = isClient ? '#1565C0' : '#333';
  const fill = isClient ? '#E3F2FD' : '#fff';
  const strokeW = isClient ? 4 : 2;

  let shape;
  if (p.sex === 'M') {
    shape = el('rect', { x: pos.x, y: pos.y, width: NODE_W, height: NODE_H, fill, stroke, 'stroke-width': strokeW });
  } else if (p.sex === 'F') {
    shape = el('circle', { cx, cy, r: NODE_W / 2, fill, stroke, 'stroke-width': strokeW });
  } else {
    shape = el('polygon', {
      points: `${cx},${pos.y} ${pos.x + NODE_W},${cy} ${cx},${pos.y + NODE_H} ${pos.x},${cy}`,
      fill, stroke, 'stroke-width': strokeW,
    });
  }
  svg.appendChild(shape);

  if (p.alive === false) {
    svg.appendChild(el('line', { x1: pos.x, y1: pos.y, x2: pos.x + NODE_W, y2: pos.y + NODE_H, stroke: '#333', 'stroke-width': 2 }));
    svg.appendChild(el('line', { x1: pos.x + NODE_W, y1: pos.y, x2: pos.x, y2: pos.y + NODE_H, stroke: '#333', 'stroke-width': 2 }));
  }

  const labelColor = isClient ? '#1565C0' : '#222';
  if (p.age != null) {
    svg.appendChild(text(cx, cy + 5, String(p.age), { 'font-size': 18, 'font-weight': 700, 'text-anchor': 'middle', fill: labelColor }));
  }
  if (p.name) {
    svg.appendChild(text(cx, pos.y + NODE_H + 16, p.name, { 'font-size': 11, 'text-anchor': 'middle', fill: labelColor }));
  }
  if (p.occupation) {
    svg.appendChild(text(cx, pos.y + NODE_H + 30, p.occupation, { 'font-size': 9, 'text-anchor': 'middle', fill: '#666' }));
  }

  const titleEl = el('title', {});
  titleEl.textContent = describePerson(p);
  shape.appendChild(titleEl);
}

function drawMarriageLine(svg, A, B, status) {
  if (!A || !B) return;
  const y = A.y + NODE_H / 2;
  // 결혼선이 노드 가장자리에서 끊겨 보이지 않도록, 양쪽 노드 안쪽으로 약간 연장
  // (노드 X 마크와 살짝 겹쳐도 무방 — 시각적 연속성 우선)
  const overlap = 4;
  const x1 = Math.min(A.x, B.x) + NODE_W - overlap;
  const x2 = Math.max(A.x, B.x) + overlap;
  const mx = (x1 + x2) / 2;

  // 표준 표기:
  //   married   → 실선
  //   cohabit/partner → 점선 (동거/사실혼)
  //   separated → 실선 + 사선 1개
  //   divorced  → 실선 + 사선 2개
  const isCohabit = status === 'cohabit' || status === 'partner' || status === 'lt';
  const dash = isCohabit ? '6 4' : null;

  svg.appendChild(el('line', {
    x1, y1: y, x2, y2: y, stroke: '#222', 'stroke-width': 2.5,
    'stroke-linecap': 'round',
    ...(dash && { 'stroke-dasharray': dash }),
  }));

  if (status === 'separated') {
    // 사선 1개 (별거)
    svg.appendChild(el('line', {
      x1: mx - 4, y1: y - 8, x2: mx + 4, y2: y + 8, stroke: '#333', 'stroke-width': 2,
    }));
  } else if (status === 'divorced') {
    // 사선 2개 (이혼) — 살짝 빨간 톤으로 가독성 강조
    svg.appendChild(el('line', {
      x1: mx - 8, y1: y - 8, x2: mx, y2: y + 8, stroke: '#c00', 'stroke-width': 2,
    }));
    svg.appendChild(el('line', {
      x1: mx + 2, y1: y - 8, x2: mx + 10, y2: y + 8, stroke: '#c00', 'stroke-width': 2,
    }));
  }
}

function drawParentChildLines(svg, ps, positions) {
  const parents = ps.parents.map(id => positions.get(id)).filter(Boolean);
  const children = ps.children.map(id => positions.get(id)).filter(Boolean);
  if (parents.length === 0 || children.length === 0) return;

  let busX;
  if (parents.length === 2) {
    const minX = Math.min(parents[0].x, parents[1].x);
    const maxX = Math.max(parents[0].x, parents[1].x);
    busX = (minX + NODE_W + maxX) / 2;
  } else {
    busX = parents[0].x + NODE_W / 2;
  }
  const busTopY = parents[0].y + NODE_H / 2;
  const childTopY = children[0].y;
  const busY = (busTopY + childTopY) / 2;

  // 1) 부모 부부 중심에서 busY까지 수직 드롭
  svg.appendChild(el('line', { x1: busX, y1: busTopY, x2: busX, y2: busY, stroke: '#333', 'stroke-width': 1.5 }));

  // 2) 자녀 가로 bus — busX(부모 중심)도 반드시 포함하여 수직 드롭과 자녀들을 잇도록 확장.
  //    자녀가 1명이고 부모 중심과 X가 다르면, bus가 0길이가 되어 라인이 끊겨 보이는 버그를 방지.
  const childCxList = children.map(c => c.x + NODE_W / 2);
  const minCx = Math.min(...childCxList, busX);
  const maxCx = Math.max(...childCxList, busX);
  if (maxCx > minCx) {
    svg.appendChild(el('line', { x1: minCx, y1: busY, x2: maxCx, y2: busY, stroke: '#333', 'stroke-width': 1.5 }));
  }

  // 3) bus에서 각 자녀 위로 수직 드롭
  for (const c of children) {
    const cx = c.x + NODE_W / 2;
    svg.appendChild(el('line', { x1: cx, y1: busY, x2: cx, y2: c.y, stroke: '#333', 'stroke-width': 1.5 }));
  }
}

function describePerson(p) {
  const parts = [p.name || p.id];
  if (p.age != null) parts.push(`${p.age}세`);
  parts.push(p.sex === 'M' ? '남' : p.sex === 'F' ? '여' : '미상');
  if (p.alive === false) parts.push('사망');
  if (p.occupation) parts.push(p.occupation);
  if (p.notes) parts.push(`(${p.notes})`);
  return parts.join(' · ');
}

function el(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  }
  return e;
}
function text(x, y, content, attrs = {}) {
  const t = el('text', { x, y, ...attrs });
  t.textContent = content;
  return t;
}
