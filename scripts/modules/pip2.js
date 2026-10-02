/* ============================================================
   모듈 2 — 세포막 인지질과 PIP2 신호전달
   PIP2 → (PLC) → DAG(막에 남음) + IP3(세포질로 확산) → ER Ca2+ 방출

   두 가지 모드가 같은 장면을 공유한다.
     core : PIP2 핵심 7단계 (지질 하나가 잘려 두 신호가 되는 과정)
     v1a  : 생리학적 확장 — 바소프레신 V1a 수용체 → 혈관 평활근 수축
            (scripts/modules/pip2-vasopressin.js 가 위·아래에 붙는 부분을 만든다)
   ============================================================ */

import { Viewer, THREE, mat, easeInOut, easeOut, REDUCED_MOTION } from "../core/viewer.js";
import { COLOR, buildLipid, rng } from "../core/lipids.js";
import { createVasopressinScene } from "./pip2-vasopressin.js";

const PM_OUTER_Y = 6.6;
const PM_INNER_Y = 1.2;
const ER_CYTO_Y = -5.0;
const ER_LUMEN_Y = -9.3;
const COLS = 11;
const ROWS = 3;
const SX = 1.06;
const SZ = 1.06;

// 확장 모드에서만 켜지는 좌측 연장 구간 — "세포 안"이라는 느낌을 넓혀 준다
const WIDE_PM_COLS = [-5, -4, -3, -2, -1];
const WIDE_ER_COLS = [-6, -5, -4, -3, -2, -1];

const C_DAG = 0xc98a2e;
const C_IP3 = 0xa8386c;
const C_PLC = 0x7c8fa0;
const C_PKC = 0x3f7d6b;
const C_CA = 0x2f8f7a;
const C_RECEPTOR = 0x6f8494;

/* ------------------------------------------------------------
   애니메이션 타이밍 — 값은 모두 여기 한곳에서 관리한다.
   수업에서 교사가 설명을 붙일 수 있도록 예전(단계당 3.6초 고정)보다
   약 1.5~1.9배 느리게 잡았다. 각 단계는
       "분자가 움직이는 시간(motion)" + "결과를 보는 시간(hold)"
   으로 나뉘고, motion 은 그 단계에서 실제로 만들어진 tween 중
   가장 긴 것으로 자동 계산한다.
   prefers-reduced-motion 환경에서는 이동 시간을 0에 가깝게 두고
   hold 만 남겨, 상태 변화는 그대로 확인할 수 있게 한다.
   ------------------------------------------------------------ */
export const PIP2_TIMING = {
  cameraFly: REDUCED_MOTION ? 0 : 1.0, // ▶ 재생 시 overview 로 넘어가는 시간
  move: REDUCED_MOTION ? 0.001 : 1.7, // 분자 이동
  channelOpen: REDUCED_MOTION ? 0.001 : 1.2, // IP3 수용체가 열리는 시간
  release: REDUCED_MOTION ? 0.001 : 2.0, // Ca2+ 하나가 lumen → 세포질로 가는 시간
  releaseStagger: REDUCED_MOTION ? 0 : 0.13, // Ca2+ 사이의 시간차
  hold: 3.8, // 단계가 끝난 뒤 학생이 결과를 보는 시간
  minMotion: REDUCED_MOTION ? 0 : 1.6, // 움직임이 없는 단계에도 주는 최소 시간
};
const T = PIP2_TIMING;

