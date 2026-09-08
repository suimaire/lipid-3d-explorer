/* ============================================================
   지질 데이터 + 3D 모델 빌더
   교육용 단순화 모델: 머리(head) = 구, 꼬리(tail) = 원기둥 사슬
   ============================================================ */

import { THREE, mat } from "./viewer.js";

/* ---------- 색 팔레트 (절제된 톤, 형광색 배제) ---------- */

export const COLOR = {
  PC: 0x4b7fb5, // steel blue
  PE: 0x74a06a, // sage
  PS: 0xc0552f, // terracotta — 핵심 구조
  PI: 0x8a6bb1, // muted purple
  PIP2: 0xa8386c, // deep rose — 핵심 구조
  SM: 0xd0a244, // ochre
  CHOL: 0x8e9298, // gray
  TAIL: 0xc3c9ce,
  TAIL_SM: 0xd6cdb8,
  BACKBONE: 0x9aa4ac,
  PHOSPHATE: 0xd9663f,
  DIM: 0xdfe4e8,
  WATER: 0xd7e6ef,
};

/* ---------- 지질 정보 (설명 패널용) ---------- */

export const LIPIDS = [
  {
    id: "PC",
    abbr: "PC",
    name: "Phosphatidylcholine",
    ko: "포스파티딜콜린",
    color: COLOR.PC,
    backbone: "글리세롤 (glycerophospholipid)",
    head: "포스포콜린 (phosphocholine)",
    charge: "쌍성 이온(zwitterionic) — 알짜 전하는 거의 0",
    leaflet: "바깥쪽(outer) leaflet에 상대적으로 많음",
    role: "막의 뼈대를 이루는 가장 흔한 인지질. 원통에 가까운 모양이라 평평한 이중층을 잘 만든다.",
  },
  {
    id: "PE",
    abbr: "PE",
    name: "Phosphatidylethanolamine",
    ko: "포스파티딜에탄올아민",
    color: COLOR.PE,
    backbone: "글리세롤 (glycerophospholipid)",
    head: "포스포에탄올아민 (phosphoethanolamine)",
    charge: "쌍성 이온 — 알짜 전하는 거의 0",
    leaflet: "안쪽(inner) leaflet에 상대적으로 많음",
    role: "머리가 작아 원뿔에 가까운 모양. 막이 휘거나 융합·분리될 때 유리하게 작용한다.",
  },
  {
    id: "PS",
    abbr: "PS",
    name: "Phosphatidylserine",
    ko: "포스파티딜세린",
    color: COLOR.PS,
    backbone: "글리세롤 (glycerophospholipid)",
    head: "포스포세린 (phosphoserine)",
    charge: "알짜 음전하(−)를 띤다",
    leaflet: "건강한 세포에서는 거의 안쪽(inner) leaflet에만 있음",
    role: "안쪽 막면에 음전하를 만들어 단백질을 불러 모은다. 바깥으로 노출되면 세포 상태 변화의 신호가 된다.",
  },
  {
    id: "PI",
    abbr: "PI",
    name: "Phosphatidylinositol",
    ko: "포스파티딜이노시톨",
    color: COLOR.PI,
    backbone: "글리세롤 (glycerophospholipid)",
    head: "이노시톨 고리 (myo-inositol)",
    charge: "알짜 음전하(−)",
    leaflet: "안쪽(inner) leaflet",
    role: "양은 적지만 이노시톨 고리에 인산이 붙으면서 여러 신호 지질(phosphoinositide)의 출발점이 된다.",
  },
  {
    id: "PIP2",
    abbr: "PIP2",
    name: "Phosphatidylinositol 4,5-bisphosphate",
    ko: "PIP2 (포스파티딜이노시톨 4,5-이인산)",
    color: COLOR.PIP2,
    backbone: "글리세롤 (glycerophospholipid)",
    head: "이노시톨 고리 + 인산 2개(4번·5번 위치)",
    charge: "강한 음전하(−−−)",
    leaflet: "안쪽(inner) leaflet에만 존재",
    role: "막 전체에서 차지하는 양은 매우 적지만, PLC에 잘리면 IP3와 DAG라는 두 신호 분자가 된다. (모듈 2)",
  },
  {
    id: "SM",
    abbr: "SM",
    name: "Sphingomyelin",
    ko: "스핑고미엘린",
    color: COLOR.SM,
    backbone: "스핑고신 (sphingolipid) — 글리세롤이 아니다",
    head: "포스포콜린 (PC와 같은 머리)",
    charge: "쌍성 이온 — 알짜 전하는 거의 0",
    leaflet: "바깥쪽(outer) leaflet에 상대적으로 많음",
    role: "포화도가 높은 곧은 꼬리를 가져 콜레스테롤과 함께 비교적 질서 있는 영역을 만든다.",
  },
  {
    id: "CHOL",
    abbr: "Chol",
    name: "Cholesterol",
    ko: "콜레스테롤",
    color: COLOR.CHOL,
    backbone: "네 고리가 붙은 단단한 스테로이드 골격",
    head: "−OH 하나뿐인 아주 작은 극성 머리",
    charge: "전하 없음 (거의 비극성)",
    leaflet: "양쪽 leaflet 모두에 존재",
    role: "인지질 사이 틈에 끼어 들어가 막의 유동성과 질서를 조절한다. 막의 정상적인 구성 성분이며 그 자체로 나쁜 물질이 아니다.",
  },
];

