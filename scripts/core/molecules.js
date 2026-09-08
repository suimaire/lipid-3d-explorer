/* ============================================================
   원자 단위(atomistic) 지질 구조 — 좌표 생성기

   여기서는 three.js 를 쓰지 않는다(순수 자료 + 기하 계산).
   덕분에 node 로도 그대로 불러 검증할 수 있다. (scripts/qa/check-molecules.mjs)

   ── 표현 수준 ─────────────────────────────────────────────
   무거운 원자(C·N·O·P)만 만든다. 수소는 그리지 않는다.
   지질 한 분자의 수소는 80개가 넘어 화면이 가려지기 때문이며,
   큰 분자를 다룰 때 흔히 쓰는 heavy-atom 표기다.

   ── 대표 구조(representative species) ────────────────────
   PC·PE·PS·PI·PIP2 는 하나의 분자가 아니라 지방산 조성이 다양한
   "class" 다. 그래서 모두 같은 아실 조합
        sn-1 = 팔미트산 (16:0),  sn-2 = 올레산 (18:1 cis-Δ9)
   을 써서 그렸다. 아실 사슬을 고정해 두면 PC/PE/PS/PI/PIP2 의 차이가
   오직 머리 그룹에서만 생기는 것이 눈으로 바로 보인다.
   SM 은 d18:1/16:0 (N-palmitoyl sphingosylphosphorylcholine),
   콜레스테롤은 지방산이 없는 단일 화합물이다.
   자세한 근거는 docs/SCIENTIFIC_NOTES.md 에 적어 두었다.
   ============================================================ */

/* ---------- 최소한의 벡터 유틸 ---------- */

const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) =>
  V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => {
  const L = vlen(a) || 1;
  return mul(a, 1 / L);
};
const DEG = Math.PI / 180;

/**
 * NeRF — 내부좌표(결합길이·결합각·이면각)로 원자 하나를 놓는다.
 * a-b-c 가 이미 있고, c 에 붙는 새 원자 d 를 구한다.
 */
