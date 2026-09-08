/* ============================================================
   모듈 2 — 세포막 인지질과 PIP2 신호전달
   PIP2 → (PLC) → DAG(막에 남음) + IP3(세포질로 확산) → ER Ca2+ 방출
   ============================================================ */

import { Viewer, THREE, mat, easeInOut, easeOut } from "../core/viewer.js";
import { COLOR, buildLipid, rng } from "../core/lipids.js";

const PM_OUTER_Y = 6.6;
const PM_INNER_Y = 1.2;
const ER_CYTO_Y = -5.0;
const ER_LUMEN_Y = -9.3;
const COLS = 11;
const ROWS = 3;
const SX = 1.06;
const SZ = 1.06;

const C_DAG = 0xc98a2e;
const C_IP3 = 0xa8386c;
const C_PLC = 0x7c8fa0;
const C_PKC = 0x3f7d6b;
const C_CA = 0x2f8f7a;
const C_RECEPTOR = 0x6f8494;

const STEPS = [
  {
    tag: "STEP 1",
    short: "PIP2의 위치",
    title: "PIP2는 막 안쪽 leaflet에 있다",
    text:
      "PIP2(phosphatidylinositol 4,5-bisphosphate)는 원형질막의 안쪽(세포질 쪽) leaflet에 존재하는 인지질입니다. 이노시톨 고리에 인산이 더 붙어 있어 머리 부분이 강한 음전하를 띠고, 그 머리는 세포질 쪽을 향합니다. 막 전체에서 차지하는 양은 매우 적습니다.",
  },
  {
    tag: "STEP 2",
    short: "PLC 결합",
    title: "PLC가 접근해 PIP2에 결합한다",
    text:
      "세포 바깥의 신호가 수용체를 통해 전달되면 phospholipase C(PLC)가 막 안쪽 면으로 불려 옵니다. PLC는 세포질 쪽에서 PIP2의 머리 부분에 결합합니다.",
  },
  {
    tag: "STEP 3",
    short: "절단",
    title: "PIP2가 잘려 DAG와 IP3가 된다",
    text:
      "PLC는 글리세롤과 인산 사이를 끊습니다. 그 결과 꼬리를 가진 쪽은 DAG(diacylglycerol), 인산이 붙은 머리 쪽은 IP3(inositol 1,4,5-trisphosphate)가 됩니다. 하나의 지질에서 성질이 완전히 다른 두 조각이 생깁니다.",
  },
  {
    tag: "STEP 4",
    short: "DAG · IP3",
    title: "DAG는 막에 남고, IP3는 세포질로 퍼진다",
    text:
      "DAG는 acyl chain 2개를 그대로 가지고 있어 소수성이 큽니다. 그래서 막을 떠나지 못하고 막 안에서 옆으로 움직입니다. 반대로 IP3는 인산기가 3개나 붙어 친수성이 매우 커서 막에 머물 수 없고 세포질로 확산합니다.",
  },
  {
    tag: "STEP 5",
    short: "IP3 수용체 결합",
    title: "IP3가 ER 막의 IP3 수용체에 결합한다",
    text:
      "세포질로 퍼진 IP3는 소포체(ER) 막에 있는 IP3 수용체(IP3R)에 결합합니다. IP3 수용체는 그 자체가 Ca2+를 통과시키는 통로 단백질입니다.",
  },
  {
    tag: "STEP 6",
    short: "Ca2+ 방출",
    title: "ER에 저장돼 있던 Ca2+가 세포질로 나온다",
    text:
      "IP3가 결합하면 통로가 열리고, ER 내부(lumen)에 높은 농도로 저장돼 있던 Ca2+가 농도 기울기를 따라 세포질로 쏟아져 나옵니다. 세포질의 Ca2+ 농도가 빠르게 올라갑니다.",
  },
  {
    tag: "STEP 7",
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
  };

  buildStepList(els.steps, STEPS, (i) => go(i));

  let step = 0;
  let playing = false;
  let playTimer = 0;

  function renderCaption() {
    const s = STEPS[step];
    els.stepNo.textContent = `${step + 1} / ${STEPS.length}`;
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
  const outerMix = ["PC", "PC", "SM", "PC", "PE", "SM", "PC"];
  const innerMix = ["PE", "PC", "PS", "PE", "PC", "PE", "PS"];
  // 앞줄에 두어 다른 지질에 가리지 않게 한다
  const PIP2_SLOT = { c: Math.floor(COLS / 2), r: ROWS - 1 };
  const PIP2_Z = (PIP2_SLOT.r - (ROWS - 1) / 2) * SZ;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * SX;
      const z = (r - (ROWS - 1) / 2) * SZ;
      place(pm, outerMix[(c * 3 + r) % outerMix.length], x, PM_OUTER_Y, z, 0, 1);
      if (c === PIP2_SLOT.c && r === PIP2_SLOT.r) continue; // PIP2 자리
      place(pm, innerMix[(c * 5 + r) % innerMix.length], x, PM_INNER_Y, z, Math.PI, 1);
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
  const RELEASED = ions.slice(0, 9).map((ion, i) => {
    ion.target = new THREE.Vector3(
      RECEPTOR_X + (rand() - 0.5) * 5.5,
      -3.4 + rand() * 3.2,
      (rand() - 0.5) * 2.4
    );
    return ion;
  });

  // --- 영역 배경(세포 바깥 / 세포질 / ER 내부) ---
  addZonePlate(root, PM_OUTER_Y + 2.4, 0xdce9f1);
  addZonePlate(root, ER_LUMEN_Y - 2.2, 0xe4eee9);

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

  /* ---------------- 단계별 목표 상태 ---------------- */

  const HOME = { radius: 24, theta: 0.4, phi: 1.44, target: new THREE.Vector3(0, -0.6, 0) };

  const PLAN = [
    {
      // 0
      plc: [4.2, -2.4, 1.6],
      pip2: true, dag: false, ip3: null,
      open: 0, release: false, pkc: null,
      cam: { radius: 15, phi: 1.46, theta: 0.42, target: new THREE.Vector3(0, 3.4, 0) },
      groups: ["zone", "s0"],
    },
    {
      // 1
      plc: [0.7, -0.9, 0.9],
      pip2: true, dag: false, ip3: null,
      open: 0, release: false, pkc: null,
      cam: { radius: 15, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.3, 2.6, 0) },
      groups: ["zone", "s0", "plc"],
    },
    {
      // 2
      plc: [1.7, -1.3, 1.9],
      pip2: false, dag: [0, PM_INNER_Y + 0.1, PIP2_Z], ip3: [-1.1, -0.5, PIP2_Z + 0.4],
      open: 0, release: false, pkc: null,
      cam: { radius: 15, phi: 1.46, theta: 0.5, target: new THREE.Vector3(0.2, 2.4, 0) },
      groups: ["zone", "plc", "cut", "dagL", "ip3L"],
    },
    {
      // 3
      plc: [3.0, -2.0, 1.4],
      pip2: false, dag: [-1.6, PM_INNER_Y + 0.1, PIP2_Z], ip3: [0.9, -2.6, 0.9],
      open: 0, release: false, pkc: null,
      cam: { radius: 21, phi: 1.44, theta: 0.42, target: new THREE.Vector3(0, 0.6, 0) },
      groups: ["zone", "dagL", "ip3L"],
    },
    {
      // 4
      plc: [3.6, -2.2, 1.6],
      pip2: false, dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.0, 0.15],
      open: 0, release: false, pkc: null,
      cam: { radius: 20, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.6, -2.2, 0) },
      groups: ["zone", "dagL", "ip3L", "rec"],
    },
    {
      // 5
      plc: [3.6, -2.2, 1.6],
      pip2: false, dag: [-2.1, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: null,
      cam: { radius: 21, phi: 1.44, theta: 0.34, target: new THREE.Vector3(RECEPTOR_X + 0.4, -4.2, 0) },
      groups: ["zone", "rec", "ca"],
    },
    {
      // 6
      plc: [3.8, -2.4, 1.8],
      pip2: false, dag: [-2.4, PM_INNER_Y + 0.1, PIP2_Z], ip3: [RECEPTOR_X, -3.2, 0.15],
      open: 1, release: true, pkc: [-2.8, -0.15, PIP2_Z - 0.5],
      cam: { radius: 25, phi: 1.44, theta: 0.42, target: new THREE.Vector3(-1.0, -0.6, 0) },
      groups: ["zone", "dagL", "ca", "pkc"],
    },
  ];

  viewer.controls.autoRotate = false; // 위·아래 방향이 중요한 장면이라 자동 회전은 끈다
  viewer.controls.frame(HOME, true);
  viewer.controls.saveHome();

  const tweens = [];
  let openAmount = 0;
  let released = false;

  function tw(dur, fn) {
    tweens.push({ t: 0, dur, fn });
  }

  function go(i, animate = true) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const p = PLAN[step];
    tweens.length = 0;

    moveTo(plc, p.plc, animate);
    pip2.visible = p.pip2;

    if (p.dag) {
      if (!dag.visible) {
        dag.visible = true;
        dag.position.set(p.dag[0], p.dag[1], p.dag[2]);
      } else moveTo(dag, p.dag, animate);
    } else {
      dag.visible = false;
    }

    if (p.ip3) {
      if (!ip3.visible) {
        ip3.visible = true;
        ip3.position.set(p.ip3[0], p.ip3[1], p.ip3[2]);
      } else moveTo(ip3, p.ip3, animate);
    } else {
      ip3.visible = false;
    }

    if (p.pkc) {
      if (!pkc.visible) {
        pkc.visible = true;
        pkc.position.set(4.6, -3.6, -1.8);
      }
      moveTo(pkc, p.pkc, animate);
    } else {
      pkc.visible = false;
    }

    const openFrom = openAmount;
    const openTo = p.open;
    if (animate && openFrom !== openTo) {
      tw(0.6, (t) => {
        openAmount = openFrom + (openTo - openFrom) * easeInOut(t);
        applyOpen();
      });
    } else {
      openAmount = openTo;
      applyOpen();
    }

    setRelease(p.release, animate);
    L.only(p.groups);
    viewer.controls.frame(p.cam);
    renderCaption();
    syncPlayButton();
  }

  function moveTo(obj, arr, animate) {
    const to = new THREE.Vector3(arr[0], arr[1], arr[2]);
    if (!animate) {
      obj.position.copy(to);
      return;
    }
    const from = obj.position.clone();
    if (from.distanceTo(to) < 0.001) return;
    tw(0.9, (t) => obj.position.lerpVectors(from, to, easeInOut(t)));
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
      if (!animate) {
        ion.mesh.position.copy(to);
        return;
      }
      const delay = i * 0.09;
      tw(1.6 + delay, (t) => {
        const u = Math.max(0, Math.min(1, (t * (1.6 + delay) - delay) / 1.2));
        const e = easeOut(u);
        // lumen → 통로 → 세포질 (2구간 경로)
        if (e < 0.5) ion.mesh.position.lerpVectors(from, mid, e * 2);
        else ion.mesh.position.lerpVectors(mid, to, (e - 0.5) * 2);
      });
    });
  }

  /* ---------------- 프레임 ---------------- */

  let clock = 0;
  viewer.onUpdate((dt) => {
    clock += dt;
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
    if (dag.visible && step >= 3 && !tweens.length) {
      dag.position.z = PIP2_Z + Math.sin(clock * 0.5) * 0.45;
    }
    if (playing) {
      playTimer += dt;
      if (playTimer > 3.6) {
        playTimer = 0;
        if (step >= STEPS.length - 1) {
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
        if (playing && step === STEPS.length - 1) go(0);
        syncPlayButton();
      }
      if (a === "next") { playing = false; go(step + 1); }
      if (a === "prev") { playing = false; go(step - 1); }
      if (a === "goto") { playing = false; go(Number(b.dataset.step)); }
      if (a === "compare") {
        const on = els.compare.hidden;
        els.compare.hidden = !on;
        compareBtn.setAttribute("aria-pressed", String(on));
        if (on) { playing = false; go(3); }
      }
      if (a === "labels") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        viewer.labels.setEnabled(on);
      }
      if (a === "reset") {
        playing = false;
        els.compare.hidden = true;
        compareBtn.setAttribute("aria-pressed", "false");
        go(0, false);
        viewer.controls.frame(PLAN[0].cam, true);
        viewer.labels.setEnabled(true);
        document.querySelector('[data-m2="labels"]').setAttribute("aria-pressed", "true");
      }
    });
  });

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
        if (a === "next") { step = Math.min(STEPS.length - 1, step + 1); renderCaption(); }
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

function addZonePlate(root, y, color) {
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })
  );
  p.position.set(0, y, -6.5);
  root.add(p);
}

/* ---------------- 단계 목록 UI ---------------- */

export function buildStepList(host, steps, onClick) {
  host.innerHTML = steps
    .map(
      (s, i) =>
        `<li data-i="${i}"><button type="button"><b>${s.tag}</b>${s.short}</button></li>`
    )
    .join("");
  host.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) onClick(Number(li.dataset.i));
  });
}

export function markSteps(host, active) {
  host.querySelectorAll("li[data-i]").forEach((li) => {
    const i = Number(li.dataset.i);
    li.dataset.active = String(i === active);
    li.dataset.done = String(i < active);
  });
}
