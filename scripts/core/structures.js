/* ============================================================
   지질의 화학 구조식 (LEVEL 2)
   - 모두 SVG 로 직접 그린다 (이미지 파일 없음)
   - PC/PE/PS/PI/PIP2/SM 은 특정 분자 하나가 아니라
     지방산 사슬이 달라질 수 있는 "class 수준의 일반화 구조"로 그린다.
     그래서 acyl chain 은 R₁ / R₂ 로 표기한다.
   - 색은 3D 모델에서 쓴 부위별 색과 대응시킨 학습용 구분이며
     화학적 표준 색이 아니다.
   ============================================================ */

import { LIPID_BY_ID } from "./lipids.js";

/* 3D 모델의 부위별 색에 대응하되, 흰 배경에서 읽히도록 조금 진하게 */
export const PART = {
  head: "#4b7fb5", // 지질 종류마다 실제 색으로 덮어씀
  phosphate: "#c05a2f",
  backbone: "#5f6b73",
  chain: "#8a939a",
  bond: "#39444d",
  text: "#1f2933",
  faint: "#9aa4ac",
};

const hex = (n) => "#" + n.toString(16).padStart(6, "0");

/* ---------- 작은 SVG 헬퍼 ---------- */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function line(x1, y1, x2, y2, color = PART.bond, w = 2.2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** 이중결합: 주 선과 평행선 하나 */
function dbl(x1, y1, x2, y2, color = PART.bond, gap = 5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * gap;
  const ny = (dx / len) * gap;
  const shrink = 0.14;
  const sx = x1 + dx * shrink;
  const sy = y1 + dy * shrink;
  const ex = x2 - dx * shrink;
  const ey = y2 - dy * shrink;
  return (
    line(x1, y1, x2, y2, color) +
    line(sx + nx, sy + ny, ex + nx, ey + ny, color, 2)
  );
}

function text(x, y, s, opts = {}) {
  const anchor = opts.anchor || "middle";
  const size = opts.size || 17;
  const color = opts.color || PART.text;
  const weight = opts.weight || 600;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}" dominant-baseline="middle">${esc(
    s
  )}</text>`;
}

/** 색이 있는 둥근 라벨 칩 (부위 구분용) */
function chip(x, y, w, h, label, color, opts = {}) {
  const r = opts.r || 10;
  const size = opts.size || 16;
  return (
    `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${r}" fill="${color}" fill-opacity="0.13" stroke="${color}" stroke-width="2"/>` +
    text(x, y, label, { size, color: PART.text, weight: 700 })
  );
}

function caption(x, y, s, color) {
  return text(x, y, s, { size: 13, color: color || PART.faint, weight: 700 });
}

/** 한 변 위에 정다각형을 세운다 (콜레스테롤 D 고리용) */
function polygonOnEdge(p1, p2, n, awayFrom) {
  const s = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const apothem = s / (2 * Math.tan(Math.PI / n));
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const dx = (p2[0] - p1[0]) / s;
  const dy = (p2[1] - p1[1]) / s;
  // 기준점(고리 중심)의 반대쪽으로 세운다
  let nx = dy;
  let ny = -dx;
  if (awayFrom && (mx + nx - awayFrom[0]) ** 2 + (my + ny - awayFrom[1]) ** 2 <
      (mx - nx - awayFrom[0]) ** 2 + (my - ny - awayFrom[1]) ** 2) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + apothem * nx;
  const cy = my + apothem * ny;
  const start = Math.atan2(p1[1] - cy, p1[0] - cx);
  const R = Math.hypot(p1[0] - cx, p1[1] - cy);
  // p1 -> p2 방향이 시계/반시계인지 맞춘다
  const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
  let step = a2 - start;
  while (step > Math.PI) step -= 2 * Math.PI;
  while (step < -Math.PI) step += 2 * Math.PI;
  const dir = Math.sign(step);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = start + dir * ((2 * Math.PI) / n) * i;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return pts;
}