const STEPS = [
  {
    tag: "1단계",
    short: "PIP2의 위치",
    title: "PIP2는 막 안쪽 leaflet에 있다",
    text:
      "PIP2(phosphatidylinositol 4,5-bisphosphate)는 원형질막의 안쪽(세포질 쪽) leaflet에 존재하는 인지질입니다. 이노시톨 고리에 인산이 더 붙어 있어 머리 부분이 강한 음전하를 띠고, 그 머리는 세포질 쪽을 향합니다. 막 전체에서 차지하는 양은 매우 적습니다.",
  },
  {
    tag: "2단계",
    short: "PLC 결합",
    title: "PLC가 접근해 PIP2에 결합한다",
    text:
      "세포 바깥의 신호가 수용체를 통해 전달되면 phospholipase C(PLC)가 막 안쪽 면으로 불려 옵니다. PLC는 세포질 쪽에서 PIP2의 머리 부분에 결합합니다.",
  },
  {
    tag: "3단계",
    short: "절단",
    title: "PIP2가 잘려 DAG와 IP3가 된다",
    text:
      "PLC는 글리세롤과 인산 사이를 끊습니다. 그 결과 꼬리를 가진 쪽은 DAG(diacylglycerol), 인산이 붙은 머리 쪽은 IP3(inositol 1,4,5-trisphosphate)가 됩니다. 하나의 지질에서 성질이 완전히 다른 두 조각이 생깁니다.",
  },
  {
    tag: "4단계",
    short: "DAG · IP3",
    title: "DAG는 막에 남고, IP3는 세포질로 퍼진다",
    text:
      "DAG는 acyl chain 2개를 그대로 가지고 있어 소수성이 큽니다. 그래서 막을 떠나지 못하고 막 안에서 옆으로 움직입니다. 반대로 IP3는 인산기가 3개나 붙어 친수성이 매우 커서 막에 머물 수 없고 세포질로 확산합니다.",
  },
  {
    tag: "5단계",
    short: "IP3 수용체 결합",
    title: "IP3가 ER 막의 IP3 수용체에 결합한다",
    text:
      "세포질로 퍼진 IP3는 소포체(ER) 막에 있는 IP3 수용체(IP3R)에 결합합니다. IP3 수용체는 그 자체가 Ca2+를 통과시키는 통로 단백질입니다.",
  },
  {
    tag: "6단계",
    short: "Ca2+ 방출",
    title: "ER에 저장돼 있던 Ca2+가 세포질로 나온다",
    text:
      "IP3가 결합하면 통로가 열리고, ER 내부(lumen)에 높은 농도로 저장돼 있던 Ca2+가 농도 기울기를 따라 세포질로 쏟아져 나옵니다. 세포질의 Ca2+ 농도가 빠르게 올라갑니다.",
  },
  {
    tag: "7단계",
    short: "PKC 활성화",
    title: "DAG와 Ca2+가 함께 PKC를 활성화한다",
    text:
      "막에 남아 있던 DAG와 세포질로 나온 Ca2+가 함께 작용해 protein kinase C(PKC)를 막으로 불러 활성화합니다. 두 조각이 서로 다른 곳에서 각자의 역할을 하고, 마지막에 다시 만나는 셈입니다.",
  },
];

