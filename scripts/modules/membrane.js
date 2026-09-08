/* ============================================================
   모듈 1 — 세포막 지질의 종류와 막 비대칭성
   Level 1 전체 막 → Level 2 분자 확대 → Level 3 정보 오버레이
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
  inspect: {
    title: "분자 확대 보기",
    text: "구조를 이루는 부분들을 라벨로 표시했습니다. 머리 부분의 차이가 곧 지질 종류의 차이입니다.",
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

  /* ---------------- 카메라 기본값 ---------------- */

  const HOME = { radius: 19.5, theta: 0.36, phi: 1.46, target: new THREE.Vector3(0, 0, 0) };
  viewer.controls.frame(HOME, true);
  viewer.controls.saveHome();

  /* ---------------- 상태 & 애니메이션 ---------------- */

  let mode = "overview";
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
    mode = next;

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

  /* ---------------- Level 2 · 3 : 분자 확대 + 정보 ---------------- */

  let inspectId = null;

  function enterInspect(id) {
    if (!LIPID_BY_ID[id]) return;
    clearTweens();
    typeCycle = null;
    resetPS();
    inspectId = id;
    mode = "inspect";

    bilayer.visible = false;
    setWater(false); // 확대 화면에서는 배경 점을 치운다
    clearInspect();

    const g = buildLipid(id, { scale: 2.3 });
    g.position.y = id === "CHOL" ? 2.5 : 2.9;
    inspectGroup.add(g);
    inspectGroup.visible = true;
    inspectGroup.rotation.y = 0;

    const info = LIPID_BY_ID[id];
    const A = g.userData.parts.anchors;
    const toWorld = (v) => v.clone().multiplyScalar(2.3).add(g.position);

    const anno = [];
    if (A.head) anno.push([`머리 · ${info.head}`, toWorld(A.head), new THREE.Vector3(0, 0.7, 0)]);
    if (A.charge)
      anno.push([
        id === "PIP2" ? "인산기 (4번 · 5번) → 강한 음전하" : "카르복실기 → 알짜 음전하",
        toWorld(A.charge),
        new THREE.Vector3(2.4, 0.4, 0),
      ]);
    if (A.phosphate) anno.push(["인산 다리 (phosphodiester)", toWorld(A.phosphate), new THREE.Vector3(2.6, 0, 0)]);
    if (A.backbone) anno.push([info.backbone.split(" (")[0] + " 골격", toWorld(A.backbone), new THREE.Vector3(-2.8, 0, 0)]);
    if (A.ring) anno.push(["단단한 네 고리 골격", toWorld(A.ring), new THREE.Vector3(2.4, 0, 0)]);
    if (A.tail)
      anno.push([
        id === "CHOL" ? "짧은 탄화수소 꼬리" : "소수성 꼬리 (acyl chain) 2개",
        toWorld(A.tail),
        new THREE.Vector3(2.8, -0.4, 0),
      ]);

    for (const [text, pos, off] of anno) {
      const item = L.add(text, {
        anchor: pos,
        offset: off,
        variant: "anno",
        group: "inspect",
      });
      inspectLabels.push(item);
    }
    L.only(["inspect"]);

    viewer.controls.frame({ radius: id === "CHOL" ? 14 : 17, phi: 1.5, theta: 0.35, target: new THREE.Vector3(0, 0.1, 0) });

    setCaption(els, "inspect", `${info.abbr} · ${info.ko}`);
    showDetail(els, info);
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
  }

  function leaveInspect() {
    if (mode !== "inspect" && !inspectId) return;
    clearInspect();
    inspectGroup.visible = false;
    bilayer.visible = true;
    setWater(true);
    inspectId = null;
    hideDetail(els);
    highlightLegend(null);
  }

  viewer.onPick((id) => enterInspect(id));

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
    if (inspectGroup.visible) inspectGroup.rotation.y += dt * 0.28;
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
        viewer.labels.setEnabled(true);
        document.querySelector('[data-m1="labels"]').setAttribute("aria-pressed", "true");
      }
      if (a === "back") setMode("overview");
      if (a === "labels") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        viewer.labels.setEnabled(on);
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
    enterInspect(btn.dataset.lipid);
  });

  function syncButtons() {
    for (const b of buttons) {
      const a = b.dataset.m1;
      if (["overview", "types", "asymmetry", "psflip"].includes(a)) {
        b.setAttribute("aria-pressed", String(a === mode));
      }
    }
  }
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

function showDetail(els, info) {
  els.detailName.textContent = `${info.name} (${info.abbr})`;
  els.detailList.innerHTML = `
    <dt>한글 이름</dt><dd>${info.ko}</dd>
    <dt>골격</dt><dd>${info.backbone}</dd>
    <dt>머리 그룹</dt><dd>${info.head}</dd>
    <dt>전하 · 극성</dt><dd>${info.charge}</dd>
    <dt>주로 있는 곳</dt><dd><b>${info.leaflet}</b></dd>
    <dt>핵심 기능</dt><dd>${info.role}</dd>`;
  els.detail.hidden = false;
}

function hideDetail(els) {
  els.detail.hidden = true;
}