function place(a, b, c, L, angDeg, dihDeg) {
  const th = angDeg * DEG;
  const ph = dihDeg * DEG;
  const bc = norm(sub(c, b));
  let n = cross(sub(b, a), bc);
  if (vlen(n) < 1e-6) {
    // a·b·c 가 일직선이면 아무 수직 방향이나 쓴다
    const alt = Math.abs(bc.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    n = cross(alt, bc);
  }
  n = norm(n);
  const m = cross(n, bc);
  const d2 = V(
    -L * Math.cos(th),
    L * Math.sin(th) * Math.cos(ph),
    L * Math.sin(th) * Math.sin(ph)
  );
  return add(c, {
    x: bc.x * d2.x + m.x * d2.y + n.x * d2.z,
    y: bc.y * d2.x + m.y * d2.y + n.y * d2.z,
    z: bc.z * d2.x + m.z * d2.y + n.z * d2.z,
  });
}

/** 벡터 v 에서 축 성분을 뺀 나머지(축과 수직인 성분) */
function perpInPlane(v, axis) {
  return sub(v, mul(axis, dot(v, axis)));
}

function perpendicular(d) {
  const alt = Math.abs(d.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  return norm(cross(alt, d));
}

/* ---------- 분자 빌더 ---------- */

class Mol {
  constructor() {
    this.atoms = []; // {el, pos, group, p}
    this.bonds = []; // {a, b, order}
    this.tags = {}; // 이름 → 원자 index (라벨 앵커용)
  }

  /** 좌표를 직접 지정해 원자를 놓는다(맨 처음 몇 개). */
  seed(el, xyz, group, parent = -1) {
    return this.put(el, V(xyz[0], xyz[1], xyz[2]), group, parent);
  }

  put(el, pos, group, parent = -1) {
    const i = this.atoms.length;
    this.atoms.push({ el, pos, group, p: parent });
    if (parent >= 0) this.link(parent, i, 1);
    return i;
  }

  /**
   * 내부좌표로 원자를 붙인다.
   * ref1(결합각 기준) · ref2(이면각 기준)를 주지 않으면 부모의 계보를 쓴다.
   */
  grow(el, parent, o) {
    const P = this.atoms[parent];
    const i1 = o.ref1 !== undefined ? o.ref1 : P.p;
    if (i1 < 0) throw new Error("grow: ref1 이 필요하다");
    const B = this.atoms[i1].pos;
    const i2 = o.ref2 !== undefined ? o.ref2 : this.atoms[i1].p;
    // ref2 가 없으면 B-C 축과 수직인 가상의 점을 만들어 쓴다
    const A = i2 >= 0 ? this.atoms[i2].pos : add(B, perpendicular(sub(P.pos, B)));
    const pos = place(A, B, P.pos, o.len, o.ang, o.dih);
    const i = this.atoms.length;
    this.atoms.push({ el, pos, group: o.group || P.group, p: parent });
    this.link(parent, i, o.order || 1);
    return i;
  }

  /**
   * 고리 탄소에 치환기를 붙인다(축방향 axial / 적도방향 equatorial).
   * 이면각 부호를 헷갈리지 않도록 두 이웃 원자에서 방향을 직접 계산한다.
   */
  substituent(el, at, n1, n2, mode, L, group, normal) {
    const p = this.atoms[at].pos;
    const d1 = norm(sub(this.atoms[n1].pos, p));
    const d2 = norm(sub(this.atoms[n2].pos, p));
    const u = norm(mul(add(d1, d2), -1));
    const v = norm(cross(d1, d2));
    const a = 54.75 * DEG;
    const s1 = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
    const s2 = add(mul(u, Math.cos(a)), mul(v, -Math.sin(a)));
    // 고리 법선과 더 나란한 쪽이 축방향(axial)
    const axIsS1 = Math.abs(dot(s1, normal)) > Math.abs(dot(s2, normal));
    const dir = (mode === "axial") === axIsS1 ? s1 : s2;
    return this.put(el, add(p, mul(dir, L)), group, at);
  }

  link(a, b, order = 1) {
    this.bonds.push({ a, b, order });
  }

  tag(name, idx) {
    this.tags[name] = idx;
    return idx;
  }

  pos(i) {
    return this.atoms[i].pos;
  }

  /** 그룹 이름(또는 index 배열)의 무게중심 */
  centroid(sel) {
    const list = Array.isArray(sel)
      ? sel.map((i) => this.atoms[i])
      : this.atoms.filter((a) => a.group === sel);
    if (!list.length) return V(0, 0, 0);
    let c = V(0, 0, 0);
    for (const a of list) c = add(c, a.pos);
    return mul(c, 1 / list.length);
  }
}

function ringNormal(m, ring) {
  const c = m.centroid(ring);
  let n = V(0, 0, 0);
  for (let i = 0; i < ring.length; i++) {
    const a = sub(m.pos(ring[i]), c);
    const b = sub(m.pos(ring[(i + 1) % ring.length]), c);
    n = add(n, cross(a, b));
  }
  return norm(n);
}

/* ---------- 사슬 방향 다듬기 ---------- */

function adjacency(m) {
  const adj = m.atoms.map(() => []);
  for (const b of m.bonds) {
    adj[b.a].push(b.b);
    adj[b.b].push(b.a);
  }
  return adj;
}

/** root 에서 시작해 stop 을 넘지 않고 이어진 원자 전부 */
function subtreeFrom(adj, root, stop) {
  const seen = new Set([stop, root]);
  const out = [root];
  const queue = [root];
  while (queue.length) {
    const i = queue.shift();
    for (const j of adj[i]) {
      if (seen.has(j)) continue;
      seen.add(j);
      out.push(j);
      queue.push(j);
    }
  }
  return out;
}

/** i 에서 3결합 이내인 원자들 (비결합 접촉을 볼 때 제외한다) */
function near3(adj, i) {
  const seen = new Set([i]);
  let front = [i];
  for (let d = 0; d < 3; d++) {
    const next = [];
    for (const a of front)
      for (const b of adj[a])
        if (!seen.has(b)) {
          seen.add(b);
          next.push(b);
        }
    front = next;
  }
  return seen;
}

/** 축(from, 단위벡터 axis) 을 중심으로 점 p 를 ang 만큼 돌린다 (Rodrigues) */
function rotateAbout(p, from, axis, ang) {
  const v = sub(p, from);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return add(
    from,
    add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))
  );
}

/**
 * 회전 가능한 결합(pivot→child)을 5° 씩 돌려 보며, 사슬이 목표 축
 * (lineFrom 을 지나 lineDir 방향으로 뻗는 직선)에 가장 잘 눕는 각도를 고른다.
 * chain 은 사슬 원자 index 를 이어진 순서대로 담은 배열이다.
 * 축에서 벗어난 거리와 축을 따라 내려간 정도로 점수를 매기고,
 * 다른 원자와 부딪히면 크게 감점한다.
 * 이면각만 바꾸므로 결합 길이와 결합각은 그대로 유지된다.
 */
