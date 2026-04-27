// 가계도 SVG 렌더러
// 입력: { people, marriages, parentships, client_id }
// - people[].gen 이 없으면 부모-자식 관계로 자동 산출
// - 같은 세대는 한 행에 좌→우 배치 (배우자 인접, 같은 부모 자녀 그룹화)
// - 남자 = 사각형, 여자 = 원, 알 수 없음 = 마름모
// - 사망 = 큰 X 오버레이
// - 본인(client) = 굵은 테두리 + 강조 색
// - 누락(missing_fields 비어있지 않음) = 회색 + 점선 테두리 + ❓ 배지

const NODE_W = 64;       // 사각형/원 한 변
const NODE_H = 64;
const COL_GAP = 24;      // 형제간 가로 간격
const COUPLE_GAP = 32;   // 부부 사이 간격 (결혼선 길이)
const ROW_GAP = 110;     // 세대간 세로 간격
const PAD = 60;          // 캔버스 여백

export function renderGenogram(svg, data) {
  // 정리
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const peopleById = new Map(data.people.map(p => [p.id, { ...p }]));

  // 1) 세대 산출 (BFS from client)
  assignGenerations(peopleById, data.parentships, data.client_id);

  // 2) 가족 단위(부모 쌍 → 자녀들) 트리 구성
  const couples = buildCouples(data.marriages, peopleById);
  // person id -> couple id (배우자가 있는 경우)
  const personToCouple = new Map();
  couples.forEach(c => { personToCouple.set(c.a, c.id); personToCouple.set(c.b, c.id); });

  // 3) 세대별 좌→우 정렬
  // 단순 휴리스틱: 같은 부모 그룹은 인접, 부부는 인접, 부부 단위로 행 배치
  const generations = groupByGen(peopleById);
  const positions = layoutGenerations(generations, data.parentships, couples, peopleById);

  // 캔버스 크기 계산
  const allX = [...positions.values()].map(p => p.x);
  const allY = [...positions.values()].map(p => p.y);
  const width = Math.max(...allX) + NODE_W + PAD * 2;
  const height = Math.max(...allY) + NODE_H + PAD * 2;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // 4) 결혼선 그리기
  for (const m of data.marriages) {
    const A = positions.get(m.a); const B = positions.get(m.b);
    if (!A || !B) continue;
    drawMarriageLine(svg, A, B, m.status);
  }

  // 5) 부모-자녀선 그리기
  for (const ps of data.parentships) {
    drawParentChildLines(svg, ps, positions, peopleById);
  }

  // 6) 사람 노드 그리기
  for (const p of peopleById.values()) {
    const pos = positions.get(p.id);
    if (!pos) continue;
    drawPerson(svg, p, pos, p.id === data.client_id);
  }
}

// ─── 세대 산출 ────────────────────────────────────────────────
function assignGenerations(peopleById, parentships, clientId) {
  // 명시값 우선
  for (const p of peopleById.values()) {
    if (typeof p.gen === 'number') p._gen = p.gen;
  }
  if ([...peopleById.values()].every(p => typeof p._gen === 'number')) return;

  // BFS: 클라이언트를 0으로 두고 부모=-1, 자녀=+1 propagate, 마지막에 normalize
  if (!peopleById.get(clientId)._gen) peopleById.get(clientId)._gen = 0;

  let changed = true;
  while (changed) {
    changed = false;
    for (const ps of parentships) {
      const childGens = ps.children.map(id => peopleById.get(id)?._gen).filter(g => g !== undefined);
      const parentGens = ps.parents.map(id => peopleById.get(id)?._gen).filter(g => g !== undefined);
      if (childGens.length && parentGens.length === 0) {
        const g = Math.min(...childGens) - 1;
        for (const pid of ps.parents) {
          if (peopleById.get(pid) && peopleById.get(pid)._gen === undefined) {
            peopleById.get(pid)._gen = g; changed = true;
          }
        }
      }
      if (parentGens.length && childGens.length === 0) {
        const g = Math.max(...parentGens) + 1;
        for (const cid of ps.children) {
          if (peopleById.get(cid) && peopleById.get(cid)._gen === undefined) {
            peopleById.get(cid)._gen = g; changed = true;
          }
        }
      }
    }
  }

  // 배우자도 같은 세대로
  // (marriages는 layout에서 처리되지만 세대값이 없으면 보정)
  const minGen = Math.min(...[...peopleById.values()].map(p => p._gen ?? 0));
  for (const p of peopleById.values()) {
    if (p._gen === undefined) p._gen = 0;
    p._gen -= minGen;
  }
}

