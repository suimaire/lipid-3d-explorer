/* ============================================================
   모듈 2 확장 — 바소프레신 V1a 수용체의 Gq/11 신호전달
   vasopressin → V1a(GPCR) → Gq → PLCβ → PIP2 → IP3 + DAG
                → ER Ca2+ → calmodulin → MLCK → 평활근 수축

   ※ 여기서 다루는 것은 "바소프레신이 V1a 수용체에 결합하는 경우"의
      대표적인 예시다. 신장 집합관의 V2 수용체(Gs–cAMP–PKA–AQP2)와는
      다른 경로이며, 그 구분은 설명 패널과 docs/SCIENTIFIC_NOTES.md 에 적어 두었다.

   모듈 2의 기존 장면(PIP2 · PLC · DAG · IP3 · IP3 수용체 · Ca2+ · PKC)을
   그대로 재사용하고, 이 파일은 그 위·아래로 붙는 부분만 만든다.
   ============================================================ */

import { THREE, mat, easeInOut } from "../core/viewer.js";

/* ---------------- 색 (모듈 전체의 절제된 톤을 유지) ---------------- */

const C_VP = 0x2f5f96; // vasopressin — 짙은 청색
const C_SS = 0xc79a3e; // 이황화 결합
const C_V1A = 0x5d7f9a; // V1a 수용체 (GPCR)
const C_GA = 0x8a6bb1; // Gαq
const C_GBG = 0xa9a2bd; // Gβγ
const C_GDP = 0x9aa4ac;
const C_GTP = 0xd9663f;
const C_CAM = 0x3f7d8f; // calmodulin
const C_MLCK = 0xb4763a; // myosin light-chain kinase
const C_ACTIN = 0x9aa4ac;
const C_MYOSIN = 0x6f8494;
const C_PHOS = 0xd9663f; // 인산기

/* ---------------- 장면 안에서의 자리 ---------------- */

const V1A_COL = 8; // 원형질막에서 수용체가 들어갈 칸 (그 칸의 지질은 숨긴다)
const GQ_REST = [4.15, -0.55, 1.15];
const GA_ON = [3.05, -1.35, 1.35];
const GA_PLC = [2.55, -1.25, 1.3];
const CALM_AT = [-5.6, -1.35, 0.75];
const MLCK_REST = [-8.2, 0.25, 0.55];
const MLCK_ON = [-7.85, -2.25, 0.6];
const CONTRACT_AT = [-7.9, -3.45, 0.45];

/* ---------------- 단계 설명 ---------------- */