export function createPip2Module() {
  const viewer = new Viewer("canvas-pip2");
  const els = {
    stepNo: document.getElementById("m2-step-no"),
    title: document.getElementById("m2-caption-title"),
    text: document.getElementById("m2-caption-text"),
    steps: document.getElementById("m2-steps"),
    compare: document.getElementById("m2-compare"),
    modeTag: document.getElementById("m2-mode-tag"),
    extOn: document.getElementById("m2-ext-on"),
    extOff: document.getElementById("m2-ext-off"),
    coreShortcuts: document.getElementById("m2-shortcuts-core"),
    v1aShortcuts: document.getElementById("m2-shortcuts-v1a"),
    v1aPanel: document.getElementById("m2-v1a-panel"),
    v2Note: document.getElementById("m2-v2-note"),
  };

  let step = 0;
  let playing = false;
  let playTimer = 0;
  let mode = "core"; // "core" | "v1a"
  let ext = null;
  let unlocked = false;

  buildStepList(els.steps, STEPS, (i) => {
    playing = false;
    go(i);
  });

  function activeSteps() {
    return mode === "v1a" && ext ? ext.steps : STEPS;
  }

  function activePlan() {
    return mode === "v1a" && ext ? ext.plan : PLAN;
  }

  function renderCaption() {
    const list = activeSteps();
    const s = list[step];
    els.stepNo.textContent = `${step + 1} / ${list.length}`;
    els.title.textContent = s.title;
    els.text.textContent = s.text;
    markSteps(els.steps, step);
  }

  if (!viewer.ok) {
    renderCaption();
    wireButtonsFallback();
    return { viewer, setActive() {}, render() {} };
  }

  /* ---------------- 장면 ---------------- */

  const rand = rng(77021);
  const root = new THREE.Group();
  viewer.scene.add(root);

  // --- 원형질막 ---
  const pm = new THREE.Group();
  root.add(pm);
  // 확장 모드에서만 보이는 좌측 연장 구간
  const wide = new THREE.Group();
  wide.visible = false;
  root.add(wide);

  const outerMix = ["PC", "PC", "SM", "PC", "PE", "SM", "PC"];
  const innerMix = ["PE", "PC", "PS", "PE", "PC", "PE", "PS"];
  // 앞줄에 두어 다른 지질에 가리지 않게 한다
  const PIP2_SLOT = { c: Math.floor(COLS / 2), r: ROWS - 1 };
  const PIP2_Z = (PIP2_SLOT.r - (ROWS - 1) / 2) * SZ;

  // 확장 모드에서 V1a 수용체가 들어갈 칸의 지질은 잠시 숨겨야 한다
  const pmColumns = new Map();

  function pmX(c) {
    return (c - (COLS - 1) / 2) * SX;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = pmX(c);
      const z = (r - (ROWS - 1) / 2) * SZ;
      const col = pmColumns.get(c) || [];
      col.push(place(pm, outerMix[(c * 3 + r) % outerMix.length], x, PM_OUTER_Y, z, 0, 1));
      if (!(c === PIP2_SLOT.c && r === PIP2_SLOT.r)) {
        col.push(place(pm, innerMix[(c * 5 + r) % innerMix.length], x, PM_INNER_Y, z, Math.PI, 1));
      }
      pmColumns.set(c, col);
    }
  }

  for (const c of WIDE_PM_COLS) {
    for (let r = 0; r < ROWS; r++) {
      const x = pmX(c);
      const z = (r - (ROWS - 1) / 2) * SZ;
      const ci = ((c % 7) + 7) % 7;
      place(wide, outerMix[(ci * 3 + r) % outerMix.length], x, PM_OUTER_Y, z, 0, 1);
      place(wide, innerMix[(ci * 5 + r) % innerMix.length], x, PM_INNER_Y, z, Math.PI, 1);
    }
  }

  // --- 소포체(ER) 막 ---
  const er = new THREE.Group();
  root.add(er);
  const ER_COLS = 9;
  const REC_SLOT = 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < ER_COLS; c++) {
      const x = (c - (ER_COLS - 1) / 2) * SX;
      const z = (r - (ROWS - 1) / 2) * SZ;
      if (c === REC_SLOT && r === 1) continue; // 수용체 자리
      place(er, "PC", x, ER_CYTO_Y, z, 0, 0.85);
      place(er, "PE", x, ER_LUMEN_Y, z, Math.PI, 0.85);
    }
  }
  const RECEPTOR_X = (REC_SLOT - (ER_COLS - 1) / 2) * SX;

  for (const c of WIDE_ER_COLS) {
    for (let r = 0; r < ROWS; r++) {
      const x = (c - (ER_COLS - 1) / 2) * SX;
      const z = (r - (ROWS - 1) / 2) * SZ;
      place(wide, "PC", x, ER_CYTO_Y, z, 0, 0.85);
      place(wide, "PE", x, ER_LUMEN_Y, z, Math.PI, 0.85);
    }
  }

  function place(parent, id, x, y, z, rotZ, scale) {
    const g = buildLipid(id, { scale });
    g.position.set(x, y, z);
    g.rotation.z = rotZ;
    g.rotation.y = rand() * Math.PI * 2;
    parent.add(g);
    return g;
  }

  // --- PIP2 (주인공) ---
  const pip2 = buildLipid("PIP2", { scale: 1.6 });
  pip2.position.set(0, PM_INNER_Y + 0.15, PIP2_Z);
  pip2.rotation.z = Math.PI;
  root.add(pip2);

  // --- DAG (절단 후 막에 남는 조각) ---
  const dag = buildDAG();
  dag.position.set(0, PM_INNER_Y + 0.1, PIP2_Z);
  dag.rotation.z = Math.PI;
  dag.visible = false;
  root.add(dag);

  // --- IP3 (절단 후 세포질로 나가는 조각) ---
  const ip3 = buildIP3();
  ip3.visible = false;
  root.add(ip3);

  // --- PLC ---
  const plc = buildBlob(C_PLC, 0.95);
  plc.position.set(4.2, -2.4, 1.6);
  root.add(plc);

  // --- PKC ---
  const pkc = buildBlob(C_PKC, 0.95);
  pkc.position.set(4.6, -3.6, -1.8);
  pkc.visible = false;
  root.add(pkc);

  // --- IP3 수용체 (ER 막의 통로) ---
  const receptor = new THREE.Group();
  receptor.position.set(RECEPTOR_X, (ER_CYTO_Y + ER_LUMEN_Y) / 2, 0);
  root.add(receptor);
  const subunits = [];
  const recMat = mat(C_RECEPTOR, { rough: 0.5 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 4.6, 8), recMat);
    s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    s.userData.a = a;
    receptor.add(s);
    subunits.push(s);
  }
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.6, 1.3, 10, 1, true), recMat);
  funnel.position.y = 2.6;
  receptor.add(funnel);

  // --- Ca2+ (ER lumen 저장분) ---
  const caMat = mat(C_CA, { rough: 0.3 });
  const caGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const ions = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(caGeo, caMat);
    const home = new THREE.Vector3(
      (rand() - 0.5) * 8.4,
      ER_LUMEN_Y - 0.9 - rand() * 1.6,
      (rand() - 0.5) * 2.6
    );
    m.position.copy(home);
    root.add(m);
    ions.push({ mesh: m, home, released: false, phase: rand() * 6.28 });
  }
  const RELEASED = ions.slice(0, 9).map((ion) => {
    ion.target = new THREE.Vector3(
      RECEPTOR_X + (rand() - 0.5) * 5.5,
      -3.4 + rand() * 3.2,
      (rand() - 0.5) * 2.4
    );
    return ion;
  });

  /* --- 영역 띠 (세포 바깥 / 세포질 / ER lumen) ---
     막 두 장 사이의 공간이 각각 무엇인지 배경으로 구분해 준다.
     아주 옅은 색만 쓰고 gradient·glow 는 쓰지 않는다. */
  addZoneBand(root, PM_OUTER_Y + 0.4, 13.6, 0xdce9f1, 0.5); // 세포 바깥
  addZoneBand(root, ER_CYTO_Y, PM_INNER_Y, 0xeef4f7, 0.55); // 세포질
  addZoneBand(root, -13.6, ER_LUMEN_Y, 0xe4eee9, 0.5); // ER 내부

  /* ---------------- 라벨 ---------------- */

  const L = viewer.labels;
  const labels = {
    ecf: L.add("세포 바깥", { anchor: new THREE.Vector3(-6.6, PM_OUTER_Y + 1.6, 0), variant: "zone", group: "zone" }),
    cyto: L.add("세포질 (cytosol)", { anchor: new THREE.Vector3(-6.9, -1.6, 0), variant: "zone", group: "zone" }),
    lumen: L.add("ER 내부 (lumen) · Ca2+ 저장", { anchor: new THREE.Vector3(-5.2, ER_LUMEN_Y - 2.0, 0), variant: "zone", group: "zone" }),
    pm: L.add("원형질막", { anchor: new THREE.Vector3(6.6, PM_OUTER_Y - 2.4, 0), variant: "zone", group: "zone" }),
    erm: L.add("ER 막", { anchor: new THREE.Vector3(5.6, ER_CYTO_Y - 2.0, 0), variant: "zone", group: "zone" }),
    pip2: L.add("PIP2 (안쪽 leaflet)", { anchor: pip2, offset: new THREE.Vector3(0, -1.6, 0), variant: "accent", group: "s0" }),
    pip2p: L.add("인산기 → 세포질 쪽을 향한다", { anchor: pip2, offset: new THREE.Vector3(2.9, -0.9, 0), variant: "anno", group: "s0" }),
    plc: L.add("PLC (phospholipase C)", { anchor: plc, offset: new THREE.Vector3(0, -1.5, 0), variant: "accent", group: "plc" }),
    cut: L.add("여기가 잘린다", { anchor: pip2, offset: new THREE.Vector3(-2.4, -0.7, 0), variant: "accent", group: "cut" }),
    dag: L.add("DAG — 꼬리가 있어 막에 남는다", { anchor: dag, offset: new THREE.Vector3(0, 1.5, 0), variant: "accent", group: "dagL" }),
    ip3: L.add("IP3 — 인산 3개, 친수성 → 세포질로", { anchor: ip3, offset: new THREE.Vector3(2.4, -0.9, 0), variant: "accent", group: "ip3L" }),
    rec: L.add("IP3 수용체 (Ca2+ 통로)", { anchor: receptor, offset: new THREE.Vector3(2.9, 1.4, 0), variant: "accent", group: "rec" }),
    ca: L.add("Ca2+ 방출", { anchor: new THREE.Vector3(RECEPTOR_X + 2.0, -3.2, 0), variant: "accent", group: "ca" }),
    pkc: L.add("PKC 활성화 (DAG + Ca2+)", { anchor: pkc, offset: new THREE.Vector3(0, -1.4, 0), variant: "accent", group: "pkc" }),
  };

  const PLC_LABEL = {
    core: "PLC (phospholipase C)",
    v1a: "PLCβ — Gαq가 활성화한다",
  };

  /* ---------------- 단계별 목표 상태 ---------------- */

  const HOME = { radius: 24, theta: 0.4, phi: 1.44, target: new THREE.Vector3(0, -0.6, 0) };

  /* 자동 재생용 overview.
     원형질막(y ≈ 6.6) · 세포질 · ER 막(y ≈ −5.0) · ER lumen(y ≈ −11.8)이
     한 화면에 들어가야 한다. 세로로 약 22 단위가 필요하고,
     수직 화각 42° 기준 거리 ≈ 11.1 / tan(21°) ≈ 29 이다.
     기본 시점(HOME radius 24)보다 약 20% 넓은 영역을 본다. */
  const OVERVIEW = { radius: 29, phi: 1.5, theta: 0.36, target: new THREE.Vector3(0.2, -1.2, 0) };

  const PLAN = [
    {
      // 0
      plc: [4.2, -2.4, 1.6],
      pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: pip2,
      cam: { radius: 15, phi: 1.46, theta: 0.42, target: new THREE.Vector3(0, 3.4, 0) },
      groups: ["zone", "s0"],
    },
    {
      // 1
      plc: [0.7, -0.9, 0.9],
      pip2: true, dag: null, ip3: null,
      open: 0, release: false, pkc: null, focus: plc,
      cam: { radius: 15, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.3, 2.6, 0) },
      groups: ["zone", "s0", "plc"],
    },
    {
      // 2
      plc: [1.7, -1.3, 1.9],
      pip2: false,
      dag: [0, PM_INNER_Y + 0.1, PIP2_Z], dagFrom: [0, PM_INNER_Y + 0.1, PIP2_Z],
      ip3: [-1.1, -0.5, PIP2_Z + 0.4], ip3From: [0, PM_INNER_Y - 0.5, PIP2_Z],
      open: 0, release: false, pkc: null, focus: ip3,
      cam: { radius: 15, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.2, 2.4, 0) },
      groups: ["zone", "plc", "cut", "dagL", "ip3L"],
    },
    {
      // 3
      plc: [3.0, -2.0, 1.4],
      pip2: false, dag: [-1.6, PM_INNER_Y + 0.1, PIP2_Z], ip3: [0.9, -2.6, 0.9],
      open: 0, release: false, pkc: null, focus: ip3,
      cam: { radius: 21, phi: 1.44, theta: 0.42, target: new THREE.Vector3(0, 0.6, 0) },
      groups: ["zone", "dagL", "ip3L"],
    },
    {
      // 4
      plc: [3.6, -2.2, 1.6],
      pip2: false, dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.0, 0.15],
      open: 0, release: false, pkc: null, focus: receptor,
      cam: { radius: 20, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.6, -2.2, 0) },
      groups: ["zone", "dagL", "ip3L", "rec"],
    },
    {
      // 5
      plc: [3.6, -2.2, 1.6],
      pip2: false, dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: null, focus: receptor,
      cam: { radius: 21, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.4, -4.2, 0) },
      groups: ["zone", "rec", "ca"],
    },
    {
      // 6
      plc: [3.8, -2.4, 1.8],
      pip2: false, dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5], focus: pkc,
      cam: { radius: 25, phi: 1.44, theta: 0.42, target: new THREE.Vector3(-1.0, -0.6, 0) },
      groups: ["zone", "dagL", "ca", "pkc"],
    },
  ];

  viewer.controls.autoRotate = false; // 위·아래 방향이 중요한 장면이라 자동 회전은 끈다
  viewer.controls.frame(HOME, true);
  viewer.controls.saveHome();

  /* ---------------- 확장 장면 ---------------- */

  ext = createVasopressinScene({
    root,
    labels: L,
    geom: { PM_OUTER_Y, PM_INNER_Y, ER_CYTO_Y, ER_LUMEN_Y, PIP2_Z, RECEPTOR_X, SX, COLS },
    refs: { pip2, dag, ip3, plc, pkc, receptor },
    membrane: {
      setWide(on) {
        wide.visible = on;
      },
      setColumnHidden(c, hidden) {
        for (const g of pmColumns.get(c) || []) g.visible = !hidden;
      },
    },
  });

  /* ---------------- tween / 카메라 ---------------- */

  const tweens = [];
  let camTween = null;
  let openAmount = 0;
  let released = false;
  let stageDwell = T.hold;
  let focusObj = null;
  const baseScale = new WeakMap();

  /** key 를 주면 같은 대상에 대한 이전 tween 을 밀어낸다(둘이 서로 싸우지 않게). */
  function tw(dur, fn, key) {
    if (key) {
      const i = tweens.findIndex((t) => t.key === key);
      if (i >= 0) tweens.splice(i, 1);
    }
    tweens.push({ t: 0, dur: Math.max(dur, 0.001), fn, key });
  }

  /** 카메라를 정해진 시간 동안 부드럽게 옮긴다(자동 재생 진입용). */
  function flyCamera(to, dur) {
    const c = viewer.controls;
    if (!dur) {
      camTween = null;
      c.frame(to, true);
      return;
    }
    const from = { radius: c.radius, theta: c.theta, phi: c.phi, target: c.target.clone() };
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    camTween = { t: 0, dur, from, to, dTheta, tmp: new THREE.Vector3() };
  }

  function overviewCam() {
    return mode === "v1a" ? ext.overview : OVERVIEW;
  }

  /** ▶ 재생: 현재 위치에서 전체가 보이는 overview 로 넘어간다. */
  function enterOverview() {
    flyCamera(overviewCam(), T.cameraFly);
    viewer.controls.clearUserMoved();
  }

  function setFocus(obj) {
    if (focusObj && focusObj !== obj) {
      const b = baseScale.get(focusObj);
      if (b !== undefined) focusObj.scale.setScalar(b);
    }
    focusObj = obj || null;
    if (focusObj && !baseScale.has(focusObj)) baseScale.set(focusObj, focusObj.scale.x);
  }

  /* ---------------- 단계 이동 ---------------- */

  function go(i, animate = true) {
    const steps = activeSteps();
    const plan = activePlan();
    step = Math.max(0, Math.min(steps.length - 1, i));
    const p = plan[step];
    tweens.length = 0;

    moveTo(plc, p.plc, animate);
    pip2.visible = p.pip2;
    applyMover(dag, p.dag, p.dagFrom, animate);
    applyMover(ip3, p.ip3, p.ip3From, animate);
    applyMover(pkc, p.pkc, [4.6, -3.6, -1.8], animate);

    const openFrom = openAmount;
    const openTo = p.open;
    if (animate && openFrom !== openTo) {
      tw(T.channelOpen, (t) => {
        openAmount = openFrom + (openTo - openFrom) * easeInOut(t);
        applyOpen();
      });
    } else {
      openAmount = openTo;
      applyOpen();
    }

    setRelease(p.release, animate);

    if (mode === "v1a") {
      ext.apply(step, { animate, tw, moveTo, moveIons, timing: T });
    }

    L.only(p.groups);
    setFocus(p.focus);

    // 자동 재생 중에는 카메라를 건드리지 않는다(overview 유지).
    // 수동 탐색일 때에만 단계별 시점으로 옮긴다.
    if (!playing) viewer.controls.frame(p.cam);

    // 이 단계에서 실제로 만들어진 움직임 중 가장 긴 것 + 결과를 보는 시간
    let motion = 0;
    for (const t of tweens) motion = Math.max(motion, t.dur);
    stageDwell = Math.max(motion, T.minMotion) + T.hold;

    if (step === steps.length - 1 && mode === "core") unlockExtension();
    renderCaption();
    syncPlayButton();
  }

  function applyMover(obj, target, spawnFrom, animate) {
    if (!target) {
      obj.visible = false;
      return;
    }
    if (!obj.visible) {
      obj.visible = true;
      const s = spawnFrom || target;
      obj.position.set(s[0], s[1], s[2]);
    }
    moveTo(obj, target, animate);
  }

  function moveTo(obj, arr, animate) {
    const to = new THREE.Vector3(arr[0], arr[1], arr[2]);
    if (!animate) {
      obj.position.copy(to);
      return;
    }
    const from = obj.position.clone();
    if (from.distanceTo(to) < 0.001) return;
    tw(T.move, (t) => obj.position.lerpVectors(from, to, easeInOut(t)));
  }

  function applyOpen() {
    for (const s of subunits) {
      const a = s.userData.a;
      const r = 0.55 + openAmount * 0.34;
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      s.rotation.z = Math.cos(a) * openAmount * 0.14;
      s.rotation.x = -Math.sin(a) * openAmount * 0.14;
    }
  }

  function setRelease(on, animate) {
    if (on === released) return;
    released = on;
    RELEASED.forEach((ion, i) => {
      const from = ion.mesh.position.clone();
      const mid = new THREE.Vector3(RECEPTOR_X, ER_CYTO_Y - 1.2, 0);
      const to = on ? ion.target : ion.home;
      ion.released = on;
      ion.bound = false;
      if (!animate) {
        ion.mesh.position.copy(to);
        return;
      }
      const delay = i * T.releaseStagger;
      const total = T.release + delay;
      tw(
        total,
        (t) => {
          const u = Math.max(0, Math.min(1, (t * total - delay) / T.release));
          const e = easeOut(u);
          // lumen → 통로 → 세포질 (2구간 경로)
          if (e < 0.5) ion.mesh.position.lerpVectors(from, mid, e * 2);
          else ion.mesh.position.lerpVectors(mid, to, (e - 0.5) * 2);
        },
        `ion${i}`
      );
    });
  }

  /** Ca2+ 몇 개를 특정 지점(칼모듈린)으로 보낸다. count=0 이면 원래 자리로 되돌린다. */
  function moveIons(count, at, animate) {
    RELEASED.forEach((ion, i) => {
      const bind = i < count;
      if (bind === !!ion.bound) return;
      ion.bound = bind;
      ion.released = !bind; // 붙잡힌 이온은 더 이상 떠다니지 않는다
      const to = bind
        ? new THREE.Vector3(
            at[0] + (i % 2 ? 0.55 : -0.55),
            at[1] + (i < 2 ? 0.34 : -0.34),
            at[2] + 0.35
          )
        : ion.target.clone();
      if (!animate) {
        ion.mesh.position.copy(to);
        return;
      }
      const from = ion.mesh.position.clone();
      // 아직 lumen 에 있는 이온이라면 통로를 거쳐서 나온다(막을 뚫고 가지 않도록)
      const via = from.y < ER_CYTO_Y ? new THREE.Vector3(RECEPTOR_X, ER_CYTO_Y - 1.2, 0) : null;
      tw(
        T.move,
        (t) => {
          const e = easeInOut(t);
          if (!via) ion.mesh.position.lerpVectors(from, to, e);
          else if (e < 0.45) ion.mesh.position.lerpVectors(from, via, e / 0.45);
          else ion.mesh.position.lerpVectors(via, to, (e - 0.45) / 0.55);
        },
        `ion${i}`
      );
    });
  }

  function resetIons() {
    released = false;
    for (const ion of ions) {
      ion.released = false;
      ion.bound = false;
      ion.mesh.position.copy(ion.home);
    }
  }

  /* ---------------- 모드 전환 ---------------- */

  function unlockExtension() {
    if (unlocked) return;
    unlocked = true;
    if (els.extOn) els.extOn.hidden = false;
  }

  function setMode(next) {
    if (mode === next) return;
    playing = false;
    playTimer = 0;
    tweens.length = 0;
    camTween = null;
    mode = next;

    // 두 모드가 같은 물체를 공유하므로 넘어갈 때마다 장면을 깨끗이 되돌린다
    resetIons();
    openAmount = 0;
    applyOpen();
    dag.visible = false;
    ip3.visible = false;
    pkc.visible = false;
    pip2.visible = true;
    setFocus(null);

    ext.setActive(mode === "v1a");
    L.setText(labels.plc, mode === "v1a" ? PLC_LABEL.v1a : PLC_LABEL.core);

    buildStepList(els.steps, activeSteps(), (i) => {
      playing = false;
      go(i);
    });

    if (els.modeTag) {
      els.modeTag.dataset.mode = mode;
      els.modeTag.textContent =
        mode === "v1a" ? "생리학적 확장 — 바소프레신 V1a" : "PIP2 핵심 과정";
    }
    if (els.extOn) els.extOn.hidden = mode === "v1a" || !unlocked;
    if (els.extOff) els.extOff.hidden = mode !== "v1a";
    if (els.coreShortcuts) els.coreShortcuts.hidden = mode === "v1a";
    if (els.v1aShortcuts) els.v1aShortcuts.hidden = mode !== "v1a";
    if (els.v1aPanel) els.v1aPanel.hidden = mode !== "v1a";
    if (els.v2Note) els.v2Note.hidden = mode !== "v1a";
    if (els.compare) els.compare.hidden = true;
    const compareBtn = document.querySelector('[data-m2="compare"]');
    if (compareBtn) compareBtn.setAttribute("aria-pressed", "false");

    go(0, false);
    viewer.controls.frame(activePlan()[0].cam, true);
    viewer.controls.clearUserMoved();
  }

  /* ---------------- 프레임 ---------------- */

  let clock = 0;
  viewer.onUpdate((dt) => {
    clock += dt;

    if (camTween) {
      camTween.t += dt;
      const p = Math.min(1, camTween.t / camTween.dur);
      const e = easeInOut(p);
      const f = camTween.from;
      const to = camTween.to;
      viewer.controls.frame(
        {
          radius: f.radius + (to.radius - f.radius) * e,
          theta: f.theta + camTween.dTheta * e,
          phi: f.phi + (to.phi - f.phi) * e,
          target: camTween.tmp.lerpVectors(f.target, to.target, e),
        },
        true
      );
      if (p >= 1) camTween = null;
    }

    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      t.fn(p);
      if (p >= 1) tweens.splice(i, 1);
    }

    // 세포질로 나온 Ca2+ 는 가볍게 떠다닌다
    for (const ion of ions) {
      if (!ion.released) continue;
      ion.mesh.position.x += Math.sin(clock * 0.9 + ion.phase) * dt * 0.16;
      ion.mesh.position.y += Math.cos(clock * 0.7 + ion.phase) * dt * 0.12;
    }

    // 막에 남은 DAG 의 lateral movement
    const lateralFrom = mode === "v1a" ? 6 : 3;
    if (dag.visible && step >= lateralFrom && !tweens.length) {
      dag.position.z = PIP2_Z + Math.sin(clock * 0.5) * 0.45;
    }

    // 자동 재생에서는 카메라를 크게 움직이는 대신 지금 볼 분자만 살짝 강조한다
    if (focusObj) {
      const b = baseScale.get(focusObj) ?? 1;
      const pulse = playing && !REDUCED_MOTION ? 1 + Math.sin(clock * 2.2) * 0.035 : 1;
      focusObj.scale.setScalar(b * pulse);
    }

    if (playing) {
      playTimer += dt;
      if (playTimer > stageDwell) {
        playTimer = 0;
        if (step >= activeSteps().length - 1) {
          playing = false;
          syncPlayButton();
        } else go(step + 1);
      }
    }
  });

  /* ---------------- UI ---------------- */

  const btns = document.querySelectorAll("[data-m2]");
  const playBtn = document.querySelector('[data-m2="play"]');
  const compareBtn = document.querySelector('[data-m2="compare"]');

  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.m2;
      if (a === "play") {
        playing = !playing;
        playTimer = 0;
        if (playing) {
          if (step === activeSteps().length - 1) go(0);
          // 재생 중에는 전체 공간 관계가 계속 보이도록 멀리서 본다
          enterOverview();
        }
        syncPlayButton();
      }
      if (a === "next") { playing = false; go(step + 1); }
      if (a === "prev") { playing = false; go(step - 1); }
      if (a === "goto") { playing = false; go(Number(b.dataset.step)); }
      if (a === "ext-on") { setMode("v1a"); }
      if (a === "ext-off") { setMode("core"); }
      if (a === "compare") {
        const on = els.compare.hidden;
        els.compare.hidden = !on;
        compareBtn.setAttribute("aria-pressed", String(on));
        if (on) { playing = false; go(mode === "v1a" ? 6 : 3); }
      }
      if (a === "labels") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        viewer.labels.setEnabled(on);
      }
      if (a === "reset") resetAll();
    });
  });

  function resetAll() {
    playing = false;
    playTimer = 0;
    tweens.length = 0;
    camTween = null;
    setFocus(null);
    if (mode !== "core") {
      setMode("core"); // 확장 모드 종료 + 장면 초기화 + go(0,false)
    } else {
      resetIons();
      dag.visible = false;
      ip3.visible = false;
      pkc.visible = false;
      pip2.visible = true;
      openAmount = 0;
      applyOpen();
      go(0, false);
    }
    els.compare.hidden = true;
    compareBtn.setAttribute("aria-pressed", "false");
    viewer.controls.frame(PLAN[0].cam, true);
    viewer.controls.clearUserMoved();
    viewer.labels.setEnabled(true);
    document.querySelector('[data-m2="labels"]').setAttribute("aria-pressed", "true");
    syncPlayButton();
  }

  function syncPlayButton() {
    playBtn.textContent = playing ? "❚❚ 일시정지" : "▶ 재생";
    playBtn.setAttribute("aria-pressed", String(playing));
    document.querySelectorAll('[data-m2="goto"]').forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.step) === step));
    });
  }

  function wireButtonsFallback() {
    document.querySelectorAll("[data-m2]").forEach((b) => {
      b.addEventListener("click", () => {
        const a = b.dataset.m2;
        const n = activeSteps().length;
        if (a === "next") { step = Math.min(n - 1, step + 1); renderCaption(); }
        if (a === "prev") { step = Math.max(0, step - 1); renderCaption(); }
        if (a === "goto") { step = Number(b.dataset.step); renderCaption(); }
        if (a === "reset") { step = 0; renderCaption(); }
      });
    });
  }

  go(0, false);

  return {
    viewer,
    setActive(on) {
      viewer.setActive(on);
      if (!on) { playing = false; syncPlayButton(); }
    },
    render(dt) { viewer.render(dt); },
  };
}