/**
 * 좌·우가 수직변인 육각형 (스테로이드 고리를 가로로 나란히 붙이기 위한 방향).
 * p0 오른쪽아래 · p1 아래 · p2 왼쪽아래 · p3 왼쪽위 · p4 위 · p5 오른쪽위
 */
function hexVerts(cx, cy, r) {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (Math.PI / 3) * k;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}

function ringPath(pts, color = PART.bond, w = 2.2) {
  let s = "";
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += line(a[0], a[1], b[0], b[1], color, w);
  }
  return s;
}

/* ============================================================
   글리세로인지질 공통 골격 (PC · PE · PS · PI · PIP2)

              [머리 그룹]
                   |
                   O
                   |
             ⁻O — P = O
                   |
                   O
                   |
     sn-3        H₂C
                   |
     sn-2         HC — O — C(=O) — R₂
                   |
     sn-1        H₂C — O — C(=O) — R₁
   ============================================================ */

const CORE = {
  x: 262,
  oTop: 150, // 머리와 P 를 잇는 산소
  p: 212,
  oBottom: 274,
  c3: 330,
  c2: 396,
  c1: 462,
};

function glyceroCore(headColor) {
  const X = CORE.x;
  let s = "";

  // 인산기
  s += line(X, CORE.oTop + 14, X, CORE.p - 16, PART.phosphate);
  s += text(X, CORE.oTop, "O", { color: PART.phosphate, size: 18 });
  s += text(X, CORE.p, "P", { color: PART.phosphate, size: 21, weight: 800 });
  s += line(X - 16, CORE.p, X - 44, CORE.p, PART.phosphate);
  s += text(X - 62, CORE.p, "O⁻", { color: PART.phosphate, size: 18 });
  s += dbl(X + 16, CORE.p, X + 46, CORE.p, PART.phosphate, 4);
  s += text(X + 64, CORE.p, "O", { color: PART.phosphate, size: 18 });
  s += line(X, CORE.p + 16, X, CORE.oBottom - 14, PART.phosphate);
  s += text(X, CORE.oBottom, "O", { color: PART.phosphate, size: 18 });
  s += caption(X + 128, CORE.p, "인산 다리", PART.phosphate);

  // 글리세롤 골격
  s += line(X, CORE.oBottom + 14, X, CORE.c3 - 16, PART.backbone);
  s += text(X, CORE.c3, "H₂C", { color: PART.backbone, size: 18 });
  s += line(X, CORE.c3 + 16, X, CORE.c2 - 16, PART.backbone);
  s += text(X, CORE.c2, "HC", { color: PART.backbone, size: 18 });
  s += line(X, CORE.c2 + 16, X, CORE.c1 - 16, PART.backbone);
  s += text(X, CORE.c1, "H₂C", { color: PART.backbone, size: 18 });
  s += caption(X - 86, CORE.c2, "글리세롤 골격", PART.backbone);
  s += caption(X - 86, CORE.c2 + 20, "(sn-1 · 2 · 3)", PART.backbone);

  // 에스터 결합 2개 + R₁ / R₂
  s += ester(X, CORE.c2, "R₂", "sn-2");
  s += ester(X, CORE.c1, "R₁", "sn-1");
  return s;
}

/** 글리세롤 탄소에서 오른쪽으로 뻗는 에스터 결합 */
function ester(x, y, label, sn) {
  const oX = x + 62;
  const cX = x + 132;
  const rX = x + 226;
  let s = "";
  s += line(x + 26, y, oX - 14, y, PART.chain);
  s += text(oX, y, "O", { color: PART.chain, size: 17 });
  s += line(oX + 14, y, cX - 14, y, PART.chain);
  s += text(cX, y, "C", { color: PART.chain, size: 18 });
  s += dbl(cX, y - 14, cX, y - 42, PART.chain, 4);
  s += text(cX, y - 56, "O", { color: PART.chain, size: 17 });
  s += line(cX + 14, y, rX - 34, y, PART.chain);
  s += chip(rX, y, 66, 40, label, PART.chain);
  s += caption(x + 97, y + 30, "에스터", PART.chain);
  s += caption(x - 44, y, sn, PART.faint);
  return s;
}