export const V1A_STEPS = [
  {
    tag: "V1a · 1단계",
    short: "바소프레신",
    title: "세포 바깥에 바소프레신이 도착한다",
    text:
      "바소프레신(ADH)은 뇌하수체 후엽에서 분비되는 9개 아미노산 펩타이드 호르몬입니다. 혈액을 타고 돌다가 표적 세포의 막 바깥 면에 도달합니다. 펩타이드라서 막을 통과하지 못하고, 반드시 막에 있는 수용체를 거쳐야 신호를 안으로 전할 수 있습니다.",
  },
  {
    tag: "V1a · 2단계",
    short: "V1a 수용체 결합",
    title: "혈관 평활근의 V1a 수용체에 결합한다",
    text:
      "혈관 평활근 세포의 원형질막에는 V1a 수용체가 있습니다. 막을 7번 관통하는 나선 구조를 가진 G 단백질 연결 수용체(GPCR)입니다. 바소프레신이 세포 바깥 쪽 주머니에 끼어 들어가면 수용체의 모양이 바뀝니다.",
  },
  {
    tag: "V1a · 3단계",
    short: "Gq 활성화",
    title: "세포질 쪽의 Gq/11 단백질이 활성화된다",
    text:
      "모양이 바뀐 수용체는 막 안쪽 면에 붙어 있던 Gq/11 단백질을 붙잡습니다. Gα 소단위에 붙어 있던 GDP가 GTP로 바뀌고(GDP/GTP 교환), Gαq가 Gβγ에서 떨어져 나옵니다. 이제 신호는 막 안쪽으로 넘어왔습니다.",
  },
  {
    tag: "V1a · 4단계",
    short: "PLCβ 활성화",
    title: "Gαq–GTP가 PLCβ를 활성화한다",
    text:
      "떨어져 나온 Gαq–GTP는 막 안쪽 면의 phospholipase C-β(PLCβ)에 결합해 이를 활성화합니다. 여기서부터가 앞서 배운 PIP2 핵심 과정과 정확히 같은 자리입니다 — 수용체와 G 단백질은 PLC보다 '위쪽(상류)'에 있습니다.",
  },
  {
    tag: "V1a · 5단계",
    short: "PIP2 결합",
    title: "활성화된 PLCβ가 PIP2에 붙는다",
    text:
      "활성화된 PLCβ가 막 안쪽 leaflet의 PIP2를 찾아 그 머리 부분에 결합합니다. 호르몬 한 분자가 만든 신호가 이제 막을 이루는 지질 하나에 도달했습니다.",
  },
  {
    tag: "V1a · 6단계",
    short: "PIP2 절단",
    title: "PIP2가 잘려 DAG와 IP3가 된다",
    text:
      "PLCβ는 글리세롤과 인산 사이를 끊습니다. 꼬리를 가진 쪽은 DAG, 인산 3개가 붙은 머리 쪽은 IP3가 됩니다. 하나의 막 지질에서 성질이 완전히 다른 두 개의 2차 전령(second messenger)이 동시에 생깁니다.",
  },
  {
    tag: "V1a · 7단계",
    short: "DAG · IP3",
    title: "DAG는 막에 남고 IP3는 세포질로 퍼진다",
    text:
      "DAG는 acyl chain 2개를 그대로 가지고 있어 막을 떠나지 못하고 막 안에서 옆으로 움직입니다. IP3는 인산이 3개나 붙어 친수성이 매우 커서 막에 머물지 못하고 세포질로 확산합니다. 같은 분자에서 나왔지만 가는 길이 갈립니다.",
  },
  {
    tag: "V1a · 8단계",
    short: "IP3 수용체",
    title: "IP3가 ER 막의 IP3 수용체에 결합한다",
    text:
      "세포질로 퍼진 IP3는 소포체(ER) 막의 IP3 수용체에 결합합니다. 이 수용체는 그 자체가 Ca2+ 통로입니다. 원형질막에서 시작된 신호가 세포 안쪽의 다른 막으로 옮겨 갔습니다.",
  },
  {
    tag: "V1a · 9단계",
    short: "Ca2+ 방출",
    title: "ER에 저장돼 있던 Ca2+가 세포질로 나온다",
    text:
      "통로가 열리면서 ER lumen에 높은 농도로 저장돼 있던 Ca2+가 농도 기울기를 따라 세포질로 쏟아져 나옵니다. 세포질 Ca2+ 농도가 빠르게 올라가고, 이 Ca2+ 자체가 다음 단계의 신호가 됩니다.",
  },
  {
    tag: "V1a · 10단계",
    short: "PKC (병렬)",
    title: "DAG와 Ca2+는 PKC도 활성화한다",
    text:
      "막에 남은 DAG와 세포질로 나온 Ca2+가 함께 PKC를 막으로 불러 활성화합니다. 이것은 수축으로 가는 길과 나란히 진행되는 별개의 가지(branch)입니다. PKC는 여러 표적 단백질을 인산화해 수축 신호의 세기와 다른 세포 반응을 함께 조절합니다.",
  },
  {
    tag: "V1a · 11단계",
    short: "Ca2+–칼모듈린",
    title: "Ca2+가 칼모듈린에 결합한다",
    text:
      "수축으로 가는 주된 길은 여기서 시작됩니다. 세포질에 늘어난 Ca2+는 칼모듈린(calmodulin)에 결합합니다. Ca2+ 4개가 붙은 칼모듈린은 모양이 바뀌어, 다른 단백질을 붙잡을 수 있는 상태가 됩니다.",
  },
  {
    tag: "V1a · 12단계",
    short: "MLCK → 인산화",
    title: "Ca2+–칼모듈린이 MLCK를 활성화한다",
    text:
      "Ca2+–칼모듈린 복합체가 MLCK(myosin light-chain kinase)에 결합해 활성화합니다. 활성화된 MLCK는 미오신의 조절 경쇄(regulatory light chain, RLC)에 인산기를 붙입니다. 이 인산화가 수축의 실질적인 스위치입니다.",
  },
  {
    tag: "V1a · 13단계",
    short: "수축 · 전체 복습",
    title: "액틴–미오신 상호작용이 늘어나 평활근이 수축한다",
    text:
      "RLC가 인산화되면 미오신 머리가 액틴과 상호작용할 수 있게 되고, 액틴이 미오신 위를 미끄러지며 세포가 짧아집니다. 혈관 평활근이 수축하면 혈관 지름이 줄어듭니다(혈관 수축). 막의 작은 지질 하나를 자른 반응이, 호르몬 → 수용체 → G 단백질 → 효소 → 2차 전령 → 단백질 활성화 → 세포 반응이라는 계단을 거쳐 결국 혈관의 굵기를 바꾼 것입니다.",
  },
];