function groupByGen(peopleById) {
  const out = new Map();
  for (const p of peopleById.values()) {
    const g = p._gen;
    if (!out.has(g)) out.set(g, []);
    out.get(g).push(p);
  }
  return out;
}

function buildCouples(marriages, peopleById) {
  return marriages
    .filter(m => peopleById.has(m.a) && peopleById.has(m.b))
    .map((m, i) => ({ id: `c${i}`, a: m.a, b: m.b, status: m.status || 'married' }));
}

// ─── 레이아웃 ────────────────────────────────────────────────
function layoutGenerations(generations, parentships, couples, peopleById) {
  const positions = new Map();
  const gens = [...generations.keys()].sort((a, b) => a - b);

  // 각 세대별로 "단위(unit)" 리스트를 만든다. 단위는 (1) 부부, (2) 솔로
  // 같은 부모를 가진 형제는 인접 배치하기 위해 정렬
  for (const g of gens) {
    const peopleInGen = generations.get(g).slice();
    // 정렬 키: (부모 parentship index) → (출생순 = age desc)
    const parentOf = (id) => parentships.findIndex(ps => ps.children.includes(id));
    peopleInGen.sort((p, q) => {
      const pp = parentOf(p.id), qp = parentOf(q.id);
      if (pp !== qp) return pp - qp;
      return (q.age || 0) - (p.age || 0); // 손위 형제 좌측
    });

    // 단위 묶기: 솔로/부부
    const usedSpouseOf = new Set();
    const units = [];
    for (const p of peopleInGen) {
      if (usedSpouseOf.has(p.id)) continue;
      const spouseEdge = couples.find(c => (c.a === p.id || c.b === p.id) &&
                                            generations.get(g).some(q => q.id === (c.a === p.id ? c.b : c.a)));
      if (spouseEdge) {
        const spouseId = spouseEdge.a === p.id ? spouseEdge.b : spouseEdge.a;
        // 남자 좌측 / 여자 우측 표준
        const left = p.sex === 'M' ? p : peopleById.get(spouseId);
        const right = p.sex === 'M' ? peopleById.get(spouseId) : p;
        units.push({ kind: 'couple', left, right, status: spouseEdge.status });
        usedSpouseOf.add(spouseId);
      } else {
        units.push({ kind: 'solo', person: p });
      }
    }

    // x 좌표 배치
    let x = PAD;
    const y = PAD + g * (NODE_H + ROW_GAP);
    for (const u of units) {
      if (u.kind === 'couple') {
        positions.set(u.left.id, { x, y, person: u.left });
        positions.set(u.right.id, { x: x + NODE_W + COUPLE_GAP, y, person: u.right });
        x += NODE_W * 2 + COUPLE_GAP + COL_GAP;
      } else {
        positions.set(u.person.id, { x, y, person: u.person });
        x += NODE_W + COL_GAP;
      }
    }
  }

  // 자녀가 부모 쌍 중앙으로 가도록 후처리: 각 parentship에 대해 자녀 그룹 중심을 부모 중심에 맞춰 시프트
  for (const ps of parentships) {
    const parents = ps.parents.map(id => positions.get(id)).filter(Boolean);
    const children = ps.children.map(id => positions.get(id)).filter(Boolean);
    if (parents.length === 0 || children.length === 0) continue;
    const parentCenter = (Math.min(...parents.map(p => p.x)) + Math.max(...parents.map(p => p.x)) + NODE_W) / 2;
    const childMin = Math.min(...children.map(c => c.x));
    const childMax = Math.max(...children.map(c => c.x)) + NODE_W;
    const childCenter = (childMin + childMax) / 2;
    const dx = parentCenter - childCenter;
    if (Math.abs(dx) > 1) {
      // 자녀 + 자녀의 배우자만 이동 (다른 가계 영향 회피)
      const moved = new Set();
      for (const c of children) {
        c.x += dx; moved.add(c.person.id);
        const couple = couples.find(cp => cp.a === c.person.id || cp.b === c.person.id);
        if (couple) {
          const spouseId = couple.a === c.person.id ? couple.b : couple.a;
          const sp = positions.get(spouseId);
          if (sp && !moved.has(spouseId)) { sp.x += dx; moved.add(spouseId); }
        }
      }
    }
  }

  // 충돌 해소: 같은 세대 안에서 부부=묶음, 솔로=단독 그룹으로 묶고
  // 좌→우 패스로 그룹간 최소 간격(COL_GAP) 보장. 부부는 묶음 시프트로 결혼선 길이 유지.
  for (const g of gens) {
    const peopleInG = generations.get(g);
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
      ids,
      ps: ids.map(id => positions.get(id)).filter(Boolean),
    }));
    const leftX = (g) => Math.min(...g.ps.map(p => p.x));
    const rightX = (g) => Math.max(...g.ps.map(p => p.x)) + NODE_W;
    groups.sort((a, b) => leftX(a) - leftX(b));
    for (let i = 1; i < groups.length; i++) {
      const minLeft = rightX(groups[i - 1]) + COL_GAP;
      const cur = leftX(groups[i]);
      if (cur < minLeft) {
        const dx = minLeft - cur;
        groups[i].ps.forEach(p => { p.x += dx; });
      }
    }
  }

  // 음수 좌표 보정
  const minX = Math.min(...[...positions.values()].map(p => p.x));
  if (minX < PAD) {
    const shift = PAD - minX;
    for (const v of positions.values()) v.x += shift;
  }

  return positions;
}

