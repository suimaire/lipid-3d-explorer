/* ============================================================
   모듈 1 — 세포막 지질의 종류와 막 비대칭성

   공간 스케일: cell ⇄ interior ⇄ membrane ⇄ atomistic3D (⇄ structure2D).
     cell                 닫힌 구형 이중층, 인스턴스 묶음 렌더링
     LEVEL 0  membrane     세포막의 작은 조각 (기존 coarse-grained 모델)
     LEVEL 1  atomistic3D  선택한 지질의 원자 단위 3D 구조 (기본 확대 화면)
     LEVEL 2  structure2D  같은 지질의 2D 화학 구조식

   세포 전체와 막 조각은 같은 지질 템플릿·조성을 공유하고,
   선택한 한 분자만 원자 단위로 그린다.

   확대(LEVEL 1·2) 상태에서는 캔버스 클릭으로 지질이 바뀌지 않는다.
   setPickables([]) 로 클릭 대상을 아예 비워 두기 때문이다.
   (예전에는 확대 상태에서도 클릭이 살아 있어 다른 지질로 튀었다.)
   ============================================================ */

import { Viewer, THREE, mat, easeInOut, REDUCED_MOTION } from "../core/viewer.js";
import { createWholeCell, CELL } from "../core/whole-cell.js";
import { createCellInterior } from "../core/cell-interior.js";
import { OUTER_MIX, INNER_MIX, expandMix, shuffle } from "../core/membrane-composition.js";
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

