/* ============================================================
   모듈 1 — 세포막 지질의 종류와 막 비대칭성

   지질 탐색은 세 단계다.
     LEVEL 0  membrane     전체 세포막 (coarse-grained 모식 모델)
     LEVEL 1  atomistic3D  선택한 지질의 원자 단위 3D 구조 (기본 확대 화면)
     LEVEL 2  structure2D  같은 지질의 2D 화학 구조식

   전체 막은 지질이 수백 개라 지금처럼 단순화한 모식 모델로 두고,
   선택한 한 분자만 원자 단위로 그린다(계층형 abstraction).

   확대(LEVEL 1·2) 상태에서는 캔버스 클릭으로 지질이 바뀌지 않는다.
   setPickables([]) 로 클릭 대상을 아예 비워 두기 때문이다.
   (예전에는 확대 상태에서도 클릭이 살아 있어 다른 지질로 튀었다.)
   ============================================================ */

import { Viewer, THREE, mat, easeInOut, easeOut } from "../core/viewer.js";
import {
  LIPIDS,
  LIPID_BY_ID,
  COLOR,
  buildLipid,
  tintLipid,
  restoreLipid,
  rng,
} from "../core/lipids.js";
import {
  buildStructureSvg,
  structureLegend,
  STRUCTURE_NOTE,
  STRUCTURE_POINTS,
} from "../core/structures.js";
import { getAtomisticModel, fitDistance, atomLegend } from "../core/atomistic.js";
import { CAMERA_HINT } from "../core/molecules.js";

const COLS = 9;
const ROWS = 4;
const SX = 1.06; // x 간격
const SZ = 1.06; // z 간격
const LEAFLET_Y = 2.6; // 머리 높이(±)

/* 대표적 경향을 단순화한 조성 (고정 비율이 아님을 패널에 명시) */
const OUTER_MIX = { PC: 17, SM: 11, PE: 8 };
const INNER_MIX = { PE: 13, PC: 9, PS: 8, PI: 4, PIP2: 2 };

const CAPTIONS = {
  overview: {
    title: "전체 막 보기",
    text:
      "지질 이중층(phospholipid bilayer)입니다. 물과 닿는 머리(head)는 바깥을 향하고, 소수성 꼬리(tail)는 서로 마주 보며 안쪽에 모여 있습니다. 색이 다른 머리는 서로 다른 종류의 지질입니다. 회색으로 짧게 끼어 있는 것이 콜레스테롤입니다.",
  },
  types: {
    title: "지질 종류 보기",
    text:
      "한 종류씩 차례로 강조합니다. 아래 목록에서 이름을 누르면 그 분자만 확대해서 구조를 확인할 수 있습니다.",
  },
  asymmetry: {
    title: "막 비대칭성 보기",
    text:
      "두 leaflet을 벌려 구성을 비교합니다. 바깥쪽에는 PC와 SM이, 안쪽에는 PE·PS·PI가 상대적으로 많습니다. 이 배치는 저절로 유지되는 것이 아니라 flippase 같은 수송 단백질이 ATP를 써서 만들어 냅니다.",
  },
  psflip: {
    title: "PS 외부 노출 보기",
    text:
      "평소 안쪽에만 있던 PS 일부가 바깥쪽으로 옮겨 갑니다. 안쪽으로 되돌리는 flippase의 활성이 떨어지고, 양방향으로 섞어 주는 scramblase가 활성화되면 이런 일이 일어납니다. 이렇게 노출된 PS는 주변 식세포가 알아보는 중요한 신호가 됩니다. 다만 이것은 세포자멸사(apoptosis)에서 일어나는 여러 변화 가운데 하나일 뿐, PS 노출 하나로 세포자멸사가 설명되는 것은 아닙니다.",
  },
  atomistic: {
    title: "원자 단위 3D 구조",
    text:
      "선택한 지질을 원자와 결합이 그대로 보이는 ball-and-stick 모델로 확대했습니다. 드래그로 돌리고 휠로 확대하면서 머리 그룹 · 인산 · 골격 · 소수성 사슬이 어떻게 이어지는지 확인해 보세요. [2D 구조식 보기]를 누르면 같은 분자의 화학 구조식으로 넘어갑니다.",
  },
  structure2D: {
    title: "2D 화학 구조식",
    text:
      "같은 분자를 평면 화학 구조식으로 나타냈습니다. 3D 모델과 번갈아 보면서 어느 부분이 머리이고 어느 부분이 꼬리인지 이어서 이해해 보세요.",
  },
};