function bestTorsion(m, pivot, child, chain, lineFrom, lineDir) {
  const adj = adjacency(m);
  const part = subtreeFrom(adj, child, pivot);
  const inPart = new Set(part);
  const rest = m.atoms.map((_, i) => i).filter((i) => !inPart.has(i));
  const skip = new Map(part.map((i) => [i, near3(adj, i)]));
  const axis = norm(sub(m.pos(child), m.pos(pivot)));
  const from = m.pos(pivot);
  const orig = part.map((i) => m.pos(i));
  let best = { score: -Infinity, ang: 0, fallbackD: 0, fallbackAng: 0 };

  for (let deg = 0; deg < 360; deg += 5) {
    const ang = deg * DEG;
    const moved = new Map(part.map((i, k) => [i, rotateAbout(orig[k], from, axis, ang)]));
    let score = 0;
    let k = 0;
    for (const i of chain) {
      const p = moved.get(i) || m.pos(i);
      const d = sub(p, lineFrom);
      const t = dot(d, lineDir);
      const perp = vlen(sub(d, mul(lineDir, t)));
      score -= perp * perp; // 축에서 벗어난 거리
      // 탄소 하나마다 축을 따라 약 1.2 Å 씩 내려가야 한다.
      // 되말리거나 옆으로 도는 배좌는 이 항에서 크게 감점된다.
      const ideal = k * 1.2;
      score -= (t - ideal) * (t - ideal) * 0.6;
      if (m.atoms[i].el === "C") k++;
    }
    let dmin = 99;
    for (const i of part) {
      const ex = skip.get(i);
      for (const j of rest) {
        if (ex.has(j)) continue;
        const d = vlen(sub(moved.get(i), m.pos(j)));
        if (d < dmin) dmin = d;
      }
    }
    if (dmin < 3.2) score -= (3.2 - dmin) * 120;
    // 2.7 Å 보다 가까우면 아무리 잘 누워도 쓰지 않는다
    if (dmin < 2.7) {
      if (dmin > best.fallbackD) best.fallbackD = dmin;
      if (dmin >= best.fallbackD) best.fallbackAng = ang;
      continue;
    }
    if (score > best.score) best = { ...best, score, ang };
  }
  if (best.score === -Infinity) best.ang = best.fallbackAng; // 모든 각도가 부딪히면 그나마 나은 쪽
  part.forEach((i, k) => {
    m.atoms[i].pos = rotateAbout(orig[k], from, axis, best.ang);
  });
}

/**
 * 사슬 하나를 목표 축을 따라 눕힌다.
 *
 * 실제 막에서 두 아실 사슬은 대체로 나란히 눕는데, 결합각·이면각만 쌓아
 * 올리면 좌우로 크게 벌어져 버린다. 그래서 자유롭게 돌아가는 결합
 * (에스터의 C−O, 카르보닐−Cα, 그 아래 두어 개)을 차례로 돌려 가며
 * 사슬을 축 위에 올린다. 세 번 반복하면 충분히 수렴한다.
 */
function layChain(m, bonds, chain, lineFrom, lineDir) {
  for (let round = 0; round < 3; round++)
    for (const [pivot, child] of bonds) bestTorsion(m, pivot, child, chain, lineFrom, lineDir);
}