/* ============================================================
   장면 만들기
   ============================================================ */

/**
 * @param {object} ctx
 *   root      : 모듈 2의 최상위 THREE.Group
 *   labels    : viewer.labels
 *   geom      : { PM_OUTER_Y, PM_INNER_Y, ER_CYTO_Y, ER_LUMEN_Y, PIP2_Z, RECEPTOR_X, SX, COLS }
 *   refs      : { pip2, dag, ip3, plc, pkc, receptor }
 *   membrane  : { setWide(on), setColumnHidden(col, hidden) }
 */
export function createVasopressinScene({ root, labels, geom, refs, membrane }) {
  const { PM_OUTER_Y, PM_INNER_Y, PIP2_Z, RECEPTOR_X } = geom;
  const V1A_X = (V1A_COL - (geom.COLS - 1) / 2) * geom.SX;

  const group = new THREE.Group();
  group.visible = false;
  root.add(group);

  /* ---------- 바소프레신 (9개 아미노산 펩타이드) ---------- */
  const vp = buildVasopressin();
  group.add(vp);

  /* ---------- V1a 수용체 (7회 막관통 GPCR) ---------- */
  const tmHeight = PM_OUTER_Y - PM_INNER_Y + 1.5;
  const v1a = buildV1a(tmHeight);
  v1a.position.set(V1A_X, (PM_OUTER_Y + PM_INNER_Y) / 2, 0);
  group.add(v1a);

  /* ---------- Gq/11 (Gα + Gβγ) ---------- */
  const gq = new THREE.Group();
  gq.position.set(GQ_REST[0], GQ_REST[1], GQ_REST[2]);
  group.add(gq);
  const gbg = buildLobes(C_GBG, [[0, 0, 0, 0.34], [0.42, 0.2, 0.12, 0.27]]);
  gq.add(gbg);

  const ga = new THREE.Group(); // Gα 는 떨어져 나가므로 group 바로 아래에 둔다
  ga.position.set(GQ_REST[0] - 0.42, GQ_REST[1] + 0.42, GQ_REST[2] + 0.2);
  group.add(ga);
  ga.add(buildLobes(C_GA, [[0, 0, 0, 0.46]]));
  const gdp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(C_GDP, { rough: 0.4 }));
  gdp.position.set(0.3, -0.28, 0.28);
  ga.add(gdp);
  const gtp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(C_GTP, { rough: 0.35 }));
  gtp.position.copy(gdp.position);
  gtp.visible = false;
  ga.add(gtp);

  /* ---------- 칼모듈린 ---------- */
  const calm = new THREE.Group();
  calm.position.set(CALM_AT[0], CALM_AT[1], CALM_AT[2]);
  group.add(calm);
  const calmIdle = mat(C_CAM, { rough: 0.5 });
  const calmOn = mat(C_CAM, { rough: 0.42, emissive: 0x123c44, emissiveIntensity: 0.5 });
  const calmParts = [];
  for (const x of [-0.46, 0.46]) {
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), calmIdle);
    lobe.position.x = x;
    calm.add(lobe);
    calmParts.push(lobe);
  }
  const linker = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.66, 8), calmIdle);
  linker.rotation.z = Math.PI / 2;
  calm.add(linker);
  calmParts.push(linker);
  const calmCa = []; // 칼모듈린에 붙는 Ca2+ 4개
  for (const [x, y] of [[-0.5, 0.3], [-0.5, -0.3], [0.5, 0.3], [0.5, -0.3]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0x2f8f7a, { rough: 0.3 }));
    b.position.set(x, y, 0.3);
    b.visible = false;
    calm.add(b);
    calmCa.push(b);
  }

  /* ---------- MLCK ---------- */
  const mlck = new THREE.Group();
  mlck.position.set(MLCK_REST[0], MLCK_REST[1], MLCK_REST[2]);
  group.add(mlck);
  const mlckIdle = mat(C_MLCK, { rough: 0.55 });
  const mlckOn = mat(C_MLCK, { rough: 0.45, emissive: 0x4a2c0c, emissiveIntensity: 0.5 });
  const mlckParts = [];
  {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), mlckIdle);
    core.scale.set(1, 0.82, 0.9);
    mlck.add(core);
    mlckParts.push(core);
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), mlckIdle);
    lobe.position.set(0.42, 0.4, 0.14);
    mlck.add(lobe);
    mlckParts.push(lobe);
  }

  /* ---------- 액틴–미오신 수축 단위 ---------- */
  const contractile = buildContractile();
  contractile.position.set(CONTRACT_AT[0], CONTRACT_AT[1], CONTRACT_AT[2]);
  group.add(contractile);

  /* ---------------- 라벨 ---------------- */

  const L = labels;
  const lab = {
    vp: L.add("바소프레신 (펩타이드 호르몬)", {
      anchor: vp, offset: new THREE.Vector3(0, 1.3, 0), variant: "accent", group: "vpL",
    }),
    v1a: L.add("V1a 수용체 — 7회 막관통 GPCR", {
      anchor: new THREE.Vector3(V1A_X, PM_OUTER_Y - 1.4, 0),
      offset: new THREE.Vector3(3.4, 0, 0), variant: "accent", group: "v1aL",
    }),
    gq: L.add("Gq/11 — Gαq가 GTP를 잡고 떨어져 나온다", {
      anchor: ga, offset: new THREE.Vector3(2.7, 0.9, 0), variant: "accent", group: "gqL",
    }),
    gaPlc: L.add("Gαq–GTP가 PLCβ를 활성화", {
      anchor: ga, offset: new THREE.Vector3(2.5, -1.1, 0), variant: "accent", group: "gaPlcL",
    }),
    calm: L.add("칼모듈린 + Ca2+ 4개", {
      anchor: calm, offset: new THREE.Vector3(0, 1.35, 0), variant: "accent", group: "calmL",
    }),
    mlck: L.add("MLCK 활성화 → 미오신 경쇄 인산화", {
      anchor: mlck, offset: new THREE.Vector3(-0.4, 1.4, 0), variant: "accent", group: "mlckL",
    }),
    con: L.add("액틴–미오신 상호작용 ↑ → 평활근 수축", {
      anchor: contractile, offset: new THREE.Vector3(0, -1.5, 0), variant: "accent", group: "conL",
    }),
    note: L.add("펩타이드는 막을 통과하지 못한다 → 수용체가 필요", {
      anchor: vp, offset: new THREE.Vector3(0, -1.4, 0), variant: "anno", group: "vpL",
    }),
  };

  // 마지막 복습 장면 전용 — 짧은 라벨만 골라 겹치지 않게 배치한다
  const sum = [
    ["vasopressin", 5.4, 9.8],
    ["V1a (GPCR)", 6.2, 2.3],
    ["Gq → PLCβ", 5.0, -1.0],
    ["PIP2 → DAG + IP3", -1.0, 2.7],
    ["DAG → PKC", -3.4, -0.7],
    ["ER → Ca2+", 1.4, -4.6],
    ["Ca2+–CaM → MLCK", -7.4, 1.9],
    ["평활근 수축", -8.0, -4.7],
  ].map(([t, x, y]) =>
    L.add(t, { anchor: new THREE.Vector3(x, y, 0), variant: "accent", group: "sum" })
  );

  /* ---------------- 단계별 목표 상태 ---------------- */

  const OVERVIEW = { radius: 31, phi: 1.5, theta: 0.34, target: new THREE.Vector3(-2.2, -1.0, 0) };

  const VP_FAR = [V1A_X, PM_OUTER_Y + 5.0, 1.3];
  const VP_BOUND = [V1A_X, PM_OUTER_Y + 1.35, 0.3];

  const DAG_HOME = [0, PM_INNER_Y + 0.1, PIP2_Z];

  /** 확장 모드 전용 상태(핵심 7단계 장면에는 영향을 주지 않는다) */
  const EXT = [
    { vp: VP_FAR, bound: 0, ga: null, gtp: 0, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: null, gtp: 0, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_ON, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 0, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 1, mlck: 0, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 1, mlck: 1, phos: 0, contract: 0 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 2, mlck: 1, phos: 0, contract: 0, ions: 4 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 2, mlck: 2, phos: 1, contract: 0, ions: 4 },
    { vp: VP_BOUND, bound: 1, ga: GA_PLC, gtp: 1, cm: 2, mlck: 2, phos: 1, contract: 1, ions: 4 },
  ];

  /** 핵심 7단계와 같은 모양의 계획 — go() 가 그대로 처리한다 */
  const PLAN = [
    {
      plc: [4.6, -2.6, 1.7], pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: vp,
      cam: { radius: 24, phi: 1.47, theta: 0.34, target: new THREE.Vector3(2.4, 6.4, 0) },
      groups: ["zone", "vpL"],
    },
    {
      plc: [4.6, -2.6, 1.7], pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: v1a,
      cam: { radius: 18, phi: 1.46, theta: 0.38, target: new THREE.Vector3(V1A_X - 0.4, 5.6, 0) },
      groups: ["zone", "vpL", "v1aL"],
    },
    {
      plc: [4.6, -2.6, 1.7], pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: ga,
      cam: { radius: 19, phi: 1.45, theta: 0.42, target: new THREE.Vector3(V1A_X - 0.6, 1.4, 0) },
      groups: ["zone", "v1aL", "gqL"],
    },
    {
      plc: [2.0, -1.3, 1.4], pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: refs.plc,
      cam: { radius: 20, phi: 1.45, theta: 0.42, target: new THREE.Vector3(1.8, 0.6, 0) },
      groups: ["zone", "gaPlcL", "plc"],
    },
    {
      plc: [0.7, -0.9, 0.9], pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: refs.pip2,
      cam: { radius: 16, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.3, 2.6, 0) },
      groups: ["zone", "s0", "plc"],
    },
    {
      plc: [1.7, -1.3, 1.9], pip2: false,
      dag: DAG_HOME, dagFrom: DAG_HOME,
      ip3: [-1.1, -0.5, PIP2_Z + 0.4], ip3From: [0, PM_INNER_Y - 0.5, PIP2_Z],
      open: 0, release: false, pkc: null, focus: refs.ip3,
      cam: { radius: 16, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.2, 2.4, 0) },
      groups: ["zone", "plc", "cut", "dagL", "ip3L"],
    },
    {
      plc: [3.0, -2.0, 1.4], pip2: false,
      dag: [-1.6, PM_INNER_Y + 0.1, PIP2_Z], ip3: [0.9, -2.6, 0.9],
      open: 0, release: false, pkc: null, focus: refs.ip3,
      cam: { radius: 21, phi: 1.44, theta: 0.42, target: new THREE.Vector3(0, 0.6, 0) },
      groups: ["zone", "dagL", "ip3L"],
    },
    {
      plc: [3.6, -2.2, 1.6], pip2: false,
      dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.0, 0.15],
      open: 0, release: false, pkc: null, focus: refs.receptor,
      cam: { radius: 20, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.6, -2.2, 0) },
      groups: ["zone", "dagL", "ip3L", "rec"],
    },
    {
      plc: [3.6, -2.2, 1.6], pip2: false,
      dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: null, focus: refs.receptor,
      cam: { radius: 21, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.4, -4.2, 0) },
      groups: ["zone", "rec", "ca"],
    },
    {
      plc: [3.8, -2.4, 1.8], pip2: false,
      dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5], focus: refs.pkc,
      cam: { radius: 24, phi: 1.44, theta: 0.4, target: new THREE.Vector3(-1.4, -0.8, 0) },
      groups: ["zone", "dagL", "ca", "pkc"],
    },
    {
      plc: [3.8, -2.4, 1.8], pip2: false,
      dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5], focus: calm,
      cam: { radius: 23, phi: 1.45, theta: 0.36, target: new THREE.Vector3(-4.4, -1.6, 0) },
      groups: ["zone", "ca", "calmL"],
    },
    {
      plc: [3.8, -2.4, 1.8], pip2: false,
      dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5], focus: mlck,
      cam: { radius: 23, phi: 1.45, theta: 0.36, target: new THREE.Vector3(-7.2, -2.2, 0) },
      groups: ["zone", "calmL", "mlckL"],
    },
    {
      plc: [3.8, -2.4, 1.8], pip2: false,
      dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5], focus: contractile,
      cam: OVERVIEW,
      groups: ["zone", "sum"],
    },
  ];

  /* ---------------- 상태 적용 ---------------- */

  let contractAmount = 0;
  let ionsDiverted = false;

  function setBound(on) {
    // 결합하면 나선 다발이 아주 살짝 벌어지고 재질이 밝아진다(과장하지 않는다)
    v1a.userData.setActive(on);
  }

  function setContract(t) {
    contractAmount = t;
    contractile.userData.setContract(t);
  }

  /**
   * @param {number} i  확장 모드의 단계 번호
   * @param {object} a  { animate, tw, moveTo, moveIons, timing }
   */
  function apply(i, a) {
    const e = EXT[i];

    if (e.vp) {
      if (!vp.visible) {
        vp.visible = true;
        vp.position.set(e.vp[0], e.vp[1], e.vp[2]);
      }
      a.moveTo(vp, e.vp, a.animate);
    } else {
      vp.visible = false;
    }

    setBound(!!e.bound);
    gdp.visible = !e.gtp;
    gtp.visible = !!e.gtp;

    const gaTo = e.ga || [GQ_REST[0] - 0.42, GQ_REST[1] + 0.42, GQ_REST[2] + 0.2];
    a.moveTo(ga, gaTo, a.animate);

    calm.visible = e.cm > 0;
    for (const p of calmParts) p.material = e.cm >= 2 ? calmOn : calmIdle;
    for (const b of calmCa) b.visible = e.cm >= 2;

    mlck.visible = e.mlck > 0;
    for (const p of mlckParts) p.material = e.mlck >= 2 ? mlckOn : mlckIdle;
    if (e.mlck > 0) a.moveTo(mlck, e.mlck >= 2 ? MLCK_ON : MLCK_REST, a.animate);

    contractile.visible = e.mlck > 0 || e.contract > 0 || e.cm > 0;
    contractile.userData.setPhospho(!!e.phos);

    const from = contractAmount;
    const to = e.contract;
    if (a.animate && from !== to) {
      a.tw(a.timing.move, (t) => setContract(from + (to - from) * easeInOut(t)));
    } else {
      setContract(to);
    }

    // Ca2+ 몇 개를 칼모듈린 쪽으로 보낸다(양을 늘리지 않고 방향만 보여 준다)
    if (e.ions && !ionsDiverted) {
      ionsDiverted = true;
      a.moveIons(e.ions, CALM_AT, a.animate);
    } else if (!e.ions && ionsDiverted) {
      ionsDiverted = false;
      a.moveIons(0, CALM_AT, a.animate);
    }
  }

  function setActive(on) {
    group.visible = on;
    membrane.setWide(on);
    membrane.setColumnHidden(V1A_COL, on);
    if (!on) reset();
  }

  function reset() {
    vp.visible = false;
    vp.position.set(VP_FAR[0], VP_FAR[1], VP_FAR[2]);
    setBound(false);
    ga.position.set(GQ_REST[0] - 0.42, GQ_REST[1] + 0.42, GQ_REST[2] + 0.2);
    gdp.visible = true;
    gtp.visible = false;
    calm.visible = false;
    calm.position.set(CALM_AT[0], CALM_AT[1], CALM_AT[2]);
    for (const p of calmParts) p.material = calmIdle;
    for (const b of calmCa) b.visible = false;
    mlck.visible = false;
    mlck.position.set(MLCK_REST[0], MLCK_REST[1], MLCK_REST[2]);
    for (const p of mlckParts) p.material = mlckIdle;
    contractile.visible = false;
    contractile.userData.setPhospho(false);
    setContract(0);
    ionsDiverted = false;
  }

  reset();

  return {
    steps: V1A_STEPS,
    plan: PLAN,
    overview: OVERVIEW,
    labels: lab,
    summaryLabels: sum,
    apply,
    setActive,
    reset,
  };
}

