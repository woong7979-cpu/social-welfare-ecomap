// 생태도 SVG 렌더러
// 입력: { household, ecomap_systems, people, client_id }
// - 중앙 점선원 안에 가구원(가계도와 동일 심볼) 배치
// - 외부 체계는 방사형으로 균등 각도 배치
// - 라인:
//     positive  → 실선
//     uncertain → 점선
//     tense     → 톱니선(╫╫╫)
// - 굵기 = strength (1/2/3)
// - 화살표: out=가구→체계, in=체계→가구, bi=양방향
// - 표준 카테고리 중 비어있는 것은 회색 빈 노드(점선)로 외곽에 배치 → 보강 필요 시그널

const STANDARD_CATEGORIES = ['직업', '교육', '종교', '의료', '이웃', '친구', '여가', '학습'];

const HOUSEHOLD_R = 110;     // 중앙 점선원 반지름
const SYSTEM_R = 280;        // 시스템 노드 배치 반지름
const SYSTEM_NODE_R = 38;    // 시스템 노드 반지름
const HOUSEHOLD_NODE = 50;   // 가구원 미니 노드 한 변
const CANVAS_W = 820;
const CANVAS_H = 720;

export function renderEcomap(svg, data) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // 화살표 마커 정의
  defineMarkers(svg);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // 1) 중앙 점선원 (가족 경계)
  svg.appendChild(el('circle', {
    cx, cy, r: HOUSEHOLD_R,
    fill: '#FAFAFA', stroke: '#888', 'stroke-width': 2, 'stroke-dasharray': '6 5',
  }));

  // 2) 가구원 배치 (중앙 원 안에 미니 가계도 — 부부 관계 + 부모-자녀 라인 포함)
  const householdPeople = (data.household || []).map(id =>
    (data.people || []).find(p => p.id === id)).filter(Boolean);
  const marriages = data.marriages || [];
  const parentships = data.parentships || [];
  const hhPositions = layoutHousehold(householdPeople, cx, cy, marriages, parentships);

  // 2-a) 가구원 간 결혼선 + 부모-자녀선 먼저 그리기 (노드 아래 깔리도록)
  drawHouseholdFamilyLines(svg, hhPositions, marriages, parentships);

  // 2-b) 가구원 노드
  for (const { person, x, y } of hhPositions) {
    drawHouseholdPerson(svg, person, x, y, person.id === data.client_id);
  }

  // 3) 실제 입력된 시스템 노드만 렌더 (없는 카테고리는 보강 가이드 패널이 담당)
  const systems = (data.ecomap_systems || []).slice();

  // 균등 각도 배치 (-π/2 부터 시계 방향)
  const N = systems.length;
  systems.forEach((sys, i) => {
    const theta = -Math.PI / 2 + (i / N) * 2 * Math.PI;
    sys._x = cx + Math.cos(theta) * SYSTEM_R;
    sys._y = cy + Math.sin(theta) * SYSTEM_R;
  });

  // 4) 라인 먼저(노드 아래로 깔리도록)
  for (const sys of systems) {
    const targets = (sys.linked_to && sys.linked_to.length)
      ? sys.linked_to.map(id => hhPositions.find(h => h.person.id === id)).filter(Boolean)
      : [{ x: cx, y: cy, person: null }]; // 가구 전체 중앙
    for (const t of targets) {
      drawRelation(svg, t.x, t.y, sys._x, sys._y, sys);
    }
  }

  // 5) 시스템 노드
  for (const sys of systems) {
    drawSystemNode(svg, sys);
  }
}

// ─── 마커 정의 ────────────────────────────────────────────────
function defineMarkers(svg) {
  const defs = el('defs', {});
  defs.innerHTML = `
    <marker id="arrow-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#444"/>
    </marker>
    <marker id="arrow-in" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M10,0 L0,5 L10,10 z" fill="#444"/>
    </marker>
  `;
  svg.appendChild(defs);
}