export const LIPID_BY_ID = Object.fromEntries(LIPIDS.map((l) => [l.id, l]));

/* ---------- 공유 지오메트리 (성능) ---------- */

const G = {
  head: new THREE.SphereGeometry(1, 14, 10),
  bead: new THREE.SphereGeometry(1, 10, 8),
  tail: new THREE.CylinderGeometry(1, 1, 1, 7, 1),
  ring: new THREE.BoxGeometry(1, 1, 1),
  plate: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
};

export const GEO = G;

function sphere(r, m, x, y, z) {
  const s = new THREE.Mesh(G.head, m);
  s.scale.setScalar(r);
  s.position.set(x, y, z);
  return s;
}

function bead(r, m, x, y, z) {
  const s = new THREE.Mesh(G.bead, m);
  s.scale.setScalar(r);
  s.position.set(x, y, z);
  return s;
}

/** y0 → y1 로 뻗는 꼬리 세그먼트 */
function seg(m, x, y0, y1, z, r) {
  const h = Math.abs(y1 - y0);
  const c = new THREE.Mesh(G.tail, m);
  c.scale.set(r, h, r);
  c.position.set(x, (y0 + y1) / 2, z);
  return c;
}

/**
 * 지질 하나를 만든다. 로컬 좌표에서 머리는 y=0, 꼬리는 -y 방향.
 * @param {string} id  PC/PE/PS/PI/PIP2/SM/CHOL
 * @param {object} opt { scale, detail }
 * @returns {THREE.Group} group.userData.parts = {head, tails[], anchors{}}
 */