/* ---------------- 부품 빌더 ---------------- */

function buildVasopressin() {
  // 9개 아미노산 — 6잔기 고리(이황화 결합으로 닫힘) + 3잔기 꼬리
  const g = new THREE.Group();
  const m = mat(C_VP, { rough: 0.45 });
  const geo = new THREE.SphereGeometry(0.17, 10, 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(geo, m);
    b.position.set(Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0);
    g.add(b);
  }
  const ss = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), mat(C_SS, { rough: 0.4 }));
  ss.rotation.z = Math.PI / 2;
  g.add(ss);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m);
    b.position.set(0.3 + i * 0.3, -0.52 - i * 0.24, 0.06);
    g.add(b);
  }
  g.scale.setScalar(1.0);
  return g;
}

function buildV1a(height) {
  const g = new THREE.Group();
  const idle = mat(C_V1A, { rough: 0.5 });
  const active = mat(C_V1A, { rough: 0.42, emissive: 0x16394f, emissiveIntensity: 0.55 });
  const helices = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, height, 8), idle);
    h.userData.a = a;
    g.add(h);
    helices.push(h);
  }
  const pocket = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.09, 8, 16), idle);
  pocket.rotation.x = Math.PI / 2;
  pocket.position.y = height / 2 - 0.25;
  g.add(pocket);

  g.userData.setActive = (on) => {
    const r = on ? 0.62 : 0.54;
    const tilt = on ? 0.1 : 0.05;
    for (const h of helices) {
      const a = h.userData.a;
      h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      h.rotation.z = Math.cos(a) * tilt;
      h.rotation.x = -Math.sin(a) * tilt;
      h.material = on ? active : idle;
    }
    pocket.material = on ? active : idle;
  };
  g.userData.setActive(false);
  return g;
}