/* ---------- 머리 그룹들 ---------- */

function headChip(label, sub, color, y = 76) {
  const X = CORE.x;
  const w = Math.max(230, label.length * 13 + 60);
  return (
    line(X, y + 26, X, CORE.oTop - 14, color) +
    chip(X, y, w, 46, label, color, { size: 17 }) +
    caption(X, y - 38, sub, color)
  );
}

/** myo-이노시톨 고리. phos = 인산이 붙는 탄소 번호 배열 */
function inositol(color, phos) {
  const cx = CORE.x;
  const cy = 96;
  const r = 52;
  // 1번 탄소를 아래쪽에 두고 시계 반대 방향으로 번호를 매긴다
  const v = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3; // 1번이 아래(+y)
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let s = ringPath(v, color, 2.4);
  s += line(cx, cy + r + 2, cx, CORE.oTop - 14, color);

  const dirs = v.map((p) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const L = Math.hypot(dx, dy);
    return [dx / L, dy / L];
  });

  for (let i = 0; i < 6; i++) {
    const n = i + 1;
    const [ux, uy] = dirs[i];
    const px = v[i][0];
    const py = v[i][1];
    // 번호
    s += text(px - ux * 17, py - uy * 17, String(n), {
      size: 12,
      color: PART.faint,
      weight: 700,
    });
    if (n === 1) continue; // 1번은 아래 인산 다리로 연결
    const isP = phos.includes(n);
    const c = isP ? PART.phosphate : color;
    const outX = px + ux * 30;
    const outY = py + uy * 30;
    s += line(px + ux * 8, py + uy * 8, outX - ux * 6, outY - uy * 6, c);
    s += text(outX + ux * 22, outY + uy * 12, isP ? "OPO₃²⁻" : "OH", {
      size: isP ? 14 : 15,
      color: c,
      weight: 700,
    });
  }
  s += caption(cx - r - 92, cy, "myo-이노시톨 고리", color);
  return s;
}

/* ---------- 지질별 구조식 ---------- */