// ─── 가구원 레이아웃 — 부모/자녀 2단 배치(가능 시) ────────────────────
// 가구 안에서 parentships로 부모-자녀가 있으면 부모는 윗줄, 자녀는 아랫줄.
// 부부는 인접하게 배치하여 결혼선이 짧게 그려짐.
function layoutHousehold(people, cx, cy, marriages, parentships) {
  if (people.length === 0) return [];
  const spacing = 14;
  const householdSet = new Set(people.map(p => p.id));

  // 가구 내부에서 자녀로 등장하는 사람 식별
  const childrenIds = new Set();
  for (const ps of parentships) {
    const hasParentInHH = (ps.parents || []).some(id => householdSet.has(id));
    if (!hasParentInHH) continue;
    for (const cid of (ps.children || [])) {
      if (householdSet.has(cid)) childrenIds.add(cid);
    }
  }

  // 부모행과 자녀행 분리
  const parentRow = people.filter(p => !childrenIds.has(p.id));
  const childRow = people.filter(p => childrenIds.has(p.id));

  // 부모 정렬: 부부면 인접(M 좌, F 우)
  const parentRowSorted = sortCoupleAdjacent(parentRow, marriages);
  // 자녀 정렬: 나이 desc(손위 좌측)
  const childRowSorted = childRow.slice().sort((a, b) => (b.age || 0) - (a.age || 0));

  const positions = [];
  if (childRowSorted.length === 0) {
    // 단일 세대 가구
    layRow(parentRowSorted, cx, cy, spacing).forEach(p => positions.push(p));
  } else {
    // 2단 가구 (부모 위, 자녀 아래)
    const offset = HOUSEHOLD_NODE / 2 + 18;
    layRow(parentRowSorted, cx, cy - offset, spacing).forEach(p => positions.push(p));
    layRow(childRowSorted, cx, cy + offset, spacing).forEach(p => positions.push(p));
  }
  return positions;
}

function layRow(rowPeople, cx, y, spacing) {
  if (rowPeople.length === 0) return [];
  const total = rowPeople.length * HOUSEHOLD_NODE + (rowPeople.length - 1) * spacing;
  let x = cx - total / 2;
  return rowPeople.map(p => {
    const out = { person: p, x: x + HOUSEHOLD_NODE / 2, y };
    x += HOUSEHOLD_NODE + spacing;
    return out;
  });
}

function sortCoupleAdjacent(rowPeople, marriages) {
  const idSet = new Set(rowPeople.map(p => p.id));
  const used = new Set();
  const ordered = [];
  for (const p of rowPeople) {
    if (used.has(p.id)) continue;
    const m = marriages.find(mm => (mm.a === p.id || mm.b === p.id) &&
      idSet.has(mm.a === p.id ? mm.b : mm.a));
    if (m) {
      const spouseId = m.a === p.id ? m.b : m.a;
      const spouse = rowPeople.find(q => q.id === spouseId);
      const left = p.sex === 'M' ? p : (spouse.sex === 'M' ? spouse : p);
      const right = left === p ? spouse : p;
      ordered.push(left, right);
      used.add(p.id); used.add(spouseId);
    } else {
      ordered.push(p);
      used.add(p.id);
    }
  }
  return ordered;
}