export function createMembraneModule() {
  const viewer = new Viewer("canvas-membrane");
  const els = {
    capTitle: document.getElementById("m1-caption-title"),
    capText: document.getElementById("m1-caption-text"),
    detail: document.getElementById("m1-detail"),
    detailName: document.getElementById("m1-detail-name"),
    detailList: document.getElementById("m1-detail-list"),
    legend: document.getElementById("m1-legend"),
  };

  buildLegend(els.legend);
  setCaption(els, "overview");

  if (!viewer.ok) {
    // WebGL 없이도 설명 패널과 목록은 동작하도록 둔다.
    wireLegendFallback(els);
    return { viewer, setActive() {}, render() {} };
  }

  /* ---------------- 장면 구성 ---------------- */

  const root = new THREE.Group();
  viewer.scene.add(root);

  const bilayer = new THREE.Group();
  root.add(bilayer);

  const inspectGroup = new THREE.Group();
  inspectGroup.visible = false;
  root.add(inspectGroup);

  const rand = rng(20260908);
  const lipids = []; // {group, id, leaflet, base:Vector3, baseRotZ}

  // 흐릿한 수용액 표시(위/아래) — 막의 위아래가 물이라는 점을 암시
  const waterHints = [addWaterHint(root, +4.5, rand), addWaterHint(root, -4.5, rand)];
  const setWater = (on) => waterHints.forEach((w) => (w.visible = on));

  const outerIds = expandMix(OUTER_MIX, COLS * ROWS, rand);
  const innerIds = expandMix(INNER_MIX, COLS * ROWS, rand);

  let k = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++, k++) {
      const x = (c - (COLS - 1) / 2) * SX;
      const z = (r - (ROWS - 1) / 2) * SZ;
      addLipid(outerIds[k], "outer", x, z);
      addLipid(innerIds[k], "inner", x, z);
    }
  }

  // 콜레스테롤 — 인지질 사이 틈(격자 사이)에 끼워 넣는다
  const cholSpots = [];
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) cholSpots.push([c, r]);
  }
  shuffle(cholSpots, rand);
  const RESERVED = 3; // PS 노출 애니메이션이 사용할 바깥층 빈자리
  const cholPicks = cholSpots.slice(RESERVED, RESERVED + 12);
  const psTargets = cholSpots.slice(0, RESERVED).map(([c, r]) => ({
    x: (c - (COLS - 1) / 2 + 0.5) * SX,
    z: (r - (ROWS - 1) / 2 + 0.5) * SZ,
  }));

  cholPicks.forEach(([c, r], i) => {
    const x = (c - (COLS - 1) / 2 + 0.5) * SX;
    const z = (r - (ROWS - 1) / 2 + 0.5) * SZ;
    addLipid("CHOL", i % 2 === 0 ? "outer" : "inner", x, z, 0.42);
  });

  function addLipid(id, leaflet, x, z, yInset = 0) {
    const g = buildLipid(id);
    const outer = leaflet === "outer";
    const y = outer ? LEAFLET_Y - yInset : -LEAFLET_Y + yInset;
    g.position.set(x, y, z);
    g.rotation.z = outer ? 0 : Math.PI;
    // 살짝 기울여 규칙적인 격자 느낌을 줄인다
    g.rotation.y = rand() * Math.PI * 2;
    const tilt = (rand() - 0.5) * 0.16;
    g.rotation.x = tilt;
    g.userData.pickId = id;
    const rec = {
      group: g,
      id,
      leaflet,
      base: g.position.clone(),
      baseRotZ: g.rotation.z,
    };
    lipids.push(rec);
    bilayer.add(g);
    return rec;
  }

  viewer.setPickables([bilayer]);

  /* ---------------- 라벨 ---------------- */

  const L = viewer.labels;
  const lblOuterZone = L.add("세포 바깥쪽 · outer leaflet", {
    anchor: new THREE.Vector3(-5.6, 3.5, 0),
    variant: "zone",
    group: "zone",
  });
  const lblInnerZone = L.add("세포질 쪽 · inner leaflet", {
    anchor: new THREE.Vector3(-5.6, -3.6, 0),
    variant: "zone",
    group: "zone",
  });
  const lblOuterMix = L.add("PC · SM 이 많다", {
    anchor: new THREE.Vector3(5.6, 3.9, 0),
    variant: "accent",
    group: "mix",
    visible: false,
  });
  const lblInnerMix = L.add("PE · PS · PI 가 많다", {
    anchor: new THREE.Vector3(5.6, -4.0, 0),
    variant: "accent",
    group: "mix",
    visible: false,
  });
  const lblType = L.add("", {
    anchor: new THREE.Vector3(0, 0, 0),
    variant: "accent",
    group: "type",
    visible: false,
  });
  const lblPS = L.add("바깥으로 노출된 PS — 식세포가 알아보는 신호", {
    anchor: new THREE.Vector3(0, 4.2, 0),
    variant: "accent",
    group: "ps",
    visible: false,
  });
  const inspectLabels = [];

  L.show("zone", true);

  /* ---------------- LEVEL 2 오버레이 (화학 구조식) ---------------- */

  const structureEl = document.createElement("div");
  structureEl.className = "structure";
  structureEl.hidden = true;
  viewer.host.appendChild(structureEl);

  // 원자 색 범례 — 원자 단위 3D 화면에서만 보인다
  const atomKeyEl = document.createElement("div");
  atomKeyEl.className = "atomkey";
  atomKeyEl.hidden = true;
  atomKeyEl.innerHTML =
    atomLegend()
      .map((x) => `<span><i style="background:${x.color}"></i>${x.label}</span>`)
      .join("") + `<span class="atomkey__note">수소는 그리지 않았습니다</span>`;
  viewer.host.appendChild(atomKeyEl);

  // 구조식은 2D 이므로 회전은 두지 않고 휠 확대와 드래그 이동만 허용한다.
  let stZoom = 1;
  let stX = 0;
  let stY = 0;
  let stDrag = null;

  function applyStructureTransform() {
    const fig = structureEl.querySelector(".structure__figure");
    if (fig) fig.style.transform = `translate(${stX}px, ${stY}px) scale(${stZoom})`;
  }
  function resetStructureTransform() {
    stZoom = 1;
    stX = 0;
    stY = 0;
  }
  structureEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stZoom = Math.min(3, Math.max(0.6, stZoom * Math.exp(-e.deltaY * 0.0016)));
      applyStructureTransform();
    },
    { passive: false }
  );
  structureEl.addEventListener("pointerdown", (e) => {
    stDrag = { x: e.clientX, y: e.clientY, ox: stX, oy: stY };
    try {
      structureEl.setPointerCapture?.(e.pointerId);
    } catch {
      /* 포인터가 이미 사라진 경우 — 드래그는 그대로 동작한다 */
    }
  });
  structureEl.addEventListener("pointermove", (e) => {
    if (!stDrag) return;
    stX = stDrag.ox + (e.clientX - stDrag.x);
    stY = stDrag.oy + (e.clientY - stDrag.y);
    applyStructureTransform();
  });
  const endDrag = () => (stDrag = null);
  structureEl.addEventListener("pointerup", endDrag);
  structureEl.addEventListener("pointercancel", endDrag);

  /* ---------------- 카메라 기본값 ---------------- */

  const HOME = { radius: 19.5, theta: 0.36, phi: 1.46, target: new THREE.Vector3(0, 0, 0) };
  viewer.controls.frame(HOME, true);
  viewer.controls.saveHome();

  /* ---------------- 상태 & 애니메이션 ---------------- */

  // LEVEL 0/1/2 를 나타내는 명시적 view state
  let viewMode = "membrane"; // membrane | atomistic3D | structure2D
  let selectedLipid = null;
  let mode = "overview"; // membrane 단계 안에서의 하위 화면
  const tweens = [];
  let typeCycle = null;
  let psFlips = [];

  function tween(dur, fn, onDone) {
    const t = { t: 0, dur, fn, onDone };
    tweens.push(t);
    return t;
  }

  function clearTweens() {
    tweens.length = 0;
  }

  function dimAll(except) {
    for (const l of lipids) {
      if (except && l.id === except) restoreLipid(l.group);
      else tintLipid(l.group, { headColor: COLOR.DIM, tailColor: 0xe6eaee });
    }
  }

  function restoreAll() {
    for (const l of lipids) restoreLipid(l.group);
  }

  function moveLeaflets(spread) {
    for (const l of lipids) {
      const dy = l.leaflet === "outer" ? spread : -spread;
      const from = l.group.position.y;
      const to = l.base.y + dy;
      if (Math.abs(from - to) < 0.001) continue;
      tween(0.7, (p) => {
        l.group.position.y = from + (to - from) * easeInOut(p);
      });
    }
  }

  /* ---------------- 뷰 전환 ---------------- */

  function setMode(next) {
    clearTweens();
    typeCycle = null;
    resetPS();
    leaveInspect();
    viewMode = "membrane";
    selectedLipid = null;
    mode = next;
    viewer.setPickables([bilayer]); // LEVEL 0 에서는 막의 지질만 클릭 대상

    if (next === "overview") {
      restoreAll();
      moveLeaflets(0);
      L.only(["zone"]);
      viewer.controls.frame(HOME);
      setCaption(els, "overview");
    }

    if (next === "types") {
      moveLeaflets(0);
      L.only(["zone", "type"]);
      lblType.visible = true;
      viewer.controls.frame({ radius: 18, phi: 1.44, target: new THREE.Vector3(0, 0, 0) });
      setCaption(els, "types");
      startTypeCycle();
    }

    if (next === "asymmetry") {
      restoreAll();
      moveLeaflets(1.7);
      L.only(["zone", "mix"]);
      lblOuterMix.visible = true;
      lblInnerMix.visible = true;
      viewer.controls.frame({ radius: 22, phi: 1.5, theta: 0.28 });
      setCaption(els, "asymmetry");
    }

    if (next === "psflip") {
      restoreAll();
      moveLeaflets(0);
      L.only(["zone", "ps"]);
      lblPS.visible = true;
      viewer.controls.frame({ radius: 19, phi: 1.42, theta: 0.5 });
      setCaption(els, "psflip");
      startPSFlip();
    }

    syncButtons();
  }

  /* ---------------- 지질 종류 순차 강조 ---------------- */

  function startTypeCycle() {
    const order = LIPIDS.map((l) => l.id);
    let i = 0;
    const showType = (id) => {
      dimAll(id);
      const info = LIPID_BY_ID[id];
      L.setText(lblType, `${info.abbr} · ${info.ko}`);
      const rep = lipids.find((l) => l.id === id && l.leaflet === (id === "CHOL" ? "outer" : preferredLeaflet(id)));
      const target = rep || lipids.find((l) => l.id === id);
      if (target) {
        lblType.anchor = target.group;
        lblType.offset.set(0, target.leaflet === "outer" ? 0.9 : -1.0, 0);
      }
      highlightLegend(id);
    };
    showType(order[0]);
    typeCycle = {
      t: 0,
      period: 2.4,
      step() {
        i = (i + 1) % order.length;
        showType(order[i]);
      },
    };
  }

  function preferredLeaflet(id) {
    return id === "PC" || id === "SM" ? "outer" : "inner";
  }

  /* ---------------- PS 외부 노출 ---------------- */

  function startPSFlip() {
    const inner = lipids.filter((l) => l.id === "PS" && l.leaflet === "inner");
    shuffle(inner, rand);
    const picks = inner.slice(0, psTargets.length);
    // PS를 눈에 잘 띄게, 나머지는 살짝 흐리게
    for (const l of lipids) {
      if (l.id !== "PS") tintLipid(l.group, { headColor: COLOR.DIM, tailColor: 0xe6eaee });
    }
    psFlips = picks.map((l, i) => ({ rec: l, target: psTargets[i] }));

    psFlips.forEach(({ rec, target }, i) => {
      const from = rec.group.position.clone();
      const to = new THREE.Vector3(target.x, LEAFLET_Y + 0.32, target.z);
      const fromRot = rec.group.rotation.z;
      tween(2.0, (p) => {
        const e = easeInOut(Math.min(1, Math.max(0, (p - i * 0.12) / (1 - psTargets.length * 0.12))));
        // 막 안을 가로질러 넘어가는 호(arc)
        const bulge = Math.sin(e * Math.PI) * 1.5;
        rec.group.position.set(
          from.x + (to.x - from.x) * e + bulge * 0.25,
          from.y + (to.y - from.y) * e,
          from.z + (to.z - from.z) * e + bulge * 0.35
        );
        rec.group.rotation.z = fromRot + (0 - fromRot) * e;
        rec.group.scale.setScalar(1 + e * 0.35); // 노출된 PS 를 알아보기 쉽게
      });
      if (i === psFlips.length - 1) {
        lblPS.anchor = rec.group;
        lblPS.offset.set(0, 1.2, 0);
      }
    });
  }

  function resetPS() {
    for (const { rec } of psFlips) {
      rec.group.position.copy(rec.base);
      rec.group.rotation.z = rec.baseRotZ;
      rec.group.scale.setScalar(1);
    }
    psFlips = [];
    lblPS.anchor = new THREE.Vector3(0, 4.2, 0);
    lblPS.offset.set(0, 0, 0);
  }

  /* ---------------- LEVEL 1 — 원자 단위 3D 구조 ---------------- */

  /* 라벨 문구와 붙일 위치. 분자는 원점에 놓이고 머리가 +Y,
     소수성 꼬리가 −Y 를 향하도록 미리 돌려져 있다. */
  const ANNO = [
    ["head", (info) => `머리 · ${info.head.split(" (")[0]}`, [0, 2.4, 0]],
    ["P4", () => "4번 인산", [-5.4, 1.8, 0]],
    ["P5", () => "5번 인산", [5.4, 1.6, 0]],
    ["phosphate", (info, id) => (id === "SM" ? "포스포콜린의 인산" : "인산 다리 (phosphodiester)"), [5.6, 0.2, 0]],
    ["backbone", (info, id) => (id === "CHOL" ? "네 고리 스테로이드 골격" : info.backbone.split(" (")[0] + " 골격"), [-5.8, -0.4, 0]],
    ["ester", () => "에스터 결합 (−CO−O−)", [5.8, -1.6, 0]],
    ["amide", () => "아미드 결합 (−CO−NH−)", [5.8, -1.6, 0]],
    ["ene", (info, id) => (id === "SM" ? "trans 이중결합 (Δ4)" : id === "CHOL" ? "C5=C6 이중결합" : "cis 이중결합 → 꼬리가 꺾인다"), [-6.4, 0.8, 0]],
    ["chain", (info, id) =>
      id === "CHOL"
        ? "탄화수소 곁사슬"
        : id === "SM"
          ? "소수성 꼬리 2개 (지방산 + 스핑고신 사슬)"
          : "소수성 사슬 (acyl chain) 2개",
      [6.0, -5.2, 0]],
  ];

  let inspectId = null;

  /** LEVEL 1 — 선택한 지질의 원자 단위(atomistic) 3D 모델 */
  function showAtomistic(id) {
    if (!LIPID_BY_ID[id]) return;
    clearTweens();
    typeCycle = null;
    resetPS();
    hideStructure2D();
    inspectId = id;
    selectedLipid = id;
    viewMode = "atomistic3D";
    mode = "inspect";

    bilayer.visible = false;
    setWater(false); // 확대 화면에서는 배경 점을 치운다
    clearInspect();

    const model = getAtomisticModel(id);
    if (!model) return;
    inspectGroup.add(model);
    inspectGroup.visible = true;

    const info = LIPID_BY_ID[id];
    const A = model.userData.anchors;
    for (const [key, text, off] of ANNO) {
      if (!A[key]) continue;
      inspectLabels.push(
        L.add(text(info, id), {
          anchor: A[key].clone(),
          offset: new THREE.Vector3(off[0], off[1], off[2]),
          variant: "anno",
          group: "inspect",
        })
      );
    }
    L.only(["inspect"]);

    // 분자마다 크기가 다르므로 bounding box 를 재서 카메라 거리를 맞춘다
    const dist = fitDistance(viewer.camera, model.userData.extent);
    const hint = CAMERA_HINT[id] || { theta: 0.42, phi: 1.48 };
    viewer.controls.maxRadius = Math.max(140, dist * 1.8);
    viewer.controls.frame({
      radius: dist,
      theta: hint.theta,
      phi: hint.phi,
      target: new THREE.Vector3(0, 0, 0),
    });

    // 확대 화면에서는 캔버스 클릭으로 다른 지질을 고르지 않는다(드래그 회전·휠 확대만).
    viewer.setPickables([]);
    atomKeyEl.hidden = false;
    setCaption(els, "atomistic", `${info.abbr} · ${info.ko}`);
    showDetail(els, info, model.userData.molecule);
    highlightLegend(id);
    syncButtons();
  }

  function clearInspect() {
    while (inspectGroup.children.length) inspectGroup.remove(inspectGroup.children[0]);
    for (const it of inspectLabels) {
      it.el.remove();
      const i = L.items.indexOf(it);
      if (i >= 0) L.items.splice(i, 1);
    }
    inspectLabels.length = 0;
    atomKeyEl.hidden = true;
  }

  /** LEVEL 1·2 → LEVEL 0 */
  function leaveInspect() {
    hideStructure2D();
    if (mode !== "inspect" && !inspectId) return;
    clearInspect();
    inspectGroup.visible = false;
    bilayer.visible = true;
    setWater(true);
    viewer.controls.maxRadius = 140;
    inspectId = null;
    hideDetail(els);
    highlightLegend(null);
  }

  /* ---------------- LEVEL 2 — 2D 화학 구조식 ---------------- */

  function showStructure2D(id) {
    if (!LIPID_BY_ID[id]) return;
    if (viewMode !== "atomistic3D") showAtomistic(id);
    selectedLipid = id;
    viewMode = "structure2D";
    const info = LIPID_BY_ID[id];

    structureEl.innerHTML =
      `<div class="structure__legend">` +
      structureLegend(id)
        .map(
          (x) =>
            `<span class="structure__key"><i style="background:${x.color}"></i>${x.label}</span>`
        )
        .join("") +
      `<span class="structure__hint">부위를 구분하려고 칠한 학습용 색입니다. 3D 모델의 색은 원소별 화학 관례를 따릅니다.</span>` +
      `</div>` +
      `<div class="structure__figure">${buildStructureSvg(id)}</div>`;
    resetStructureTransform();
    structureEl.hidden = false;
    void structureEl.offsetWidth; // 강제 reflow — 탭이 숨겨져 있어도 전환이 확실히 시작된다
    structureEl.classList.add("is-open");

    viewer.setPickables([]); // 구조식 화면에서도 3D 클릭을 받지 않는다
    viewer.labels.setEnabled(false);
    atomKeyEl.hidden = true;
    setCaption(els, "structure2D", `${info.abbr} · 2D 화학 구조식`);
    showStructureDetail(els, info, id);
    highlightLegend(id);
    syncButtons();
  }

  function hideStructure2D() {
    if (structureEl.hidden) return;
    structureEl.classList.remove("is-open");
    structureEl.hidden = true;
    structureEl.innerHTML = "";
    if (labelsWanted) viewer.labels.setEnabled(true);
  }

  /** LEVEL 2 → LEVEL 1 (선택한 지질은 그대로 유지한다) */
  function backToAtomistic() {
    const id = selectedLipid;
    hideStructure2D();
    if (id) showAtomistic(id);
  }

  // 지질 선택은 LEVEL 0(전체 막)에서만 일어난다.
  viewer.onPick((id) => {
    if (viewMode === "membrane") showAtomistic(id);
  });

  /* ---------------- 프레임 갱신 ---------------- */

  viewer.onUpdate((dt) => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(p);
      if (p >= 1) {
        tweens.splice(i, 1);
        tw.onDone && tw.onDone();
      }
    }
    if (typeCycle) {
      typeCycle.t += dt;
      if (typeCycle.t >= typeCycle.period) {
        typeCycle.t = 0;
        typeCycle.step();
      }
    }
    // 확대 화면의 회전은 [자동 회전] 버튼이 제어하는 카메라 궤도가 맡는다.
  });

  /* ---------------- UI 배선 ---------------- */

  const buttons = document.querySelectorAll("[data-m1]");
  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.m1;
      if (a === "overview" || a === "types" || a === "asymmetry" || a === "psflip") setMode(a);
      if (a === "reset") {
        setMode("overview");
        viewer.controls.reset();
        viewer.controls.autoRotate = true;
        document.querySelector('[data-m1="spin"]').setAttribute("aria-pressed", "true");
        labelsWanted = true;
        viewer.labels.setEnabled(true);
        document.querySelector('[data-m1="labels"]').setAttribute("aria-pressed", "true");
      }
      if (a === "back") setMode("overview");
      if (a === "structure") {
        // LEVEL 1 <-> LEVEL 2. 어느 쪽으로 오가든 선택한 지질은 그대로다.
        if (viewMode === "structure2D") backToAtomistic();
        else if (viewMode === "atomistic3D") showStructure2D(selectedLipid);
      }
      if (a === "labels") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        labelsWanted = on;
        if (viewMode !== "structure2D") viewer.labels.setEnabled(on);
      }
      if (a === "spin") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        viewer.controls.autoRotate = on;
      }
    });
  });

  els.legend.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lipid]");
    if (!btn) return;
    showAtomistic(btn.dataset.lipid);
  });

  function syncButtons() {
    for (const b of buttons) {
      const a = b.dataset.m1;
      if (["overview", "types", "asymmetry", "psflip"].includes(a)) {
        b.setAttribute("aria-pressed", String(viewMode === "membrane" && a === mode));
      }
    }
    if (structureBtn) {
      const show = viewMode !== "membrane";
      structureBtn.hidden = !show;
      structureBtn.textContent = viewMode === "structure2D" ? "3D 구조 보기" : "2D 구조식 보기";
      structureBtn.setAttribute("aria-pressed", String(viewMode === "structure2D"));
    }
  }
  const structureBtn = document.querySelector('[data-m1="structure"]');
  let labelsWanted = true;
  syncButtons();

  function highlightLegend(id) {
    els.legend.querySelectorAll("[data-lipid]").forEach((el) => {
      el.setAttribute("aria-pressed", String(el.dataset.lipid === id));
    });
  }

  return {
    viewer,
    setActive(on) {
      viewer.setActive(on);
    },
    render(dt) {
      viewer.render(dt);
    },
  };
}