export function buildLipid(id, opt = {}) {
  const s = opt.scale ?? 1;
  const g = new THREE.Group();
  const info = LIPID_BY_ID[id];
  const headMat = mat(info.color, { rough: 0.4 });
  const tailMat = mat(id === "SM" ? COLOR.TAIL_SM : COLOR.TAIL, { rough: 0.6 });
  const boneMat = mat(COLOR.BACKBONE, { rough: 0.5 });
  const pMat = mat(COLOR.PHOSPHATE, { rough: 0.35 });

  const parts = { heads: [], tails: [], extras: [], anchors: {} };
  g.userData.parts = parts;
  g.userData.lipid = id;

  if (id === "CHOL") {
    // 작은 -OH 머리 + 단단한 네 고리 골격 + 짧은 꼬리
    const oh = bead(0.16, mat(0xcf6b4a, { rough: 0.35 }), 0, 0, 0);
    parts.heads.push(oh);
    parts.anchors.head = new THREE.Vector3(0, 0.16, 0);
    g.add(oh);

    const ringMat = mat(COLOR.CHOL, { rough: 0.5 });
    const plate = new THREE.Mesh(G.plate, ringMat);
    plate.scale.set(0.3, 1.0, 0.16);
    plate.position.set(0, -0.62, 0);
    parts.extras.push(plate);
    g.add(plate);
    const plate2 = new THREE.Mesh(G.plate, ringMat);
    plate2.scale.set(0.24, 0.55, 0.15);
    plate2.position.set(0.06, -1.35, 0);
    parts.extras.push(plate2);
    g.add(plate2);
    parts.anchors.ring = new THREE.Vector3(0, -0.7, 0);

    const t = seg(tailMat, 0.06, -1.6, -2.25, 0, 0.055);
    parts.tails.push(t);
    g.add(t);
    parts.anchors.tail = new THREE.Vector3(0.06, -2.0, 0);

    g.scale.setScalar(s);
    return g;
  }

  // --- 머리 그룹 ---
  const headR = id === "PIP2" || id === "PI" ? 0.34 : 0.3;
  const head = sphere(headR, headMat, 0, 0, 0);
  parts.heads.push(head);
  g.add(head);
  parts.anchors.head = new THREE.Vector3(0, headR + 0.12, 0);

  if (id === "PS") {
    // 카르복실기 하나 → 알짜 음전하
    const carb = bead(0.11, mat(0xd9663f, { rough: 0.35 }), 0.24, 0.1, 0.12);
    parts.extras.push(carb);
    g.add(carb);
    parts.anchors.charge = new THREE.Vector3(0.24, 0.22, 0.12);
  }
  if (id === "PIP2") {
    // 4번·5번 인산
    const p1 = bead(0.13, pMat, 0.3, 0.14, 0.1);
    const p2 = bead(0.13, pMat, -0.24, 0.2, -0.14);
    parts.extras.push(p1, p2);
    g.add(p1, p2);
    parts.anchors.charge = new THREE.Vector3(0.05, 0.5, 0);
  }

  // --- 인산 다리 (phosphodiester) ---
  const phos = bead(0.13, pMat, 0, -0.34, 0);
  parts.extras.push(phos);
  g.add(phos);
  parts.anchors.phosphate = new THREE.Vector3(0.28, -0.34, 0);

  // --- 골격 (글리세롤 또는 스핑고신) ---
  const bone = seg(boneMat, 0, -0.46, -0.72, 0, 0.085);
  parts.extras.push(bone);
  g.add(bone);
  parts.anchors.backbone = new THREE.Vector3(0.26, -0.6, 0);

  // --- 꼬리 2개 ---
  const straight = id === "SM"; // 포화도 높은 곧은 꼬리 표현
  const dx = 0.135;
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? -dx : dx;
    const kink = straight ? 0 : i === 1 ? 0.09 : -0.05;
    const a = seg(tailMat, x, -0.74, -1.5, 0, 0.075);
    const b = seg(tailMat, x + kink, -1.5, -2.1, kink * 0.6, 0.07);
    const c = seg(tailMat, x + kink * 1.4, -2.1, -2.55, kink, 0.062);
    parts.tails.push(a, b, c);
    g.add(a, b, c);
  }
  parts.anchors.tail = new THREE.Vector3(0, -2.0, 0);

  g.scale.setScalar(s);
  return g;
}

/** 지질 그룹의 색을 통째로 바꾼다(강조/흐림 처리). */
export function tintLipid(group, { headColor, tailColor, opacity }) {
  const parts = group.userData.parts;
  if (!parts) return;
  if (headColor !== undefined) {
    const m = mat(headColor, { rough: 0.4, opacity: opacity ?? 1 });
    for (const h of parts.heads) h.material = m;
  }
  if (tailColor !== undefined) {
    const m = mat(tailColor, { rough: 0.6, opacity: opacity ?? 1 });
    for (const t of parts.tails) t.material = m;
  }
}

/** 원래 색으로 되돌린다. */
export function restoreLipid(group) {
  const id = group.userData.lipid;
  const info = LIPID_BY_ID[id];
  const parts = group.userData.parts;
  if (!info || !parts) return;
  if (id === "CHOL") {
    const ohm = mat(0xcf6b4a, { rough: 0.35 });
    for (const h of parts.heads) h.material = ohm;
    const rm = mat(COLOR.CHOL, { rough: 0.5 });
    for (const e of parts.extras) e.material = rm;
    const tm = mat(COLOR.TAIL, { rough: 0.6 });
    for (const t of parts.tails) t.material = tm;
    return;
  }
  const hm = mat(info.color, { rough: 0.4 });
  for (const h of parts.heads) h.material = hm;
  const tm = mat(id === "SM" ? COLOR.TAIL_SM : COLOR.TAIL, { rough: 0.6 });
  for (const t of parts.tails) t.material = tm;
}

/** 물 분자를 암시하는 옅은 점들 (수용액 쪽) */
export function waterField(count, box, seedFn) {
  const geo = new THREE.SphereGeometry(0.09, 6, 5);
  const m = mat(COLOR.WATER, { rough: 0.9, opacity: 0.75 });
  const inst = new THREE.InstancedMesh(geo, m, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      (seedFn() - 0.5) * box.x,
      box.y0 + seedFn() * (box.y1 - box.y0),
      (seedFn() - 0.5) * box.z
    );
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/** 재현 가능한 난수 (매번 같은 막이 나오도록) */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