/** from 부터 to 까지의 원자 index 들 (사슬은 build 순서상 연속이다) */
function chainRun(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/* ---------- 공통 조각 ---------- */

/**
 * 에스터 산소에서 뻗어 나가는 아실 사슬.
 * n = 지방산의 탄소 수(카르보닐 탄소 포함), dbAt = cis 이중결합 위치(Δn),
 * dih0 = 에스터가 골격에서 뻗어 나가는 방향(두 사슬이 겹치지 않게 잡은 값)
 * @returns {{carbonyl, alpha, dbAt}} 카르보닐 탄소 · α 탄소의 index 와 이중결합 위치
 */
function acylChain(m, oIdx, n, dbAt, dih0 = 180) {
  const c1 = m.grow("C", oIdx, { len: 1.35, ang: 117, dih: dih0, group: "chain" });
  m.grow("O", c1, { len: 1.21, ang: 124, dih: 0, order: 2, group: "chain" });
  let alpha = -1;
  let prev = c1;
  for (let i = 2; i <= n; i++) {
    let o;
    if (i === 2) o = { len: 1.51, ang: 112, dih: 180 };
    else if (dbAt && i === dbAt + 1) o = { len: 1.33, ang: 124, dih: 180, order: 2 };
    else if (dbAt && i === dbAt + 2) o = { len: 1.51, ang: 124, dih: 0 }; // cis 굽이
    else o = { len: 1.53, ang: 112, dih: 180 };
    prev = m.grow("C", prev, { ...o, group: "chain" });
    if (i === 2) alpha = prev;
    if (dbAt && i === dbAt + 1) m.tag("ene", prev); // cis 이중결합 위치(라벨용)
  }
  return { carbonyl: c1, alpha, dbAt };
}

/** 곧은 알킬 사슬을 이어 붙인다. */
function alkyl(m, from, n, group) {
  let prev = from;
  for (let i = 0; i < n; i++) {
    prev = m.grow("C", prev, { len: 1.53, ang: 112, dih: 180, group });
  }
  return prev;
}

/**
 * 사슬에서 자유롭게 돌아가는 결합 목록 (위에서 아래로).
 * cis 이중결합이 있으면 그 아래쪽 결합도 넣는다 — 이중결합은 고정된 꺾임이라,
 * 바로 뒤의 결합을 돌려 주어야 사슬의 나머지가 다시 아래로 향한다.
 */
function chainBonds(acyl, oIdx) {
  const c = acyl.carbonyl;
  const a = acyl.alpha; // = c + 2
  const bonds = [
    [oIdx, c],
    [c, a],
    [a, a + 1],
    [a + 1, a + 2],
  ];
  if (acyl.dbAt) bonds.push([c + acyl.dbAt + 1, c + acyl.dbAt + 2], [c + acyl.dbAt + 2, c + acyl.dbAt + 3]);
  return bonds;
}

/** 콜린 머리: −O−CH₂CH₂−N⁺(CH₃)₃ */
function choline(m, oHead) {
  const cA = m.grow("C", oHead, { len: 1.44, ang: 120, dih: 180, group: "head" });
  const cB = m.grow("C", cA, { len: 1.52, ang: 112, dih: 180, group: "head" });
  const N = m.grow("N", cB, { len: 1.51, ang: 114, dih: 180, group: "head" });
  m.grow("C", N, { len: 1.50, ang: 110, dih: 60, group: "head" });
  m.grow("C", N, { len: 1.50, ang: 110, dih: 180, group: "head" });
  m.grow("C", N, { len: 1.50, ang: 110, dih: -60, group: "head" });
  return N;
}

/** 글리세로인지질 공통 골격: 글리세롤 + 인산 다리 + 아실 사슬 2개 */
function glyceroCore(m) {
  // 글리세롤 (sn-3 → sn-1). 처음 세 원자만 좌표를 직접 준다.
  const c3 = m.seed("C", [0, 0, 0], "backbone");
  const c2 = m.seed("C", [1.53, 0, 0], "backbone", c3);
  const c1 = m.seed("C", [2.103, 1.419, 0], "backbone", c2);
  m.tag("backbone", c2);

  // sn-3 → 인산 다리(phosphodiester)
  const o3 = m.grow("O", c3, { ref1: c2, ref2: c1, len: 1.44, ang: 110, dih: 180, group: "phosphate" });
  const P = m.grow("P", o3, { len: 1.60, ang: 120, dih: 180, group: "phosphate" });
  m.tag("phosphate", P);
  m.grow("O", P, { len: 1.48, ang: 112, dih: 60, order: 2, group: "phosphate" });
  m.grow("O", P, { len: 1.50, ang: 112, dih: -60, group: "phosphate" });
  const oHead = m.grow("O", P, { len: 1.61, ang: 103, dih: 180, group: "phosphate" });

  // sn-2 = 올레오일 (18:1 cis-Δ9), sn-1 = 팔미토일 (16:0)
  const o2 = m.grow("O", c2, { ref1: c3, ref2: o3, len: 1.44, ang: 110, dih: -70, group: "chain" });
  const o1 = m.grow("O", c1, { ref1: c2, ref2: c3, len: 1.44, ang: 110, dih: 180, group: "chain" });
  const acyl2 = acylChain(m, o2, 18, 9, -60); // sn-2 = 올레오일
  const acyl1 = acylChain(m, o1, 16, 0); // sn-1 = 팔미토일
  m.tag("ester", acyl2.carbonyl);

  // 인산에서 글리세롤로 향하는 방향 = 막 속으로 들어가는 방향
  const base = m.centroid([c1, c2, c3]);
  const down = norm(sub(base, m.pos(P)));
  // 두 사슬이 나란히 눕도록, 좌우로 4.6 Å 벌린 두 축을 목표로 준다
  const lat = norm(perpInPlane(sub(m.pos(o1), m.pos(o2)), down));
  const axisAt = (side) => add(base, mul(lat, side * 2.3));
  // sn-2 를 먼저 만들었으므로 원자 index 도 sn-2 → sn-1 순서로 이어져 있다
  layChain(m, chainBonds(acyl1, o1), chainRun(acyl1.carbonyl, m.atoms.length - 1), axisAt(1), down);
  layChain(m, chainBonds(acyl2, o2), chainRun(acyl2.carbonyl, acyl1.carbonyl - 1), axisAt(-1), down);
  return { c1, c2, c3, P, oHead, down };
}

/**
 * myo-이노시톨 고리(의자형)를 머리 산소에 이어 붙인다.
 * phos = 인산이 더 붙는 탄소 번호 (PIP2 는 [4, 5])
 */
function inositol(m, oHead, phos) {
  const ring = [];
  ring[0] = m.grow("C", oHead, { len: 1.44, ang: 119, dih: 180, group: "head" });
  ring[1] = m.grow("C", ring[0], { len: 1.53, ang: 110, dih: 120, group: "head" });
  // 이후 고리 이면각을 ±54.9° 로 번갈아 주면 의자형이 저절로 닫힌다
  ring[2] = m.grow("C", ring[1], { len: 1.53, ang: 111.4, dih: 180, group: "head" });
  ring[3] = m.grow("C", ring[2], { len: 1.53, ang: 111.4, dih: -54.9, group: "head" });
  ring[4] = m.grow("C", ring[3], { len: 1.53, ang: 111.4, dih: 54.9, group: "head" });
  ring[5] = m.grow("C", ring[4], { len: 1.53, ang: 111.4, dih: -54.9, group: "head" });
  m.link(ring[5], ring[0], 1); // 고리 닫기
  m.tag("ring", ring[0]);

  const n = ringNormal(m, ring);

  // 2번은 축방향(axial) OH, 나머지는 적도방향 — myo-이노시톨의 배열
  for (let k = 1; k < 6; k++) {
    const num = k + 1; // 고리 index → 이노시톨 번호
    const prev = ring[(k + 5) % 6];
    const next = ring[(k + 1) % 6];
    const mode = num === 2 ? "axial" : "equatorial";
    const o = m.substituent("O", ring[k], prev, next, mode, 1.43, "head", n);
    if (phos.includes(num)) {
      // 4번·5번 인산 — PIP2 의 핵심
      // 4번·5번 인산은 서로 이웃한 탄소에 붙으므로 반대 방향으로 돌려 겹침을 피한다
      const p = m.grow("P", o, { ref1: ring[k], ref2: prev, len: 1.61, ang: 120, dih: num === 4 ? -60 : 60, group: "headP" });
      m.tag("P" + num, p);
      m.grow("O", p, { len: 1.49, ang: 112, dih: 60, order: 2, group: "headP" });
      m.grow("O", p, { len: 1.51, ang: 112, dih: 180, group: "headP" });
      m.grow("O", p, { len: 1.51, ang: 112, dih: -60, group: "headP" });
    }
  }
  return ring;
}

/* ---------- 지질별 구조 ---------- */

const BUILD = {
  /* POPC — 1-팔미토일-2-올레오일-sn-글리세로-3-포스포콜린 */
  PC() {
    const m = new Mol();
    const { oHead } = glyceroCore(m);
    m.tag("head", choline(m, oHead));
    return m;
  },

  /* POPE — 머리만 에탄올아민으로 바뀐다 */
  PE() {
    const m = new Mol();
    const { oHead } = glyceroCore(m);
    const cA = m.grow("C", oHead, { len: 1.44, ang: 120, dih: 180, group: "head" });
    const cB = m.grow("C", cA, { len: 1.52, ang: 112, dih: 180, group: "head" });
    m.tag("head", m.grow("N", cB, { len: 1.48, ang: 112, dih: 180, group: "head" }));
    return m;
  },

  /* POPS — 머리가 세린이라 −COO⁻ 가 하나 더 있다(알짜 음전하) */
  PS() {
    const m = new Mol();
    const { oHead } = glyceroCore(m);
    const cA = m.grow("C", oHead, { len: 1.44, ang: 120, dih: 180, group: "head" });
    const cB = m.grow("C", cA, { len: 1.53, ang: 112, dih: 180, group: "head" });
    m.tag("head", m.grow("N", cB, { len: 1.49, ang: 110, dih: 180, group: "head" }));
    const cC = m.grow("C", cB, { len: 1.54, ang: 110, dih: -60, group: "head" });
    m.tag("carboxyl", cC);
    m.grow("O", cC, { len: 1.25, ang: 118, dih: 30, order: 2, group: "head" });
    m.grow("O", cC, { len: 1.26, ang: 118, dih: -150, group: "head" });
    return m;
  },

  /* POPI — 머리가 myo-이노시톨 고리 */
  PI() {
    const m = new Mol();
    const { oHead } = glyceroCore(m);
    const ring = inositol(m, oHead, []);
    m.tag("head", ring[3]);
    return m;
  },

  /* PI(4,5)P₂ — 이노시톨 4번·5번에 인산이 하나씩 더 붙는다 */
  PIP2() {
    const m = new Mol();
    const { oHead } = glyceroCore(m);
    const ring = inositol(m, oHead, [4, 5]);
    m.tag("head", ring[3]);
    return m;
  },

  /* 스핑고미엘린 d18:1/16:0 — 글리세롤이 아니라 스핑고신 골격 */
  SM() {
    const m = new Mol();
    // 스핑고신 C1·C2·C3
    const c1 = m.seed("C", [0, 0, 0], "backbone");
    const c2 = m.seed("C", [1.53, 0, 0], "backbone", c1);
    const c3 = m.seed("C", [2.103, 1.419, 0], "backbone", c2);
    m.tag("backbone", c2);

    // C1 → 포스포콜린
    const o1 = m.grow("O", c1, { ref1: c2, ref2: c3, len: 1.44, ang: 110, dih: 180, group: "phosphate" });
    const P = m.grow("P", o1, { len: 1.60, ang: 120, dih: 180, group: "phosphate" });
    m.tag("phosphate", P);
    m.grow("O", P, { len: 1.48, ang: 112, dih: 60, order: 2, group: "phosphate" });
    m.grow("O", P, { len: 1.50, ang: 112, dih: -60, group: "phosphate" });
    const oHead = m.grow("O", P, { len: 1.61, ang: 103, dih: 180, group: "phosphate" });
    m.tag("head", choline(m, oHead));

    // C2 → 아미드 결합으로 지방산(팔미토일)이 붙는다 (에스터가 아니다)
    const N = m.grow("N", c2, { ref1: c1, ref2: o1, len: 1.47, ang: 110, dih: 70, group: "amide" });
    m.tag("amide", N);
    const ca = m.grow("C", N, { len: 1.34, ang: 122, dih: -120, group: "amide" });
    m.grow("O", ca, { len: 1.23, ang: 123, dih: 0, order: 2, group: "amide" });
    const cb = m.grow("C", ca, { len: 1.51, ang: 116, dih: 180, group: "chain" }); // α 탄소
    alkyl(m, cb, 14, "chain"); // 팔미토일 = 카르보닐 + 15 C

    // C3 → OH, 이어서 C4=C5 (trans) 와 스핑고신 꼬리
    m.grow("O", c3, { ref1: c2, ref2: c1, len: 1.43, ang: 110, dih: -60, group: "backbone" });
    const c4 = m.grow("C", c3, { ref1: c2, ref2: c1, len: 1.51, ang: 112, dih: 180, group: "chain" });
    const c5 = m.grow("C", c4, { len: 1.33, ang: 124, dih: 180, order: 2, group: "chain" });
    m.tag("ene", c5);
    const c6 = m.grow("C", c5, { len: 1.51, ang: 124, dih: 180, group: "chain" }); // trans
    alkyl(m, c6, 12, "chain"); // C6 → C18

    // 지방산과 스핑고신 꼬리를 막 속 방향으로 나란히 눕힌다
    const base = m.centroid([c1, c2, c3]);
    const down = norm(sub(base, m.pos(P)));
    const lat = norm(perpInPlane(sub(m.pos(N), m.pos(c3)), down));
    const axisAt = (side) => add(base, mul(lat, side * 2.3));
    layChain(m, [[c2, N], [ca, cb], [cb, cb + 1], [cb + 1, cb + 2]], chainRun(cb, cb + 14), axisAt(1), down);
    layChain(m, [[c3, c4], [c6, c6 + 1], [c6 + 1, c6 + 2]], chainRun(c4, c6 + 12), axisAt(-1), down);
    return m;
  },

  /* 콜레스테롤 — 네 고리가 붙은 스테로이드 골격 + 짧은 곁사슬 */
  CHOL() {
    const m = new Mol();
    // ---- A 고리(의자형): C1, C2, C3, C4, C5, C10
    const r = 1.46;
    const zz = 0.245;
    const A = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      A.push(V(r * Math.cos(a), r * Math.sin(a), k % 2 ? zz : -zz));
    }
    const idx = {};
    const names = ["C1", "C2", "C3", "C4", "C5", "C10"];
    for (let k = 0; k < 6; k++) idx[names[k]] = m.put("C", A[k], "ring");
    for (let k = 0; k < 6; k++) m.link(idx[names[k]], idx[names[(k + 1) % 6]], 1);

    // ---- B 고리: A 고리를 C5−C10 결합의 중점에 대해 점대칭 이동
    //      (trans 접합된 의자-의자 구조가 정확히 나온다)
    const mirror = (p, q) => (x) => V(p.x + q.x - x.x, p.y + q.y - x.y, p.z + q.z - x.z);
    const mAB = mirror(A[4], A[5]);
    idx.C6 = m.put("C", mAB(A[0]), "ring");
    idx.C7 = m.put("C", mAB(A[1]), "ring");
    idx.C8 = m.put("C", mAB(A[2]), "ring");
    idx.C9 = m.put("C", mAB(A[3]), "ring");
    m.link(idx.C5, idx.C6);
    m.link(idx.C6, idx.C7);
    m.link(idx.C7, idx.C8);
    m.link(idx.C8, idx.C9);
    m.link(idx.C9, idx.C10);

    // ---- C 고리: B 고리를 C8−C9 결합의 중점에 대해 점대칭 이동
    const B = [A[4], mAB(A[0]), mAB(A[1]), mAB(A[2]), mAB(A[3]), A[5]]; // C5,C6,C7,C8,C9,C10
    const mBC = mirror(B[3], B[4]);
    idx.C13 = m.put("C", mBC(B[0]), "ring");
    idx.C12 = m.put("C", mBC(B[1]), "ring");
    idx.C11 = m.put("C", mBC(B[2]), "ring");
    idx.C14 = m.put("C", mBC(B[5]), "ring");
    m.link(idx.C9, idx.C11);
    m.link(idx.C11, idx.C12);
    m.link(idx.C12, idx.C13);
    m.link(idx.C13, idx.C14);
    m.link(idx.C14, idx.C8);

    // ---- D 고리(오각형): C13−C14 변 위에 세운다
    const p13 = m.pos(idx.C13);
    const p14 = m.pos(idx.C14);
    const cC = m.centroid([idx.C8, idx.C9, idx.C11, idx.C12, idx.C13, idx.C14]);
    const edge = norm(sub(p13, p14));
    const mid = mul(add(p13, p14), 0.5);
    const outward = norm(perpInPlane(sub(mid, cC), edge));
    const side = 1.53;
    const cen = add(mid, mul(outward, side / (2 * Math.tan(Math.PI / 5))));
    const R = side / (2 * Math.sin(Math.PI / 5));
    const a0 = Math.atan2(dot(sub(p14, cen), outward), dot(sub(p14, cen), edge));
    const step = (2 * Math.PI) / 5;
    const pent = (k) => {
      const a = a0 - step * k;
      return add(cen, add(mul(edge, R * Math.cos(a)), mul(outward, R * Math.sin(a))));
    };
    idx.C15 = m.put("C", pent(1), "ring");
    idx.C16 = m.put("C", pent(2), "ring");
    idx.C17 = m.put("C", pent(3), "ring");
    m.link(idx.C14, idx.C15);
    m.link(idx.C15, idx.C16);
    m.link(idx.C16, idx.C17);
    m.link(idx.C17, idx.C13);
    m.tag("ring", idx.C9);

    // ---- C5=C6 이중결합
    for (const b of m.bonds) {
      if ((b.a === idx.C5 && b.b === idx.C6) || (b.a === idx.C6 && b.b === idx.C5)) b.order = 2;
    }
    m.tag("ene", idx.C6);

    // ---- 치환기: 3β−OH, C18·C19 메틸, C17 곁사슬
    const nA = ringNormal(m, [idx.C1, idx.C2, idx.C3, idx.C4, idx.C5, idx.C10]);
    m.tag("head", m.substituent("O", idx.C3, idx.C2, idx.C4, "equatorial", 1.43, "head", nA));
    m.substituent("C", idx.C10, idx.C1, idx.C5, "axial", 1.54, "ring", nA); // C19
    const nC = ringNormal(m, [idx.C8, idx.C9, idx.C11, idx.C12, idx.C13, idx.C14]);
    m.substituent("C", idx.C13, idx.C12, idx.C14, "axial", 1.54, "ring", nC); // C18

    const nD = ringNormal(m, [idx.C13, idx.C14, idx.C15, idx.C16, idx.C17]);
    const c20 = m.substituent("C", idx.C17, idx.C16, idx.C13, "equatorial", 1.54, "chain", nD);
    m.grow("C", c20, { ref1: idx.C17, ref2: idx.C16, len: 1.53, ang: 111, dih: 60, group: "chain" }); // C21 (메틸)
    const c22 = m.grow("C", c20, { ref1: idx.C17, ref2: idx.C16, len: 1.53, ang: 111, dih: 120, group: "chain" });
    const c23 = m.grow("C", c22, { ref1: c20, ref2: idx.C17, len: 1.53, ang: 112, dih: 180, group: "chain" });
    const c24 = m.grow("C", c23, { len: 1.53, ang: 112, dih: 180, group: "chain" });
    const c25 = m.grow("C", c24, { len: 1.53, ang: 112, dih: 180, group: "chain" });
    m.grow("C", c25, { len: 1.53, ang: 111, dih: 60, group: "chain" }); // C26
    m.grow("C", c25, { len: 1.53, ang: 111, dih: -60, group: "chain" }); // C27
    m.tag("tail", c24);

    // 곁사슬을 3-OH 반대쪽(막 속 방향)으로 눕힌다
    const down = norm(sub(m.pos(idx.C17), m.pos(m.tags.head)));
    layChain(
      m,
      [[idx.C17, c20], [c20, c22], [c22, c23]],
      chainRun(c20, m.atoms.length - 1),
      m.pos(idx.C17),
      down
    );
    return m;
  },
};