function buildLobes(color, specs) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.55 });
  for (const [x, y, z, r] of specs) {
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
    lobe.position.set(x, y, z);
    g.add(lobe);
  }
  return g;
}

function buildContractile() {
  /* 액틴–미오신 수축 단위(도식).
     평활근은 골격근 같은 sarcomere 가 아니라 dense body 에 액틴이 붙지만,
     "액틴이 미오신 위를 미끄러져 세포가 짧아진다"는 관계를 보이기 위한 단순화다. */
  const g = new THREE.Group();
  const myoM = mat(C_MYOSIN, { rough: 0.5 });
  const actM = mat(C_ACTIN, { rough: 0.55 });
  const bodyM = mat(0x8e9298, { rough: 0.5 });
  const phosM = mat(C_PHOS, { rough: 0.35 });

  const thick = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.6, 10), myoM);
  thick.rotation.z = Math.PI / 2;
  g.add(thick);

  // 미오신 머리(cross-bridge)와 조절 경쇄(RLC)
  const heads = [];
  const phos = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.95 + i * 0.63;
    const up = i % 2 === 0 ? 1 : -1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), myoM);
    head.position.set(x, up * 0.3, 0.08);
    g.add(head);
    heads.push(head);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), phosM);
    p.position.set(x + 0.1, up * 0.5, 0.16);
    p.visible = false;
    g.add(p);
    phos.push(p);
  }

  // 액틴 가는 필라멘트 + 양쪽 dense body
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 8), actM);
    fil.rotation.z = Math.PI / 2;
    fil.position.set(side * -1.0, 0, 0.34);
    arm.add(fil);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.7), bodyM);
    body.position.set(0, 0, 0.34);
    arm.add(body);
    arm.position.x = side * 2.4;
    g.add(arm);
    arms.push({ arm, side });
  }

  g.userData.setContract = (t) => {
    for (const { arm, side } of arms) arm.position.x = side * (2.4 - 0.8 * t);
    for (let i = 0; i < heads.length; i++) {
      heads[i].position.z = 0.08 + t * 0.16;
    }
  };
  g.userData.setPhospho = (on) => {
    for (const p of phos) p.visible = on;
  };
  g.userData.setContract(0);
  g.userData.setPhospho(false);
  return g;
}