/* ---------------- 헬퍼 ---------------- */

function addWaterHint(root, y, rand) {
  const geo = new THREE.SphereGeometry(0.075, 6, 5);
  const m = mat(COLOR.WATER, { rough: 0.9, opacity: 0.6 });
  const N = 90;
  const inst = new THREE.InstancedMesh(geo, m, N);
  const d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    d.position.set((rand() - 0.5) * 11, y + (rand() - 0.5) * 2.2, (rand() - 0.5) * 6);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
  return inst;
}

function expandMix(mix, total, rand) {
  const out = [];
  for (const [id, n] of Object.entries(mix)) for (let i = 0; i < n; i++) out.push(id);
  while (out.length < total) out.push(Object.keys(mix)[0]);
  out.length = total;
  shuffle(out, rand);
  return out;
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildLegend(host) {
  host.innerHTML = LIPIDS.map(
    (l) => `<button type="button" class="legend__item" data-lipid="${l.id}" aria-pressed="false">
      <span class="legend__swatch" style="background:#${l.color.toString(16).padStart(6, "0")}"></span>
      <span>${l.ko}</span><span class="legend__abbr">${l.abbr}</span>
    </button>`
  ).join("");
}

function wireLegendFallback(els) {
  els.legend.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lipid]");
    if (!btn) return;
    showDetail(els, LIPID_BY_ID[btn.dataset.lipid]);
  });
}