/* ---------- 대표 구조 설명 (UI · 문서용) ---------- */

export const SPECIES = {
  PC: {
    species: "POPC · 1-palmitoyl-2-oleoyl-sn-glycero-3-phosphocholine",
    acyl: "sn-1 16:0 (팔미트산) · sn-2 18:1 cis-Δ9 (올레산)",
    formula: "C42H82NO8P",
  },
  PE: {
    species: "POPE · 1-palmitoyl-2-oleoyl-sn-glycero-3-phosphoethanolamine",
    acyl: "sn-1 16:0 · sn-2 18:1 cis-Δ9",
    formula: "C39H76NO8P",
  },
  PS: {
    species: "POPS · 1-palmitoyl-2-oleoyl-sn-glycero-3-phospho-L-serine",
    acyl: "sn-1 16:0 · sn-2 18:1 cis-Δ9",
    formula: "C40H76NO10P",
  },
  PI: {
    species: "POPI · 1-palmitoyl-2-oleoyl-sn-glycero-3-phospho-(1'-myo-inositol)",
    acyl: "sn-1 16:0 · sn-2 18:1 cis-Δ9",
    formula: "C43H79O13P",
  },
  PIP2: {
    species: "PI(4,5)P₂ · 1-palmitoyl-2-oleoyl 형태",
    acyl: "sn-1 16:0 · sn-2 18:1 cis-Δ9 (몸속에서는 18:0/20:4 조성이 많다)",
    formula: "C43H79O19P3",
  },
  SM: {
    species: "N-palmitoyl-D-erythro-sphingosylphosphorylcholine (d18:1/16:0)",
    acyl: "스핑고신 골격 d18:1 · 아미드로 붙은 지방산 16:0",
    formula: "C39H79N2O6P",
  },
  CHOL: {
    species: "Cholesterol · cholest-5-en-3β-ol",
    acyl: "지방산 사슬이 없는 단일 화합물",
    formula: "C27H46O",
  },
};