/* ---------------- 부품 빌더 ---------------- */

function buildDAG() {
  // 글리세롤 + acyl chain 2개 (머리 없음)
  const g = new THREE.Group();
  const boneMat = mat(C_DAG, { rough: 0.45 });
  const tailMat = mat(0xd8b476, { rough: 0.6 });
  const bone = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9), boneMat);
  bone.position.y = -0.2;
  g.add(bone);
  const oh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), mat(0xcf6b4a, { rough: 0.4 }));
  oh.position.set(0.05, 0.12, 0.16);
  g.add(oh);
  for (let i = 0; i < 2; i++) {
    const x = i ? 0.17 : -0.17;
    for (let s = 0; s < 3; s++) {
      const y0 = -0.5 - s * 0.78;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.8, 7), tailMat);
      c.position.set(x + (i ? 0.05 : -0.03) * s, y0 - 0.4, (i ? 0.04 : -0.02) * s);
      g.add(c);
    }
  }
  g.scale.setScalar(1.6);
  return g;
}

function buildIP3() {
  // 이노시톨 고리 + 인산 3개
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 8, 14), mat(C_IP3, { rough: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const pMat = mat(COLOR.PHOSPHATE, { rough: 0.35 });
  const pos = [
    [0.52, 0.16, 0.12],
    [-0.3, 0.2, 0.46],
    [-0.24, 0.18, -0.48],
  ];
  for (const [x, y, z] of pos) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), pMat);
    p.position.set(x, y, z);
    g.add(p);
  }
  g.scale.setScalar(1.15);
  return g;
}