// ─── 그리기 ────────────────────────────────────────────────
function drawPerson(svg, p, pos, isClient) {
  const cx = pos.x + NODE_W / 2;
  const cy = pos.y + NODE_H / 2;
  const isMissing = (p.missing_fields && p.missing_fields.length) || p.age == null;
  const stroke = isClient ? '#1565C0' : '#333';
  const fill = isClient ? '#E3F2FD' : '#fff';
  const strokeW = isClient ? 4 : 2;
  const dash = isMissing ? '4 4' : null;
  const opacity = isMissing && !isClient ? 0.55 : 1;

  let shape;
  if (p.sex === 'M') {
    shape = el('rect', { x: pos.x, y: pos.y, width: NODE_W, height: NODE_H,
      fill, stroke, 'stroke-width': strokeW, ...(dash && { 'stroke-dasharray': dash }), opacity });
  } else if (p.sex === 'F') {
    shape = el('circle', { cx, cy, r: NODE_W / 2, fill, stroke, 'stroke-width': strokeW,
      ...(dash && { 'stroke-dasharray': dash }), opacity });
  } else {
    // 알 수 없음 = 마름모
    const half = NODE_W / 2;
    shape = el('polygon', { points: `${cx},${pos.y} ${pos.x + NODE_W},${cy} ${cx},${pos.y + NODE_H} ${pos.x},${cy}`,
      fill, stroke, 'stroke-width': strokeW, ...(dash && { 'stroke-dasharray': dash }), opacity });
  }
  svg.appendChild(shape);

  // 사망 표시 (X)
  if (p.alive === false) {
    svg.appendChild(el('line', { x1: pos.x, y1: pos.y, x2: pos.x + NODE_W, y2: pos.y + NODE_H,
      stroke: '#333', 'stroke-width': 2 }));
    svg.appendChild(el('line', { x1: pos.x + NODE_W, y1: pos.y, x2: pos.x, y2: pos.y + NODE_H,
      stroke: '#333', 'stroke-width': 2 }));
  }

  // 나이/이름 라벨
  const ageStr = p.age != null ? String(p.age) : '?';
  const labelColor = isClient ? '#1565C0' : (isMissing ? '#888' : '#222');
  svg.appendChild(text(cx, cy + 5, ageStr, { 'font-size': 18, 'font-weight': 700,
    'text-anchor': 'middle', fill: labelColor }));
  svg.appendChild(text(cx, pos.y + NODE_H + 16, p.name || '', { 'font-size': 11,
    'text-anchor': 'middle', fill: labelColor }));
  if (p.occupation) {
    svg.appendChild(text(cx, pos.y + NODE_H + 30, p.occupation, { 'font-size': 9,
      'text-anchor': 'middle', fill: '#666' }));
  }

  // 누락 배지
  if (isMissing) {
    const bx = pos.x + NODE_W - 6, by = pos.y - 6;
    svg.appendChild(el('circle', { cx: bx, cy: by, r: 9, fill: '#FFC107', stroke: '#fff', 'stroke-width': 2 }));
    svg.appendChild(text(bx, by + 4, '?', { 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle', fill: '#fff' }));
  }

  // 호버 툴팁
  const titleEl = el('title', {});
  titleEl.textContent = describePerson(p);
  shape.appendChild(titleEl);
}

function drawMarriageLine(svg, A, B, status) {
  const y = A.y + NODE_H / 2;
  const x1 = Math.min(A.x, B.x) + NODE_W;
  const x2 = Math.max(A.x, B.x);
  const dash = status === 'divorced' ? '8 4' : status === 'separated' ? '4 4' : null;
  svg.appendChild(el('line', { x1, y1: y, x2, y2: y, stroke: '#333', 'stroke-width': 2,
    ...(dash && { 'stroke-dasharray': dash }) }));
  // 이혼은 대각선 슬래시 두 개로 표시
  if (status === 'divorced') {
    const mx = (x1 + x2) / 2;
    svg.appendChild(el('line', { x1: mx - 6, y1: y - 8, x2: mx - 2, y2: y + 8, stroke: '#c00', 'stroke-width': 2 }));
    svg.appendChild(el('line', { x1: mx + 2, y1: y - 8, x2: mx + 6, y2: y + 8, stroke: '#c00', 'stroke-width': 2 }));
  }
}

function drawParentChildLines(svg, ps, positions, peopleById) {
  const parents = ps.parents.map(id => positions.get(id)).filter(Boolean);
  const children = ps.children.map(id => positions.get(id)).filter(Boolean);
  if (parents.length === 0 || children.length === 0) return;

  // 부모 쌍 중앙(결혼선 중간)에서 아래로 내려서 자녀 위쪽 가로 라인으로 분기
  let busX;
  if (parents.length === 2) {
    busX = (Math.min(parents[0].x, parents[1].x) + NODE_W + Math.max(parents[0].x, parents[1].x)) / 2;
  } else {
    busX = parents[0].x + NODE_W / 2;
  }
  const busTopY = parents[0].y + NODE_H / 2; // 결혼선 높이
  const childTopY = children[0].y;
  const busY = (busTopY + childTopY) / 2;

  // 부모 → 버스
  svg.appendChild(el('line', { x1: busX, y1: busTopY, x2: busX, y2: busY, stroke: '#333', 'stroke-width': 1.5 }));

  // 자녀 가로 버스
  const minX = Math.min(...children.map(c => c.x + NODE_W / 2));
  const maxX = Math.max(...children.map(c => c.x + NODE_W / 2));
  svg.appendChild(el('line', { x1: minX, y1: busY, x2: maxX, y2: busY, stroke: '#333', 'stroke-width': 1.5 }));

  // 각 자녀 → 버스
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
  if (p.missing_fields && p.missing_fields.length) {
    parts.push(`\n누락: ${p.missing_fields.join(', ')}`);
  }
  return parts.join(' · ');
}

// ─── SVG helpers ────────────────────────────────────────────────
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