/* 지질마다 머리 그룹이 잘 보이는 시작 카메라 각도 */
export const CAMERA_HINT = {
  PC: { theta: 0.42, phi: 1.48 },
  PE: { theta: 0.42, phi: 1.48 },
  PS: { theta: 0.42, phi: 1.48 },
  PI: { theta: 0.52, phi: 1.4 },
  // PIP2 는 4번·5번 인산이 보이도록 조금 더 위에서 내려다본다
  PIP2: { theta: 0.66, phi: 1.22 },
  SM: { theta: 0.42, phi: 1.48 },
  CHOL: { theta: 0.35, phi: 1.5 },
};

/* ---------- 공개 API ---------- */

const cache = new Map();

/**
 * 지질 id 의 원자 단위 구조를 만든다(한 번 만들면 캐시한다 — lazy loading).
 * @returns {{id, atoms, bonds, tags, anchors, radius, extent, species, acyl, formula}}
 */
export function getMolecule(id) {
  if (cache.has(id)) return cache.get(id);
  const build = BUILD[id];
  if (!build) return null;
  const m = build();
  orient(m);
  const data = {
    id,
    atoms: m.atoms.map((a) => ({ el: a.el, x: a.pos.x, y: a.pos.y, z: a.pos.z, group: a.group })),
    bonds: m.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
    tags: m.tags,
    anchors: anchorsOf(m),
    radius: boundingRadius(m),
    extent: extentOf(m),
    ...SPECIES[id],
  };
  cache.set(id, data);
  return data;
}