// ─── 가구원 간 가계 라인 (결혼선 + 부모-자녀선) ──────────────────────
function drawHouseholdFamilyLines(svg, positions, marriages, parentships) {
  const posMap = new Map(positions.map(p => [p.person.id, p]));

  // 1) 결혼선 (같은 행에 있는 부부)
  for (const m of marriages) {
    const A = posMap.get(m.a);
    const B = posMap.get(m.b);
    if (!A || !B) continue;
    if (Math.abs(A.y - B.y) > 2) continue; // 다른 행이면 결혼선 그리지 않음
    const half = HOUSEHOLD_NODE / 2;
    const y = A.y;
    const x1 = Math.min(A.x, B.x) + half - 2; // 노드 안쪽 살짝
    const x2 = Math.max(A.x, B.x) - half + 2;
    if (x2 <= x1) continue;
    const isCohabit = m.status === 'cohabit' || m.status === 'partner';
    const isDivorced = m.status === 'divorced';
    svg.appendChild(el('line', {
      x1, y1: y, x2, y2: y, stroke: '#333', 'stroke-width': 2,
      'stroke-linecap': 'round',
      ...(isCohabit && { 'stroke-dasharray': '5 3' }),
    }));
    if (isDivorced) {
      const mx = (x1 + x2) / 2;
      svg.appendChild(el('line', { x1: mx - 5, y1: y - 6, x2: mx, y2: y + 6, stroke: '#c00', 'stroke-width': 2 }));
      svg.appendChild(el('line', { x1: mx + 1, y1: y - 6, x2: mx + 6, y2: y + 6, stroke: '#c00', 'stroke-width': 2 }));
    }
  }

  // 2) 부모-자녀선 (가구 내부에서 부모 모두 + 자녀 모두 있는 parentship에 한함)
  for (const ps of parentships) {
    const parentPos = (ps.parents || []).map(id => posMap.get(id)).filter(Boolean);
    const childPos = (ps.children || []).map(id => posMap.get(id)).filter(Boolean);
    if (parentPos.length === 0 || childPos.length === 0) continue;
    if (parentPos[0].y >= childPos[0].y) continue; // 부모가 자녀 위에 있을 때만

    // 부모 중심 X
    let busX;
    if (parentPos.length === 2) {
      busX = (parentPos[0].x + parentPos[1].x) / 2;
    } else {
      busX = parentPos[0].x;
    }
    const busTopY = parentPos[0].y + HOUSEHOLD_NODE / 2 - 2;
    const childTopY = childPos[0].y - HOUSEHOLD_NODE / 2 + 2;
    const busY = (busTopY + childTopY) / 2;

    // 부모 → bus 수직선
    svg.appendChild(el('line', { x1: busX, y1: busTopY, x2: busX, y2: busY, stroke: '#555', 'stroke-width': 1.4 }));

    // 자녀 가로 bus (busX 포함)
    const childCxs = childPos.map(c => c.x);
    const minCx = Math.min(...childCxs, busX);
    const maxCx = Math.max(...childCxs, busX);
    if (maxCx > minCx) {
      svg.appendChild(el('line', { x1: minCx, y1: busY, x2: maxCx, y2: busY, stroke: '#555', 'stroke-width': 1.4 }));
    }
    // bus → 각 자녀 수직선
    for (const c of childPos) {
      svg.appendChild(el('line', { x1: c.x, y1: busY, x2: c.x, y2: c.y - HOUSEHOLD_NODE / 2 + 2, stroke: '#555', 'stroke-width': 1.4 }));
    }
  }
}