const CAPTIONS = {
  interior: {
    title: "세포 내부 · 골격근 섬유의 막 구획화",
    text: "길게 뻗은 근섬유의 일부를 길이 방향으로 열었습니다. 회색 근원섬유 사이에서 파란 근섬유막의 함입인 T소관과 별개의 보라색 근소포체(SR)를 찾아보세요. [막 연결성]으로 공간을 비교하고, [막 확대]로 근섬유막도 지질 이중층임을 확인할 수 있습니다.",
  },
  continuity: {
    title: "막 연결성 · 안으로 들어온 바깥 공간",
    text: "A의 파란 막은 근섬유막에서 T소관으로 이어집니다. 파란 물 표식도 세포 바깥에서 T소관 내강까지 이어집니다. 막과 물은 같은 물질이 아니라 각각 연속된 막과 수용성 공간입니다. B의 보라색 SR은 별도의 닫힌 막 구획이며, C의 세포질은 두 내강의 바깥을 채웁니다.",
  },
  triad: {
    title: "삼합체 · 서로 가깝지만 별개의 막",
    text: "가운데 T소관 양옆에 SR의 종말수조가 하나씩 있습니다. 두 종말수조 + 하나의 T소관이 triad입니다. 파란 막과 보라색 막 사이의 좁은 접합 틈을 확인하세요. 서로 융합하지 않고 흥분–수축 연결을 위해 마주합니다. T소관 내강은 세포 밖과, 종말수조 내강은 SR과 이어집니다.",
  },
  nmj: {
    title: "신경근접합부 · 근섬유 표면에서 시작",
    text: "운동뉴런 말단이 근섬유막의 운동종판을 마주합니다. 두 세포 사이에는 시냅스 틈이 있습니다. 여기서 유발된 근섬유의 탈분극이 표면을 따라 전파된 뒤 T소관을 통해 내부에 전달됩니다. NMJ와 떨어진 위치의 triad는 별도의 구조입니다.",
  },
  tubule: {
    title: "T소관 · 근섬유막이 안으로 함입된 길",
    text: "표면의 열린 입구에서 파란 막을 따라 내부로 들어가 보세요. T소관은 분리된 세포소기관이 아니라 근섬유막의 연속입니다. 입구와 내강의 물 표식은 세포 밖의 수용성 공간이 안쪽까지 이어짐을 뜻하며, 내강은 세포질이 아닙니다.",
  },
  sr: {
    title: "근소포체 · 근원섬유를 감싸는 독립된 막",
    text: "보라색 SR은 근원섬유 둘레와 길이 방향으로 이어지는 막성 그물망입니다. 넓어진 종말수조도 이 SR에 속합니다. SR은 Ca²⁺를 저장하는 독립된 내부 구획으로, 근섬유막이나 T소관과 융합하지 않습니다.",
  },
  excitation: {
    title: "흥분 전달 · 표면에서 내부로",
    text: "NMJ → 운동종판 → 근섬유막을 따라 전파 → T소관 → triad → SR의 Ca²⁺ 방출 순서로 구조를 짧게 강조합니다. 색 강조는 과정의 순서를 나타내는 교육용 표시이며, 움직이는 전기 입자나 실제 시간·속도를 재현한 것이 아닙니다. 다시 누르면 재생합니다.",
  },
  cell: {
    title: "세포 전체 · 닫힌 지질 이중층",
    text: "작은 막 조각이 사방으로 이어져 세포 전체를 둘러쌉니다. 바깥층의 머리는 세포 밖의 물과, 안쪽층의 머리는 세포질과 접합니다. 두 층의 꼬리는 막 중심에서 마주 보며, 이 닫힌 경계가 안과 밖을 구획합니다. [단면 보기]로 안쪽을 살펴보고, [막 확대 보기]로 표시된 막 조각에 가까이 가 보세요.",
  },
  cutaway: {
    title: "단면 · 막이 구분하는 안과 밖",
    text: "관찰을 위해 앞쪽 막의 일부를 걷어 냈습니다. 잘린 경계에서 바깥층 머리 → 소수성 꼬리 → 안쪽층 머리를 따라가 보세요. 안쪽의 머리가 접하는 공간이 세포질입니다. 실제 세포에 이런 구멍이 있다는 뜻은 아니며, [단면 닫기]를 누르면 다시 닫힌 막이 됩니다.",
  },
  cellAsymmetry: {
    title: "닫힌 막에서도 유지되는 비대칭성",
    text: "단면으로 두 층을 함께 비교합니다. 세포 바깥을 향한 층에는 PC·SM이, 세포질을 향한 층에는 PE·PS·PI가 상대적으로 많습니다. PIP2도 세포질 쪽에 있습니다. 안쪽층은 반지름이 작으므로 더 적은 지질로 비슷한 표면 밀도를 유지합니다. [막 확대 보기]에서 두 층을 벌려 비교할 수 있습니다.",
  },
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

  const compact = matchMedia("(max-width: 680px)").matches || (navigator.deviceMemory || 8) <= 4;
  const cell = createWholeCell({ compact });
  root.add(cell.group);
  cell.group.visible = false;
  // Construct the representative anatomy only when first requested.
  let interior = null;
  const interiorLabels = new Map();
  const interiorTools = document.getElementById("m1-interior-tools");
  const interiorPanel = document.getElementById("m1-interior-panel");
  const interiorKey = document.getElementById("m1-interior-key");
  const interiorSequence = document.getElementById("m1-interior-sequence");
  if (compact) viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  // A curved outline identifies the SAME upper membrane region approached by the camera.
  const focusPoints = [];
  const corners = [[-4.5, -2.0], [4.5, -2.0], [4.5, 2.0], [-4.5, 2.0]];
  for (let edge = 0; edge < 4; edge++) for (let i = 0; i < 12; i++) {
    const a = corners[edge], b = corners[(edge + 1) % 4], t = i / 12;
    focusPoints.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, CELL.core, a[1] + (b[1] - a[1]) * t)
      .normalize().multiplyScalar(CELL.outer + 0.5));
  }
  const focusRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(focusPoints),
    new THREE.LineBasicMaterial({ color: 0x15618f, transparent: true, opacity: 0.65 }));
  cell.group.add(focusRing);

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

  L.add("세포 바깥쪽 · extracellular", {
    anchor: new THREE.Vector3(-9, 10, 5), screen: { x: 0.18, y: 0.08 }, group: "cell", variant: "cell",
  });
  const cellMembrane = L.add("세포막 · plasma membrane", {
    anchor: new THREE.Vector3(0, CELL.outer + 0.4, 0), screen: { x: 0.8, y: 0.08 }, group: "cell", variant: "cell",
  });
  const cellCytosol = L.add("세포질 · cytosol", {
    anchor: new THREE.Vector3(0, -2, 0), screen: { x: 0.76, y: 0.87 }, group: "cellCut", variant: "cell",
  });
  const sectionKey = document.createElement("div");
  sectionKey.className = "cell-section-key";
  sectionKey.hidden = true;
  sectionKey.innerHTML = "<span>바깥층 <b>outer leaflet</b></span><span>↔ 꼬리 · 소수성 중심 ↔</span><span>안쪽층 <b>inner leaflet</b></span>";
  viewer.host.insertAdjacentElement("afterend", sectionKey);
  const scaleStatus = document.createElement("div");
  scaleStatus.className = "cell-scale-status";
  scaleStatus.hidden = true;
  scaleStatus.setAttribute("role", "status");
  viewer.host.appendChild(scaleStatus);

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
  let viewMode = "membrane"; // cell | interior | membrane | atomistic3D | structure2D
  let scale = "cell";
  let interiorMode = "overview";
  let shownExcitationStep = "";
  let cutaway = false;
  let transitioning = false;
  let selectedLipid = null;
  let mode = "overview"; // membrane 단계 안에서의 하위 화면
  const tweens = [];
  let typeCycle = null;
  let psFlips = [];

  function tween(dur, fn, onDone) {
    if (REDUCED_MOTION) { fn(1); onDone?.(); return null; }
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

  function cellHome() {
    const halfFov = THREE.MathUtils.degToRad(viewer.camera.fov / 2);
    const limiting = Math.min(halfFov, Math.atan(Math.tan(halfFov) * viewer.camera.aspect));
    return { radius: (CELL.outer + 0.8) / Math.sin(limiting) * 1.18,
      theta: 0.44, phi: 1.16, target: new THREE.Vector3() };
  }

  function patchHome() {
    return { ...HOME, radius: HOME.radius * Math.max(1, 1.25 / viewer.camera.aspect) };
  }

  function framePatch(config) {
    viewer.controls.frame({ ...config, radius: config.radius * Math.max(1, 1.25 / viewer.camera.aspect) });
  }

  function setLimits() {
    viewer.controls.minRadius = scale === "cell" ? CELL.outer + 4 : scale === "interior" ? 4 : 9;
    viewer.controls.maxRadius = scale === "cell" ? cellHome().radius * 1.8
      : scale === "interior" ? Math.max(140, ensureInterior().home(viewer.camera.aspect).radius * 2) : 140;
  }

  function ensureInterior() {
    if (interior) return interior;
    interior = createCellInterior({ compact });
    root.add(interior.group);
    interior.group.visible = false;
    const annotations = [
      ["sarcolemma", "근섬유막 · sarcolemma"], ["nmj", "신경근접합부 · NMJ"],
      ["tubule", "T소관 · T-tubule"], ["sr", "근소포체 · SR"],
      ["triad", "삼합체 · triad"], ["cisternaLeft", "종말수조 · terminal cisterna"],
      ["cisternaRight", "종말수조 · terminal cisterna"], ["myofibril", "근원섬유 · myofibril"],
      ["cytosol", "세포질 · cytosol"], ["extracellular", "세포 바깥쪽 · extracellular"],
      ["lumen", "내강 · 세포 밖과 연결"],
    ];
    for (const [key, text] of annotations) {
      if (!interior.anchors[key]) continue;
      interiorLabels.set(key, L.add(text, { anchor: interior.anchors[key], group: "interior",
        variant: "interior", visible: false, screen: { x: 0.2, y: 0.1 } }));
    }
    return interior;
  }

  function updateInteriorLabels() {
    const keys = {
      overview: ["nmj", "sarcolemma", "myofibril", "sr", "triad"],
      continuity: ["extracellular", "lumen", "cytosol", "sr"],
      triad: ["cisternaLeft", "tubule", "cisternaRight", "lumen"],
      nmj: ["nmj", "sarcolemma", "extracellular"],
      tubule: ["sarcolemma", "extracellular", "lumen", "tubule"],
      sr: ["sr", "myofibril", "cisternaLeft"],
      excitation: ["nmj", "sarcolemma", "tubule", "sr"],
    }[interiorMode];
    const slots = [[0.2, 0.09], [0.79, 0.09], [0.2, 0.89], [0.79, 0.89], [0.8, 0.5]];
    L.only(["interior"]);
    for (const [key, label] of interiorLabels) {
      const index = keys.indexOf(key);
      label.visible = index >= 0;
      if (index >= 0) label.screen = { x: slots[index][0], y: slots[index][1] };
    }
  }

  function interiorFrame() {
    const scene = ensureInterior();
    return ["overview", "continuity", "excitation"].includes(interiorMode)
      ? scene.home(viewer.camera.aspect) : scene.focus(interiorMode, viewer.camera.aspect);
  }

  function setInteriorMode(next = "overview") {
    clearTweens();
    typeCycle = null;
    resetPS();
    leaveInspect();
    const scene = ensureInterior();
    viewMode = scale = "interior";
    mode = "overview";
    interiorMode = next;
    shownExcitationStep = "";
    selectedLipid = null;
    highlightLegend(null);
    cell.group.visible = bilayer.visible = false;
    scene.group.visible = true;
    scene.setMode(next);
    if (REDUCED_MOTION && next === "excitation") scene.update(10);
    setWater(false);
    sectionKey.hidden = true;
    setLimits();
    viewer.controls.frame(interiorFrame(), REDUCED_MOTION);
    viewer.setPickables([]);
    updateInteriorLabels();
    setCaption(els, next === "overview" ? "interior" : next);
    interiorSequence.hidden = next !== "excitation";
    interiorSequence.textContent = "NMJ → 운동종판 → 근섬유막 → T소관 → triad → SR Ca²⁺ 방출 · 순서만 표시한 모식도";
    syncButtons();
  }

  function updateCellLabels() {
    L.only(cutaway ? ["cell", "cellCut"] : ["cell"]);
    // A compact caption outside the canvas keeps the bilayer boundary unobscured.
    sectionKey.hidden = !(labelsWanted && cutaway && viewMode === "cell");
    cellMembrane.anchor.set(0, CELL.outer + 0.4, 0);
    cellCytosol.visible = cutaway;
    focusRing.visible = !cutaway;
  }

  function setCellMode(next) {
    clearTweens();
    typeCycle = null;
    resetPS();
    leaveInspect();
    viewMode = "cell";
    selectedLipid = null;
    mode = next;
    highlightLegend(null);
    bilayer.visible = false;
    cell.group.visible = true;
    if (interior) interior.group.visible = false;
    setWater(false);
    if (next === "asymmetry") cutaway = true;
    cell.setState({ cutaway, externalized: next === "psflip", highlight: next === "psflip" ? "PS" : null });
    updateCellLabels();
    setLimits();
    viewer.controls.frame(cellHome());
    viewer.setPickables(cell.pickables);
    if (next === "types") {
      setCaption(els, "types");
      startTypeCycle();
    } else if (next === "psflip") {
      setCaption(els, "psflip");
      els.capText.textContent += " 여기서는 안쪽 PS 일부와 바깥쪽 PC·PE의 자리를 교환한 전후 상태를 비교합니다. 노출 비율·위치와 이동 경로는 실제 측정값이 아닙니다.";
    } else setCaption(els, next === "asymmetry" ? "cellAsymmetry" : cutaway ? "cutaway" : "cell");
    syncButtons();
  }

  /** Focus on the north-pole membrane, then blend into the original flat patch.
   * At the handoff its midplane is y=CELL.core, with heads at core +/- 2.6.
   * Recentring the patch and camera together at the end is visually invariant.
   */
  function changeScale(next) {
    if (transitioning) return;
    if (next === scale && viewMode === next) return;
    if (next === "interior" || viewMode === "interior") {
      changeInteriorScale(next);
      return;
    }
    if (!["cell", "membrane"].includes(viewMode)) {
      scale = next;
      setMode("overview");
      return;
    }
    const nextMode = mode;
    if (REDUCED_MOTION) { scale = next; setMode(nextMode); return; }
    transitioning = true;
    clearTweens();
    typeCycle = null;
    resetPS();
    restoreAll();
    for (const l of lipids) l.group.position.copy(l.base);
    cell.setState({ cutaway: false, externalized: false, highlight: null });
    cell.group.visible = bilayer.visible = true;
    bilayer.position.y = CELL.core;
    setWater(false);
    focusRing.visible = true;
    L.hideAll();
    sectionKey.hidden = true;
    scaleStatus.hidden = false;
    scaleStatus.textContent = next === "membrane" ? "세포 전체 → 세포막 표면 → 막 조각" : "막 조각 → 이어지는 이중층 → 세포 전체";
    viewer.controls.enabled = false;
    viewer.setPickables([]);
    viewer.controls.minRadius = 9;
    viewer.controls.maxRadius = 160;

    // Composite two opaque, depth-tested images. Fading the thousands of lipid
    // materials themselves would expose every back-facing tail through the cell.
    const blend = createScaleBlend(viewer, cell.group, bilayer);
    const wide = cellHome();
    const close = patchHome();
    // Normalize a user-rotated starting view without a camera jump.
    const initial = { radius: viewer.controls.radius, theta: viewer.controls.theta,
      phi: viewer.controls.phi, target: viewer.controls.target.clone() };
    if (scale === "membrane") {
      initial.target.y += CELL.core;
      viewer.controls.frame(initial, true);
    }
    const destination = next === "cell" ? wide : { ...close, target: new THREE.Vector3(0, CELL.core, 0) };
    // Use the nearest equivalent azimuth after any number of manual rotations.
    destination.theta = initial.theta + Math.atan2(Math.sin(destination.theta - initial.theta), Math.cos(destination.theta - initial.theta));
    const blendFrame = (p) => {
      const e = easeInOut(p);
      const focus = next === "membrane" ? e : 1 - e;
      const mix = THREE.MathUtils.smoothstep(focus, 0.52, 0.94);
      blend.setMix(mix);
      scaleStatus.dataset.phase = focus < 0.52 ? "approach" : focus < 0.94 ? "blend" : "patch";
      viewer.controls.frame({
        radius: THREE.MathUtils.lerp(initial.radius, destination.radius, e),
        theta: THREE.MathUtils.lerp(initial.theta, destination.theta, e),
        phi: THREE.MathUtils.lerp(initial.phi, destination.phi, e),
        target: initial.target.clone().lerp(destination.target, e),
      }, true);
    };
    blendFrame(0);
    syncButtons();
    tween(1.25, blendFrame, () => {
      blend.dispose();
      bilayer.position.y = 0;
      transitioning = false;
      scale = next;
      viewer.controls.enabled = true;
      scaleStatus.hidden = true;
      viewer.controls.frame({ ...destination, theta: next === "cell" ? wide.theta : close.theta,
        target: new THREE.Vector3() }, true);
      setMode(nextMode);
    });
  }

  /** A representative-scene cut, never a sphere-to-muscle geometry morph.
   * Leaving muscle for a patch first approaches its outlined sarcolemma region.
   * A brief neutral dissolve then changes the unit scale to the existing bilayer.
   */
  function changeInteriorScale(next) {
    const previous = viewMode;
    if (REDUCED_MOTION) {
      scale = next;
      setMode("overview");
      viewer.controls.frame(next === "interior" ? interiorFrame() : next === "cell" ? cellHome() : patchHome(), true);
      return;
    }
    clearTweens();
    typeCycle = null;
    resetPS();
    if (["atomistic3D", "structure2D"].includes(previous)) {
      leaveInspect();
      bilayer.visible = true;
      cell.group.visible = false;
      if (interior) interior.group.visible = false;
      viewer.controls.frame(patchHome(), true);
    }
    ensureInterior();
    transitioning = true;
    viewer.controls.enabled = false;
    viewer.setPickables([]);
    L.hideAll();
    sectionKey.hidden = true;
    scaleStatus.hidden = false;
    scaleStatus.dataset.phase = "representative";
    scaleStatus.textContent = next === "interior" ? "응용 예시 · 골격근 섬유의 막 구획화"
      : next === "membrane" ? "근섬유막의 표시 영역 → 지질 이중층 확대" : "닫힌 이중층의 개념 모델 · 세포 전체";
    const approach = previous === "interior" && next === "membrane";
    const from = { radius: viewer.controls.radius, theta: viewer.controls.theta,
      phi: viewer.controls.phi, target: viewer.controls.target.clone() };
    const to = approach ? interior.patchFrame(viewer.camera.aspect) : from;
    to.theta = from.theta + Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    const switchAt = approach ? 0.7 : 0.5;
    let switched = false;
    syncButtons();
    tween(approach ? 1.5 : 0.8, (p) => {
      if (approach && p < switchAt) {
        const e = easeInOut(Math.min(1, p / 0.5));
        viewer.controls.frame({ radius: THREE.MathUtils.lerp(from.radius, to.radius, e),
          theta: THREE.MathUtils.lerp(from.theta, to.theta, e), phi: THREE.MathUtils.lerp(from.phi, to.phi, e),
          target: from.target.clone().lerp(to.target, e) }, true);
        scaleStatus.dataset.phase = "approach";
      }
      const fadeStart = approach ? 0.5 : 0;
      const opacity = p < switchAt ? 1 - THREE.MathUtils.smoothstep(p, fadeStart, switchAt)
        : THREE.MathUtils.smoothstep(p, switchAt, 1);
      viewer.renderer.domElement.style.opacity = String(opacity);
      if (p >= switchAt && !switched) {
        switched = true;
        // Settle state without clearing this transition's tween.
        const activeTweens = tweens.splice(0);
        transitioning = false;
        scale = next;
        setMode("overview");
        tweens.push(...activeTweens);
        transitioning = true;
        viewer.controls.frame(next === "interior" ? interiorFrame() : next === "cell" ? cellHome() : patchHome(), true);
        viewer.controls.enabled = false;
        viewer.setPickables([]);
        L.hideAll();
        scaleStatus.dataset.phase = "handoff";
        syncButtons();
      }
    }, () => {
      viewer.renderer.domElement.style.opacity = "";
      transitioning = false;
      viewer.controls.enabled = true;
      scaleStatus.hidden = true;
      if (viewMode === "interior") updateInteriorLabels();
      else if (viewMode === "cell") { updateCellLabels(); viewer.setPickables(cell.pickables); }
      else { L.only(["zone"]); viewer.setPickables([bilayer]); }
      syncButtons();
    });
  }

  function setMode(next) {
    if (transitioning) return;
    if (scale === "cell") { setCellMode(next); return; }
    if (scale === "interior") { setInteriorMode("overview"); return; }
    clearTweens();
    typeCycle = null;
    resetPS();
    leaveInspect();
    viewMode = "membrane";
    selectedLipid = null;
    mode = next;
    highlightLegend(null);
    cell.group.visible = false;
    if (interior) interior.group.visible = false;
    bilayer.visible = true;
    setWater(true);
    sectionKey.hidden = true;
    setLimits();
    viewer.setPickables([bilayer]); // LEVEL 0 에서는 막의 지질만 클릭 대상

    if (next === "overview") {
      restoreAll();
      moveLeaflets(0);
      L.only(["zone"]);
      viewer.controls.frame(patchHome());
      setCaption(els, "overview");
    }

    if (next === "types") {
      moveLeaflets(0);
      L.only(["zone", "type"]);
      lblType.visible = true;
      framePatch({ radius: 18, phi: 1.44, target: new THREE.Vector3(0, 0, 0) });
      setCaption(els, "types");
      startTypeCycle();
    }

    if (next === "asymmetry") {
      restoreAll();
      moveLeaflets(1.7);
      L.only(["zone", "mix"]);
      lblOuterMix.visible = true;
      lblInnerMix.visible = true;
      framePatch({ radius: 22, phi: 1.5, theta: 0.28 });
      setCaption(els, "asymmetry");
    }

    if (next === "psflip") {
      restoreAll();
      moveLeaflets(0);
      L.only(["zone", "ps"]);
      lblPS.visible = true;
      framePatch({ radius: 19, phi: 1.42, theta: 0.5 });
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
      if (viewMode === "cell") cell.setState({ highlight: id });
      else dimAll(id);
      const info = LIPID_BY_ID[id];
      L.setText(lblType, `${info.abbr} · ${info.ko}`);
      const rep = lipids.find((l) => l.id === id && l.leaflet === (id === "CHOL" ? "outer" : preferredLeaflet(id)));
      const target = rep || lipids.find((l) => l.id === id);
      if (target && viewMode !== "cell") {
        lblType.anchor = target.group;
        lblType.offset.set(0, target.leaflet === "outer" ? 0.9 : -1.0, 0);
      }
      if (viewMode === "cell") {
        els.capTitle.textContent = `${info.abbr} · ${info.ko}`;
        els.capText.textContent = `${info.leaflet}. 단면 보기로 안쪽층도 살펴보세요. 아래 이름이나 지질을 누르면 원자 단위 구조로 확대됩니다.`;
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
    // PIP2 는 4번·5번 인산 라벨이 따로 붙으므로 머리 라벨을 짧게 둔다
    ["head", (info, id) => (id === "PIP2" ? "머리 · 이노시톨 고리" : `머리 · ${info.head.split(" (")[0]}`), [0, 2.4, 0]],
    ["P4", () => "4번 인산", [-5.8, 0.6, 0]],
    ["P5", () => "5번 인산", [5.8, 2.4, 0]],
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
    if (transitioning || !LIPID_BY_ID[id]) return;
    clearTweens();
    typeCycle = null;
    resetPS();
    hideStructure2D();
    inspectId = id;
    selectedLipid = id;
    viewMode = "atomistic3D";
    mode = "inspect";

    bilayer.visible = false;
    cell.group.visible = false;
    if (interior) interior.group.visible = false;
    sectionKey.hidden = true;
    viewer.controls.minRadius = 6;
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
    if (viewMode === "membrane" || viewMode === "cell") showAtomistic(id);
  });

  /* ---------------- 프레임 갱신 ---------------- */

  viewer.onUpdate((dt) => {
    if (viewMode === "interior" && !transitioning) {
      interior.update(dt);
      if (interiorMode === "excitation") {
        const { excitationStep, excitationComplete } = interior.getStats();
        const key = excitationComplete ? "complete" : String(excitationStep);
        if (key !== shownExcitationStep) {
          shownExcitationStep = key;
          const steps = ["운동뉴런 말단", "운동종판", "근섬유막을 따라 전파", "T소관을 통해 내부로", "triad에서 흥분–수축 연결", "SR → 세포질 Ca²⁺ 방출"];
          interiorSequence.textContent = excitationComplete
            ? "전달 순서 완료 · NMJ → 근섬유막 → T소관 → triad → SR Ca²⁺ 방출. [흥분 전달]을 누르면 다시 재생합니다."
            : `${excitationStep + 1}/6 · ${steps[excitationStep]} — 색 강조는 순서를 표시하는 모식도입니다.`;
        }
      }
    }
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
      if (transitioning && !["labels", "spin"].includes(a)) return;
      if (["cell", "interior", "membrane"].includes(a)) changeScale(a);
      if (a.startsWith("interior-")) {
        setInteriorMode(a.slice("interior-".length));
        // On phones the explanatory panel stacks below the scene. Bring the
        // focused structure into view when its panel shortcut is used.
        if (["interior-nmj", "interior-tubule", "interior-sr"].includes(a)) {
          const bounds = viewer.host.getBoundingClientRect();
          if (bounds.bottom < 0 || bounds.top > window.innerHeight || matchMedia("(max-width: 680px)").matches)
            viewer.host.scrollIntoView({ behavior: REDUCED_MOTION ? "instant" : "smooth", block: "center" });
        }
      }
      if (a === "cutaway") {
        cutaway = !cutaway;
        setCellMode(mode === "asymmetry" ? "overview" : mode);
      }
      if (a === "overview" || a === "types" || a === "asymmetry" || a === "psflip") setMode(a);
      if (a === "reset") {
        viewer.controls.clearUserMoved();
        if (viewMode === "structure2D") { resetStructureTransform(); applyStructureTransform(); }
        else if (viewMode === "atomistic3D") showAtomistic(selectedLipid);
        else setMode("overview");
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
        if (viewMode === "cell" && !transitioning) updateCellLabels();
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
        b.setAttribute("aria-pressed", String(["cell", "membrane"].includes(viewMode) && a === mode));
        b.hidden = viewMode === "interior";
      }
      if (["cell", "interior", "membrane"].includes(a)) b.setAttribute("aria-pressed", String(viewMode === a));
      if (a.startsWith("interior-")) b.setAttribute("aria-pressed", String(viewMode === "interior" && interiorMode === a.slice("interior-".length)));
      if (a === "cutaway") {
        b.hidden = viewMode !== "cell";
        b.setAttribute("aria-pressed", String(cutaway));
        b.textContent = cutaway ? "단면 닫기" : "단면 보기";
      }
      b.disabled = transitioning && !["labels", "spin"].includes(a);
    }
    if (structureBtn) {
      const show = ["atomistic3D", "structure2D"].includes(viewMode);
      structureBtn.hidden = !show;
      structureBtn.textContent = viewMode === "structure2D" ? "3D 구조 보기" : "2D 구조식 보기";
      structureBtn.setAttribute("aria-pressed", String(viewMode === "structure2D"));
    }
    document.querySelector('[data-m1="back"]').textContent = scale === "cell" ? "← 세포 전체로 돌아가기"
      : scale === "interior" ? "← 세포 내부로 돌아가기" : "← 막 전체로 돌아가기";
    const inInterior = viewMode === "interior";
    interiorTools.hidden = interiorPanel.hidden = interiorKey.hidden = !inInterior;
    interiorSequence.hidden = !inInterior || interiorMode !== "excitation";
    document.querySelector("#module-membrane .controls__sep").hidden = inInterior;
    interiorKey.classList.toggle("is-continuity", interiorMode === "continuity");
    document.getElementById("m1-scale-molecule").classList.toggle("is-current", !!selectedLipid);
    const scaleNote = document.getElementById("m1-scale-note");
    scaleNote.hidden = !["cell", "interior", "membrane"].includes(viewMode);
    scaleNote.textContent = inInterior
      ? "골격근 일부를 표현한 교육용 단면입니다. T소관도 일부 절개했으며, 잘린 끝은 관찰 범위의 경계입니다. 살아 있는 관이 세포질로 열려 있다는 뜻이 아닙니다. 크기·간격·상대 비율은 실제와 다릅니다."
      : "막 두께와 지질 크기는 구조를 관찰하기 위해 실제 비율보다 과장되어 있습니다.";
    document.querySelector('[data-m1="spin"]').setAttribute("aria-pressed", String(viewer.controls.autoRotate));
    viewer.host.dataset.view = viewMode;
    viewer.host.setAttribute("aria-busy", String(transitioning));
  }
  const structureBtn = document.querySelector('[data-m1="structure"]');
  let labelsWanted = true;
  setMode("overview");
  viewer.controls.frame(cellHome(), true);

  let lastAspect = viewer.camera.aspect;
  viewer.onUpdate(() => {
    if (transitioning) return;
    if (Math.abs(lastAspect - viewer.camera.aspect) < 0.01) return;
    lastAspect = viewer.camera.aspect;
    if (viewMode === "cell") { setLimits(); viewer.controls.frame(cellHome()); }
    if (viewMode === "interior") { setLimits(); viewer.controls.frame(interiorFrame()); updateInteriorLabels(); }
    if (viewMode === "membrane") {
      if (mode === "overview") viewer.controls.frame(patchHome());
      else framePatch({ radius: mode === "asymmetry" ? 22 : mode === "types" ? 18 : 19 });
    }
  });

  function highlightLegend(id) {
    els.legend.querySelectorAll("[data-lipid]").forEach((el) => {
      el.setAttribute("aria-pressed", String(el.dataset.lipid === id));
    });
  }

  return {
    viewer,
    getDiagnostics() {
      const { diagnostic, ...sceneStats } = viewMode === "interior" ? interior.getStats() : cell.getStats();
      return { viewMode, scale, mode: viewMode === "interior" ? interiorMode : mode, cutaway, transitioning, selectedLipid,
        ...sceneStats, cameraRadius: viewer.controls.radius,
        minRadius: viewer.controls.minRadius, maxRadius: viewer.controls.maxRadius,
        drawCalls: viewer.renderer.info.render.calls, triangles: viewer.renderer.info.render.triangles };
    },
    setActive(on) {
      viewer.setActive(on);
    },
    render(dt) {
      viewer.render(dt);
    },
  };
}

/* ---------------- 헬퍼 ---------------- */

/** Temporary screen-space dissolve; all 3D lipids stay opaque and depth-tested. */
function createScaleBlend(viewer, cellGroup, patchGroup) {
  const { renderer, scene, camera } = viewer;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cellImage = new THREE.WebGLRenderTarget(size.x, size.y);
  const patchImage = cellImage.clone();
  const composite = new THREE.Scene();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { cellImage: { value: cellImage.texture }, patchImage: { value: patchImage.texture }, mixAmount: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D cellImage; uniform sampler2D patchImage; uniform float mixAmount;
      varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(cellImage, vUv), texture2D(patchImage, vUv), mixAmount);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  composite.add(quad);
  viewer.renderOverride = () => {
    renderer.getDrawingBufferSize(size);
    if (cellImage.width !== size.x || cellImage.height !== size.y) {
      cellImage.setSize(size.x, size.y); patchImage.setSize(size.x, size.y);
    }
    const previous = renderer.getRenderTarget();
    cellGroup.visible = true; patchGroup.visible = false;
    renderer.setRenderTarget(cellImage); renderer.render(scene, camera);
    cellGroup.visible = false; patchGroup.visible = true;
    renderer.setRenderTarget(patchImage); renderer.render(scene, camera);
    renderer.setRenderTarget(previous); renderer.render(composite, ortho);
  };
  return {
    setMix(value) { material.uniforms.mixAmount.value = value; },
    dispose() {
      viewer.renderOverride = null;
      cellImage.dispose(); patchImage.dispose(); quad.geometry.dispose(); material.dispose();
    },
  };
}

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