/** 라벨을 붙일 대표 위치들 */
function anchorsOf(m) {
  const out = {};
  const atTag = (name) => (m.tags[name] !== undefined ? m.pos(m.tags[name]) : null);
  const ofGroup = (name) =>
    m.atoms.some((a) => a.group === name) ? m.centroid(name) : null;
  const put = (k, v) => {
    if (v) out[k] = v;
  };
  put("head", atTag("head") || ofGroup("head"));
  put("phosphate", atTag("phosphate"));
  put("backbone", atTag("backbone") || ofGroup("ring"));
  put("chain", ofGroup("chain"));
  put("ester", atTag("ester"));
  put("amide", atTag("amide"));
  put("ene", atTag("ene"));
  put("P4", atTag("P4"));
  put("P5", atTag("P5"));
  put("ring", atTag("ring"));
  put("tail", atTag("tail"));
  return out;
}

function boundingRadius(m) {
  let r = 0;
  for (const a of m.atoms) r = Math.max(r, vlen(a.pos));
  return r + 1.6; // 원자 반지름 여유
}

/** 축별 반쪽 크기 — 길쭉한 지질을 화면에 꽉 맞추기 위해 쓴다. */
function extentOf(m) {
  const e = { x: 0, y: 0, z: 0 };
  for (const a of m.atoms) {
    e.x = Math.max(e.x, Math.abs(a.pos.x));
    e.y = Math.max(e.y, Math.abs(a.pos.y));
    e.z = Math.max(e.z, Math.abs(a.pos.z));
  }
  // 원자 구 반지름(약 0.5 Å)과 라벨이 걸릴 여유
  return { x: e.x + 0.8, y: e.y + 0.8, z: e.z + 0.8 };
}