function setCaption(els, key, titleOverride) {
  const c = CAPTIONS[key];
  els.capTitle.textContent = titleOverride || c.title;
  els.capText.textContent = c.text;
}

/**
 * LEVEL 1 오른쪽 패널.
 * mol 을 주면 지금 보고 있는 원자 단위 모델이 어떤 대표 분자인지 함께 밝힌다.
 */
function showDetail(els, info, mol) {
  els.detailName.textContent = `${info.name} (${info.abbr})`;
  els.detailList.innerHTML =
    `
    <dt>한글 이름</dt><dd>${info.ko}</dd>
    <dt>골격</dt><dd>${info.backbone}</dd>
    <dt>머리 그룹</dt><dd>${info.head}</dd>
    <dt>전하 · 극성</dt><dd>${info.charge}</dd>
    <dt>주로 있는 곳</dt><dd><b>${info.leaflet}</b></dd>
    <dt>핵심 기능</dt><dd>${info.role}</dd>` +
    (mol
      ? `<dt>대표 구조</dt><dd>${mol.species}<br><span class="datalist__sub">${mol.acyl} · ${mol.formula}</span></dd>` +
        `<dt>읽을 때 주의</dt><dd class="structure__note">${
          info.id === "CHOL"
            ? "콜레스테롤은 지방산 사슬이 없는 단일 화합물이라, 이 구조가 곧 콜레스테롤 분자 자체입니다. 수소는 그리지 않았습니다."
            : "화면의 3D 모델은 학습용 <b>대표 구조 예시</b>입니다. 실제 생체막에서는 지방산 사슬의 길이와 불포화도가 다양할 수 있습니다. 수소는 그리지 않았습니다."
        }</dd>`
      : "");
  els.detail.hidden = false;
}

function hideDetail(els) {
  els.detail.hidden = true;
}

/** LEVEL 2 오른쪽 패널 — 구조에서 짚어 줄 점 + class 수준 구조라는 안내 */
function showStructureDetail(els, info, id) {
  const points = (STRUCTURE_POINTS[id] || []).map((t) => `<li>${t}</li>`).join("");
  els.detailName.textContent = `${info.name} (${info.abbr}) · 화학 구조`;
  els.detailList.innerHTML =
    `<dt>골격</dt><dd>${info.backbone}</dd>` +
    `<dt>머리 그룹</dt><dd>${info.head}</dd>` +
    `<dt>전하 · 극성</dt><dd>${info.charge}</dd>` +
    (points ? `<dt>구조에서 볼 점</dt><dd><ul class="structure__points">${points}</ul></dd>` : "") +
    `<dt>읽을 때 주의</dt><dd class="structure__note">${STRUCTURE_NOTE[id] || ""}</dd>`;
  els.detail.hidden = false;
}