function drawHouseholdPerson(svg, p, cx, cy, isClient) {
  const half = HOUSEHOLD_NODE / 2;
  const stroke = isClient ? '#1565C0' : '#333';
  const fill = isClient ? '#E3F2FD' : '#fff';
  const sw = isClient ? 3 : 2;

  let shape;
  if (p.sex === 'M') {
    shape = el('rect', { x: cx - half, y: cy - half, width: HOUSEHOLD_NODE, height: HOUSEHOLD_NODE,
      fill, stroke, 'stroke-width': sw });
  } else if (p.sex === 'F') {
    shape = el('circle', { cx, cy, r: half, fill, stroke, 'stroke-width': sw });
  } else {
    shape = el('polygon', { points: `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`,
      fill, stroke, 'stroke-width': sw });
  }
  svg.appendChild(shape);

  if (p.alive === false) {
    svg.appendChild(el('line', { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half, stroke: '#333', 'stroke-width': 2 }));
    svg.appendChild(el('line', { x1: cx + half, y1: cy - half, x2: cx - half, y2: cy + half, stroke: '#333', 'stroke-width': 2 }));
  }

  const labelColor = isClient ? '#1565C0' : '#222';
  svg.appendChild(text(cx, cy + 4, p.age != null ? String(p.age) : '?',
    { 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', fill: labelColor }));
  svg.appendChild(text(cx, cy + half + 14, p.name || '',
    { 'font-size': 10, 'text-anchor': 'middle', fill: labelColor }));

  const titleEl = el('title', {}); titleEl.textContent = `${p.name || p.id} (${p.age ?? '?'}세)`;
  shape.appendChild(titleEl);
}

// ─── 시스템 노드 ────────────────────────────────────────────────
function drawSystemNode(svg, sys) {
  const isMissing = sys._missing;
  const fill = isMissing ? '#F5F5F5' : '#FFF8E1';
  const stroke = isMissing ? '#BDBDBD' : '#FFB300';
  const dash = isMissing ? '5 4' : null;
  const sw = isMissing ? 1.5 : 2;

  const c = el('circle', {
    cx: sys._x, cy: sys._y, r: SYSTEM_NODE_R,
    fill, stroke, 'stroke-width': sw, ...(dash && { 'stroke-dasharray': dash }),
  });
  svg.appendChild(c);

  // 라벨 (줄바꿈 처리)
  const lines = String(sys.label || sys.category || '').split('\n');
  const lineH = 12;
  const startY = sys._y - ((lines.length - 1) * lineH) / 2 + 3;
  lines.forEach((ln, i) => {
    svg.appendChild(text(sys._x, startY + i * lineH, ln, {
      'font-size': 11, 'text-anchor': 'middle',
      fill: isMissing ? '#888' : '#333', 'font-weight': isMissing ? 400 : 600,
    }));
  });

  // 카테고리 배지
  if (!isMissing && sys.category) {
    svg.appendChild(text(sys._x, sys._y + SYSTEM_NODE_R + 12, `[${sys.category}]`, {
      'font-size': 9, 'text-anchor': 'middle', fill: '#999',
    }));
  } else if (isMissing) {
    svg.appendChild(text(sys._x, sys._y + SYSTEM_NODE_R + 12, '🔍 보강 필요', {
      'font-size': 9, 'text-anchor': 'middle', fill: '#FFA000', 'font-weight': 700,
    }));
  }

  const titleEl = el('title', {});
  titleEl.textContent = `${sys.label || sys.category}${isMissing ? ' (인터뷰 미수집)' : ` · ${sys.tone}`}`;
  c.appendChild(titleEl);
}

// ─── 관계선 ────────────────────────────────────────────────
function drawRelation(svg, x1, y1, x2, y2, sys) {
  // 시스템 노드 가장자리에서 멈추도록 단축
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const ux = dx / dist, uy = dy / dist;
  const startOffset = 30; // 가구원 노드 가장자리에서 시작
  const endOffset = SYSTEM_NODE_R + 2;
  const sx = x1 + ux * startOffset;
  const sy = y1 + uy * startOffset;
  const ex = x2 - ux * endOffset;
  const ey = y2 - uy * endOffset;

  const sw = sys._missing ? 1 : Math.max(1, sys.strength || 2);
  const color = sys._missing ? '#BDBDBD' : '#444';

  let lineEl;
  if (sys.tone === 'tense') {
    // 톱니선: path를 작은 ╫ 패턴으로 그려서 따라가는 효과
    lineEl = drawSawtooth(sx, sy, ex, ey, color, sw);
  } else {
    const dash = sys.tone === 'uncertain' || sys._missing ? '6 4' : null;
    lineEl = el('line', {
      x1: sx, y1: sy, x2: ex, y2: ey,
      stroke: color, 'stroke-width': sw,
      ...(dash && { 'stroke-dasharray': dash }),
    });
  }

  // 화살표
  if (!sys._missing) {
    if (sys.direction === 'out' || sys.direction === 'bi') lineEl.setAttribute('marker-end', 'url(#arrow-out)');
    if (sys.direction === 'in' || sys.direction === 'bi') lineEl.setAttribute('marker-start', 'url(#arrow-in)');
  }
  svg.appendChild(lineEl);
}

function drawSawtooth(x1, y1, x2, y2, color, sw) {
  // 선 따라 진행하면서 짧은 수직 가시(║)를 7~8 px 간격으로 찍는 path
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': sw });
  const ux = dx / len, uy = dy / len;
  // 수직 단위 벡터
  const nx = -uy, ny = ux;
  const step = 7;
  const tickHalf = 5;

  let d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} `;
  for (let s = step; s < len - 2; s += step) {
    const px = x1 + ux * s, py = y1 + uy * s;
    const ax = px + nx * tickHalf, ay = py + ny * tickHalf;
    const bx = px - nx * tickHalf, by = py - ny * tickHalf;
    d += `M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${bx.toFixed(2)} ${by.toFixed(2)} `;
  }
  return el('path', { d, stroke: color, 'stroke-width': sw, fill: 'none' });
}

// ─── helpers ────────────────────────────────────────────────
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

export { STANDARD_CATEGORIES };