function buildBlob(color, scale) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.55 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m);
  core.scale.set(1, 0.78, 0.9);
  g.add(core);
  const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), m);
  lobe.position.set(0.55, 0.55, 0.2);
  g.add(lobe);
  g.scale.setScalar(scale);
  return g;
}

/** 두 높이 사이를 아주 옅게 칠해 "세포 바깥 / 세포질 / ER 내부"를 구분한다. */
function addZoneBand(root, yBottom, yTop, color, opacity) {
  const h = yTop - yBottom;
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(26, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  p.position.set(0, (yTop + yBottom) / 2, -7.2);
  root.add(p);
  return p;
}

/* ---------------- 단계 목록 UI ---------------- */

export function buildStepList(host, steps, onClick) {
  host.innerHTML = steps
    .map(
      (s, i) =>
        `<li data-i="${i}"><button type="button"><b>${s.tag}</b>${s.short}</button></li>`
    )
    .join("");
  // 목록을 다시 그려도 클릭 처리기가 겹쳐 붙지 않게 한 번만 연결하고,
  // 처리기 자체는 가장 최근 것으로 바꿔 둔다
  host._onStepClick = onClick;
  if (host.dataset.wired === "true") return;
  host.dataset.wired = "true";
  host.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) host._onStepClick(Number(li.dataset.i));
  });
}

export function markSteps(host, active) {
  host.querySelectorAll("li[data-i]").forEach((li) => {
    const i = Number(li.dataset.i);
    li.dataset.active = String(i === active);
    li.dataset.done = String(i < active);
  });
}