/** 원자 분포의 주축(가장 길게 뻗은 방향) — 공분산 행렬의 거듭제곱 반복 */
function principalAxis(m, c, guess) {
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const a of m.atoms) {
    const d = [a.pos.x - c.x, a.pos.y - c.y, a.pos.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j];
  }
  let v = [guess.x, guess.y, guess.z];
  for (let k = 0; k < 32; k++) {
    const w = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) w[i] += cov[i][j] * v[j];
    const L = Math.hypot(w[0], w[1], w[2]) || 1;
    v = [w[0] / L, w[1] / L, w[2] / L];
  }
  return V(v[0], v[1], v[2]);
}

/**
 * 분자를 화면에 앉히기 좋게 돌려 놓는다.
 * 머리(극성) → +Y, 소수성 꼬리 → −Y, 가장 넓게 퍼진 방향 → X.
 */
function orient(m) {
  const headSel = m.atoms.some((a) => a.group === "head") ? "head" : "ring";
  const headC = m.centroid(headSel);
  const tailC = m.centroid("chain");
  const c0 = m.centroid(m.atoms.map((_, i) => i));
  // 분자가 가장 길게 뻗은 방향(주축)을 세로로 세우고,
  // 머리 그룹이 있는 쪽이 위(+Y)가 되도록 부호를 맞춘다.
  let up = principalAxis(m, c0, norm(sub(headC, tailC)));
  if (dot(up, sub(headC, tailC)) < 0) up = mul(up, -1);
  if (!isFinite(up.x)) up = V(0, 1, 0);

  // up 과 수직인 평면에서 가장 넓게 퍼진 방향을 X 축으로 삼는다
  const e1 = norm(perpInPlane(Math.abs(up.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1), up));
  const e2 = cross(up, e1);
  const c = c0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const a of m.atoms) {
    const d = sub(a.pos, c);
    const x = dot(d, e1);
    const y = dot(d, e2);
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const X = add(mul(e1, Math.cos(ang)), mul(e2, Math.sin(ang)));
  const Y = up;
  const Z = cross(X, Y);

  for (const a of m.atoms) {
    const d = sub(a.pos, c);
    a.pos = V(dot(d, X), dot(d, Y), dot(d, Z));
  }
}

export const MOLECULE_IDS = Object.keys(BUILD);