function svg(viewBox, inner) {
  return `<svg class="structure-svg" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;
}

function glycerophospholipid(id, headSvg, vb) {
  const color = hex(LIPID_BY_ID[id].color);
  return svg(vb, headSvg(color) + glyceroCore(color));
}

const BUILDERS = {
  PC: () =>
    glycerophospholipid(
      "PC",
      (c) => headChip("CH₂—CH₂—N⁺(CH₃)₃", "콜린 (choline)", c),
      "0 0 620 540"
    ),

  PE: () =>
    glycerophospholipid(
      "PE",
      (c) => headChip("CH₂—CH₂—NH₃⁺", "에탄올아민 (ethanolamine)", c),
      "0 0 620 540"
    ),

  PS: () =>
    glycerophospholipid(
      "PS",
      (c) => headChip("CH₂—CH(NH₃⁺)—COO⁻", "세린 (serine)", c),
      "0 0 620 540"
    ),

  PI: () =>
    glycerophospholipid("PI", (c) => inositol(c, []), "0 -46 620 586"),

  PIP2: () =>
    glycerophospholipid("PIP2", (c) => inositol(c, [4, 5]), "0 -46 620 586"),

  /* 스핑고미엘린 — 글리세롤이 아니라 스핑고신 골격, 지방산은 아미드 결합 */
  SM: () => {
    const c = hex(LIPID_BY_ID.SM.color);
    const X = 268;
    let s = "";
    // 포스포콜린 머리
    s += chip(X, 72, 250, 46, "CH₂—CH₂—N⁺(CH₃)₃", c, { size: 17 });
    s += caption(X, 34, "포스포콜린 (PC 와 같은 머리)", c);
    s += line(X, 95, X, 122, c);
    s += text(X, 138, "O", { color: PART.phosphate, size: 18 });
    s += line(X, 152, X, 178, PART.phosphate);
    s += text(X, 194, "P", { color: PART.phosphate, size: 21, weight: 800 });
    s += line(X - 16, 194, X - 44, 194, PART.phosphate);
    s += text(X - 62, 194, "O⁻", { color: PART.phosphate, size: 18 });
    s += dbl(X + 16, 194, X + 46, 194, PART.phosphate, 4);
    s += text(X + 64, 194, "O", { color: PART.phosphate, size: 18 });
    s += line(X, 210, X, 236, PART.phosphate);
    s += text(X, 252, "O", { color: PART.phosphate, size: 18 });

    // 스핑고신 골격
    const ys = [306, 366, 426, 486, 546];
    s += line(X, 266, X, ys[0] - 16, PART.backbone);
    s += text(X, ys[0], "H₂C", { color: PART.backbone, size: 18 });
    s += line(X, ys[0] + 16, X, ys[1] - 16, PART.backbone);
    s += text(X, ys[1], "HC", { color: PART.backbone, size: 18 });
    s += line(X, ys[1] + 16, X, ys[2] - 16, PART.backbone);
    s += text(X, ys[2], "HC", { color: PART.backbone, size: 18 });
    s += line(X, ys[2] + 16, X, ys[3] - 16, PART.backbone);
    s += text(X, ys[3], "HC", { color: PART.backbone, size: 18 });
    s += dbl(X, ys[3] + 16, X, ys[4] - 16, PART.backbone, 5);
    s += text(X, ys[4], "HC", { color: PART.backbone, size: 18 });
    s += caption(X - 96, ys[1] + 30, "스핑고신 골격", PART.backbone);
    s += caption(X - 96, ys[1] + 50, "(글리세롤 아님)", PART.backbone);

    // C2 의 아미드 결합 + 지방산
    s += line(X + 26, ys[1], X + 56, ys[1], PART.chain);
    s += text(X + 78, ys[1], "NH", { color: PART.chain, size: 17 });
    s += line(X + 100, ys[1], X + 132, ys[1], PART.chain);
    s += text(X + 150, ys[1], "C", { color: PART.chain, size: 18 });
    s += dbl(X + 150, ys[1] - 14, X + 150, ys[1] - 42, PART.chain, 4);
    s += text(X + 150, ys[1] - 56, "O", { color: PART.chain, size: 17 });
    s += line(X + 164, ys[1], X + 196, ys[1], PART.chain);
    s += chip(X + 232, ys[1], 62, 40, "R", PART.chain);
    s += caption(X + 116, ys[1] + 30, "아미드 결합", PART.chain);

    // C3 의 -OH
    s += line(X + 26, ys[2], X + 56, ys[2], PART.backbone);
    s += text(X + 78, ys[2], "OH", { color: PART.backbone, size: 17 });

    // 이중결합(4E) 과 나머지 사슬
    s += caption(X + 92, (ys[3] + ys[4]) / 2, "trans 이중결합 (Δ4)", PART.backbone);
    s += line(X, ys[4] + 16, X, ys[4] + 44, PART.chain);
    s += chip(X, ys[4] + 70, 150, 38, "(CH₂)₁₂—CH₃", PART.chain, { size: 15 });
    return svg("0 0 620 660", s);
  },

  /* 콜레스테롤 — 네 고리가 붙은 스테로이드 골격 (A·B·C 육각 + D 오각) */
  CHOL: () => {
    const c = hex(LIPID_BY_ID.CHOL.color);
    const r = 48;
    const dx = Math.sqrt(3) * r; // 수직변을 공유하며 가로로 붙는다
    const A = hexVerts(140, 320, r);
    const B = hexVerts(140 + dx, 320, r);
    const Cc = hexVerts(140 + 2 * dx, 320, r);
    const cCenter = [140 + 2 * dx, 320];
    // D 고리(오각)는 C 고리의 오른쪽 위 변에 붙는다
    const D = polygonOnEdge(Cc[4], Cc[5], 5, cCenter);

    let s = "";
    s += ringPath(A, c, 2.4);
    s += ringPath(B, c, 2.4);
    s += ringPath(Cc, c, 2.4);
    s += ringPath(D, c, 2.4);

    s += caption(140, 320, "A", PART.faint);
    s += caption(140 + dx, 320, "B", PART.faint);
    s += caption(140 + 2 * dx, 320, "C", PART.faint);
    const dcx = D.reduce((a, q) => a + q[0], 0) / 5;
    const dcy = D.reduce((a, q) => a + q[1], 0) / 5;
    s += caption(dcx, dcy, "D", PART.faint);

    // 3번 탄소의 -OH (A 고리 왼쪽 아래)
    const oh = A[2];
    s += line(oh[0], oh[1], oh[0] - 46, oh[1] + 26, PART.phosphate);
    s += text(oh[0] - 72, oh[1] + 36, "OH", {
      color: PART.phosphate,
      size: 19,
      weight: 800,
    });
    s += caption(oh[0] - 62, oh[1] + 60, "3-OH (극성 머리)", PART.phosphate);

    // C5=C6 이중결합 (A/B 접합부에서 B 고리 아래쪽으로)
    s += dbl(B[2][0], B[2][1], B[1][0], B[1][1], c, 5);
    s += caption(B[1][0] + 6, B[1][1] + 26, "C5=C6", PART.faint);

    // 각 메틸기 두 개 (C19 · C18)
    for (const v of [A[5], Cc[5]]) {
      s += line(v[0], v[1], v[0], v[1] - 44, c);
      s += text(v[0], v[1] - 58, "CH₃", { color: c, size: 14 });
    }

    // C17 곁사슬 (D 고리 바깥 꼭짓점에서 시작하는 갈래 사슬)
    let q = D[2];
    for (const [ddx, ddy] of [[44, -26], [44, 26], [44, -26], [44, 26]]) {
      const n = [q[0] + ddx, q[1] + ddy];
      s += line(q[0], q[1], n[0], n[1], PART.chain);
      q = n;
    }
    s += line(q[0], q[1], q[0] + 40, q[1] - 26, PART.chain);
    s += text(q[0] + 62, q[1] - 34, "CH₃", { color: PART.chain, size: 14 });
    s += line(q[0], q[1], q[0] + 40, q[1] + 26, PART.chain);
    s += text(q[0] + 62, q[1] + 34, "CH₃", { color: PART.chain, size: 14 });
    s += caption(q[0] - 34, q[1] + 62, "탄화수소 곁사슬", PART.chain);
    s += caption(250, 150, "네 고리가 붙은 단단한 스테로이드 골격", c);

    return svg("-4 122 764 378", s);
  },
};

/* ---------- 공개 API ---------- */

export function buildStructureSvg(id) {
  const b = BUILDERS[id];
  return b ? b() : "";
}

/** 구조식 위에 표시할 부위 범례 (3D 모델 색과 대응) */
export function structureLegend(id) {
  const color = hex(LIPID_BY_ID[id].color);
  if (id === "CHOL") {
    return [
      { color, label: "스테로이드 골격" },
      { color: PART.phosphate, label: "−OH (극성 머리)" },
      { color: PART.chain, label: "탄화수소 곁사슬" },
    ];
  }
  return [
    { color, label: "머리 그룹" },
    { color: PART.phosphate, label: "인산" },
    { color: PART.backbone, label: id === "SM" ? "스핑고신 골격" : "글리세롤 골격" },
    { color: PART.chain, label: "소수성 사슬" },
  ];
}

/**
 * 일반화된 class 구조임을 알리는 설명.
 * 특정 지방산 하나를 정해 그것이 그 지질의 유일한 구조인 것처럼 보이지 않게 한다.
 */
export const STRUCTURE_NOTE = {
  PC: "이 구조는 PC 계열의 일반화된 구조입니다. R₁과 R₂는 실제 생체막에서 서로 다른 지방산 사슬일 수 있습니다.",
  PE: "이 구조는 PE 계열의 일반화된 구조입니다. R₁과 R₂는 실제 생체막에서 서로 다른 지방산 사슬일 수 있습니다.",
  PS: "이 구조는 PS 계열의 일반화된 구조입니다. R₁과 R₂는 실제 생체막에서 서로 다른 지방산 사슬일 수 있습니다.",
  PI: "이 구조는 PI 계열의 일반화된 구조입니다. R₁과 R₂는 실제 생체막에서 서로 다른 지방산 사슬일 수 있습니다.",
  PIP2:
    "이 구조는 PI(4,5)P₂, 즉 이노시톨 고리의 4번·5번 탄소에 인산이 하나씩 더 붙은 형태입니다. R₁과 R₂는 서로 다른 지방산 사슬일 수 있습니다.",
  SM: "이 구조는 SM 계열의 일반화된 구조입니다. 스핑고신 골격과 아미드로 연결된 지방산(R)의 사슬 조성은 다양할 수 있습니다.",
  CHOL:
    "콜레스테롤은 지방산 사슬이 없는 단일 화합물이라, 위 구조가 곧 콜레스테롤 분자 자체입니다.",
};

/** 구조에서 짚어 줄 핵심 포인트 (오른쪽 패널용) */
export const STRUCTURE_POINTS = {
  PC: [
    "글리세롤 3번 탄소에 <b>인산</b>이 붙고, 그 인산에 <b>콜린</b>이 이어진다.",
    "지방산 2개는 모두 <b>에스터 결합</b>으로 붙어 있다.",
    "인산은 음전하, 콜린의 질소는 양전하 → 알짜 전하는 거의 0.",
  ],
  PE: [
    "머리가 <b>에탄올아민</b>이라 콜린보다 작다.",
    "지방산 2개는 <b>에스터 결합</b>이다.",
    "인산의 음전하와 −NH₃⁺의 양전하가 상쇄되어 알짜 전하는 거의 0.",
  ],
  PS: [
    "머리가 <b>세린</b>이라 −COO⁻가 하나 더 있다.",
    "그래서 PC·PE와 달리 <b>알짜 음전하</b>를 띤다.",
    "지방산 2개는 <b>에스터 결합</b>이다.",
  ],
  PI: [
    "머리가 6탄소 고리인 <b>myo-이노시톨</b>이다.",
    "고리의 1번 탄소가 인산을 통해 글리세롤과 이어진다.",
    "고리에 인산이 더 붙으면 여러 신호 지질(phosphoinositide)이 된다.",
  ],
  PIP2: [
    "이노시톨 고리의 <b>4번·5번 탄소</b>에 인산이 하나씩 더 붙어 있다.",
    "인산이 모두 3개라 머리가 <b>강한 음전하</b>를 띤다.",
    "PLC가 <b>글리세롤과 인산 사이</b>를 끊으면 DAG와 IP₃가 된다. (모듈 2)",
  ],
  SM: [
    "골격이 글리세롤이 아니라 <b>스핑고신</b>이다.",
    "지방산이 <b>아미드 결합</b>으로 붙는다 (에스터가 아니다).",
    "머리는 PC와 같은 <b>포스포콜린</b>이라 성질이 PC와 비슷하다.",
  ],
  CHOL: [
    "네 개의 고리가 붙어 있어 <b>휘어지지 않고 단단하다</b>.",
    "극성 부분은 <b>−OH 하나</b>뿐이라 막 표면 근처에 걸린다.",
    "나머지는 모두 소수성이라 인지질 꼬리 사이에 끼어 들어간다.",
  ],
};
