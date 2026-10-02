/* ============================================================
   모듈 3 — 지방산 베타산화 (β-oxidation)
   미토콘드리아 기질 안에서 4단계가 반복되며 2탄소씩 잘려 나간다.
   ============================================================ */

import { Viewer, THREE, mat, bond, easeInOut, easeOut } from "../core/viewer.js";
import { buildStepList, markSteps } from "./pip2.js";

const START_C = 16;
const DX = 0.66; // 탄소 사이 간격
const X0 = 3.6; // C1 의 x 좌표
const ZIG = 0.19;

const C_CARBON = 0x6d7a84;
const C_ALPHA = 0x3f7d6b;
const C_BETA = 0xc0552f;
const C_OXY = 0xcf4b32;
const C_COA = 0x4b7fb5;
const C_SULFUR = 0xd0a244;
const C_ACETYL = 0x2f8f7a;
const C_FAD = 0xc8a13c;
const C_NAD = 0x5a76a8;

const STEPS = [
  {
    tag: "1단계",
    short: "산화 (FAD)",
    title: "① 산화 — α와 β 탄소 사이에 이중결합이 생긴다",
    text:
      "acyl-CoA dehydrogenase가 α(C2)와 β(C3) 탄소에서 수소를 하나씩 떼어 내 두 탄소 사이에 이중결합을 만듭니다(trans-Δ² -enoyl-CoA). 떼어 낸 전자와 수소는 FAD가 받아 FADH2가 됩니다.",
  },
  {
    tag: "2단계",
    short: "수화 (H2O)",
    title: "② 수화 — 이중결합에 물이 붙는다",
    text:
      "enoyl-CoA hydratase가 이중결합에 물 한 분자를 붙입니다. −OH는 β 탄소에, H는 α 탄소에 붙어 L-3-hydroxyacyl-CoA가 됩니다. 이 단계에서는 산화·환원이 일어나지 않습니다.",
  },
  {
    tag: "3단계",
    short: "산화 (NAD+)",
    title: "③ 산화 — β 탄소의 −OH가 케톤이 된다",
    text:
      "3-hydroxyacyl-CoA dehydrogenase가 β 탄소의 −OH를 케톤(C=O)으로 산화시키고, 이때 NAD+가 NADH가 됩니다. 이제 β 탄소가 카르보닐이 되어 바로 옆의 C–C 결합이 끊어지기 쉬운 상태가 됩니다.",
  },
  {
    tag: "4단계",
    short: "절단 (thiolysis)",
    title: "④ 절단 — acetyl-CoA가 떨어져 나온다",
    text:
      "thiolase가 새 CoA-SH를 이용해 α와 β 탄소 사이를 끊습니다. 탄소 2개짜리 acetyl-CoA가 떨어져 나가고, 남은 사슬은 탄소가 2개 짧아진 acyl-CoA가 되어 곧바로 다음 cycle로 들어갑니다.",
  },
];

const INTRO = {
  title: "출발 — 활성화된 지방산 (fatty acyl-CoA)",
  text:
    "지방산은 먼저 CoA가 붙은 fatty acyl-CoA 형태로 활성화됩니다. 긴 사슬은 카르니틴 셔틀을 거쳐 미토콘드리아 기질로 들어오고, 여기서부터 4단계가 반복됩니다. 카르보닐 탄소를 C1이라 하면 그다음이 α(C2), 그다음이 β(C3)입니다.",
};

const WHY = {
  title: "왜 β-산화라고 부를까?",
  text:
    "산화가 집중되는 자리가 카르보닐 탄소(C1)에서 두 번째 떨어진 β 탄소(C3)이기 때문입니다. β 탄소를 케톤으로 만들어 두면 α–β 사이의 C–C 결합이 끊어지기 쉬워지고, 그 결과 잘려 나오는 조각은 언제나 C1과 C2, 즉 탄소 2개짜리 acetyl-CoA가 됩니다.",
};

const cycleDone = (cycle, chainLen) => ({
  title: `cycle ${cycle} 완료 — 사슬이 탄소 2개만큼 짧아졌다`,
  text:
    `acetyl-CoA 1개가 떨어져 나가고 남은 사슬은 C${chainLen}이 되었습니다. 남은 사슬 끝에는 새 CoA가 붙어 있어, 곧바로 같은 4단계를 다시 시작할 수 있습니다. 지금까지 cycle ${cycle}회 · acetyl-CoA ${cycle + (chainLen === 0 ? 1 : 0)}개 · NADH ${cycle}개 · FADH2 ${cycle}개가 만들어졌습니다.`,
});

const DONE = {
  title: "완료 — 사슬이 모두 acetyl-CoA로 바뀌었다",
  text:
    "마지막 cycle에서 남은 탄소 4개짜리 사슬이 잘리면 acetyl-CoA 2개가 됩니다. C16(palmitoyl-CoA)은 7 cycle을 돌아 acetyl-CoA 8개, NADH 7개, FADH2 7개를 만듭니다.",
};

export function createBetaModule() {
  const viewer = new Viewer("canvas-beta");
  const els = {
    title: document.getElementById("m3-caption-title"),
    text: document.getElementById("m3-caption-text"),
    steps: document.getElementById("m3-steps"),
    chain: document.getElementById("m3-chain"),
    cycles: document.getElementById("m3-cycles"),
    acetyl: document.getElementById("m3-acetyl"),
    nadh: document.getElementById("m3-nadh"),
    fadh2: document.getElementById("m3-fadh2"),
    example: document.getElementById("m3-example"),
  };

  const tally = { cycles: 0, acetyl: 0, nadh: 0, fadh2: 0 };
  let chainLen = START_C;
  let stage = 0; // 0 = cycle 시작 전, 1..4 = 각 단계 완료
  let finished = false;

  buildStepList(els.steps, STEPS, (i) => gotoStage(i + 1));
  setCaption(INTRO);
  updateTally();

  if (!viewer.ok) {
    wireFallback();
    return { viewer, setActive() {}, render() {} };
  }

  /* ---------------- 장면 ---------------- */

  const root = new THREE.Group();
  viewer.scene.add(root);
  addMitochondrion(root);

  let chain = null; // {group, carbons[], bonds[], coa, oxy}
  const extras = new THREE.Group();
  root.add(extras);

  // 이중결합 / OH / 케톤 표시
  let dblBond = null;
  const oh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat(C_OXY, { rough: 0.35 }));
  oh.visible = false;
  extras.add(oh);
  const ketone = new THREE.Group();
  ketone.visible = false;
  extras.add(ketone);
  const ketO = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(C_OXY, { rough: 0.35 }));
  ketone.add(ketO);

  // 보조인자 슬롯
  const fad = makeCofactor(C_FAD, 1.6, 3.3);
  const nad = makeCofactor(C_NAD, -1.4, 3.3);
  extras.add(fad.group, nad.group);

  // 물 분자 (2단계)
  const water = makeWater();
  water.visible = false;
  extras.add(water);

  // 새 CoA-SH (4단계)
  const freeCoA = makeCoA(0.85);
  freeCoA.visible = false;
  extras.add(freeCoA);

  // 생성된 acetyl-CoA 쌓아 두는 곳
  const products = new THREE.Group();
  root.add(products);

  /* ---------------- 라벨 ---------------- */

  const L = viewer.labels;
  const lblMatrix = L.add("미토콘드리아 기질 (matrix)", {
    anchor: new THREE.Vector3(-6.6, -4.2, 0),
    variant: "zone",
    group: "zone",
  });
  const lblProducts = L.add("생성된 acetyl-CoA", {
    anchor: new THREE.Vector3(6.6, -1.0, 0),
    variant: "zone",
    group: "zone",
  });
  const lblFad = L.add("FAD", { anchor: fad.group, offset: new THREE.Vector3(0, 0.85, 0), variant: "anno", group: "cof" });
  const lblNad = L.add("NAD+", { anchor: nad.group, offset: new THREE.Vector3(0, 0.85, 0), variant: "anno", group: "cof" });
  const numberLabels = [];
  const lblBeta = L.add("β 탄소 — 여기가 산화된다", {
    anchor: new THREE.Vector3(0, 0, 0),
    offset: new THREE.Vector3(0, -1.15, 0),
    variant: "accent",
    group: "why",
    visible: false,
  });
  const lblEvent = L.add("", {
    anchor: new THREE.Vector3(0, 0, 0),
    variant: "accent",
    group: "event",
    visible: false,
  });
  L.only(["zone", "cof", "num"]);

  /* ---------------- 카메라 ---------------- */

  const HOME = { radius: 17.5, theta: 0.14, phi: 1.5, target: new THREE.Vector3(-0.4, 0.2, 0) };
  viewer.controls.autoRotate = false; // 설명용 장면이라 자동 회전은 끈다
  viewer.controls.frame(HOME, true);
  viewer.controls.saveHome();

  /* ---------------- 사슬 만들기 ---------------- */

  let showNumbers = true;
  let whyMode = false;
  let auto = null; // {mode:'cycle'|'repeat', timer}

  function carbonPos(i) {
    // i: 0-based (0 = C1)
    return new THREE.Vector3(X0 - i * DX, i % 2 === 0 ? ZIG : -ZIG, 0);
  }

  function buildChainMesh(n) {
    if (chain) {
      root.remove(chain.group);
      chain.group.traverse((o) => o.geometry && o.geometry.dispose && o.isMesh && o.geometry.dispose());
    }
    const group = new THREE.Group();
    const carbons = [];
    const bonds = [];
    const cMat = mat(C_CARBON, { rough: 0.45 });
    const aMat = mat(C_ALPHA, { rough: 0.4 });
    const bMat = mat(C_BETA, { rough: 0.4 });
    const geo = new THREE.SphereGeometry(0.25, 12, 9);

    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, i === 1 ? aMat : i === 2 ? bMat : cMat);
      m.position.copy(carbonPos(i));
      group.add(m);
      carbons.push(m);
      if (i > 0) {
        const b = bond(carbonPos(i - 1), carbonPos(i), 0.085, cMat, 6);
        group.add(b);
        bonds.push(b);
      }
    }

    // C1 의 카르보닐 산소
    const oxy = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(C_OXY, { rough: 0.35 }));
    oxy.position.copy(carbonPos(0)).add(new THREE.Vector3(0, 0.62, 0));
    group.add(oxy);
    group.add(bond(carbonPos(0), oxy.position, 0.07, mat(C_OXY, { rough: 0.4 }), 6));

    // CoA (오른쪽 끝, 티오에스터 결합)
    const coa = makeCoA(1);
    coa.position.copy(carbonPos(0)).add(new THREE.Vector3(1.25, 0.1, 0));
    group.add(coa);
    group.add(bond(carbonPos(0), coa.position.clone().add(new THREE.Vector3(-0.42, 0, 0)), 0.075, mat(C_SULFUR, { rough: 0.4 }), 6));

    root.add(group);
    chain = { group, carbons, bonds, coa, oxy, n };
    refreshNumberLabels();
    return chain;
  }

  function refreshNumberLabels() {
    for (const it of numberLabels) {
      it.el.remove();
      const i = L.items.indexOf(it);
      if (i >= 0) L.items.splice(i, 1);
    }
    numberLabels.length = 0;
    // 라벨끼리 겹치지 않도록 위·아래로 엇갈리게 배치한다
    const defs = [
      [0, "C1 (카르보닐)", 0.75, 1.65],
      [1, "C2 · α", 0.15, -1.15],
      [2, "C3 · β", -0.1, 1.0],
      [3, "C4", -0.15, -1.15],
    ];
    for (const [i, text, dx, dy] of defs) {
      if (i >= chain.n) continue;
      const item = L.add(text, {
        anchor: chain.carbons[i],
        offset: new THREE.Vector3(dx, dy, 0),
        variant: i === 2 ? "accent" : "anno",
        group: "num",
      });
      numberLabels.push(item);
    }
    if (chain.n > 5) {
      const item = L.add(`나머지 사슬 (총 C${chain.n})`, {
        anchor: chain.carbons[chain.n - 2],
        offset: new THREE.Vector3(-0.2, 1.1, 0),
        variant: "anno",
        group: "num",
      });
      numberLabels.push(item);
    }
    if (!showNumbers) L.show("num", false);
    lblBeta.anchor = chain.carbons[2] || chain.carbons[0];
  }

  buildChainMesh(chainLen);

  /* ---------------- 애니메이션 ---------------- */

  const tweens = [];
  function tw(dur, fn, done) {
    tweens.push({ t: 0, dur, fn, done });
  }
  /** 진행 중인 애니메이션을 끝 상태로 즉시 확정한다(빠르게 눌러도 상태가 어긋나지 않도록). */
  function flushTweens() {
    let guard = 0;
    while (tweens.length && guard++ < 20) {
      const list = tweens.slice();
      tweens.length = 0;
      for (const t of list) {
        t.fn(1);
        t.done && t.done();
      }
    }
    tweens.length = 0;
  }
  /** 애니메이션을 버린다(Reset 전용 — done 콜백을 실행하지 않는다). */
  function dropTweens() {
    tweens.length = 0;
  }

  function clearStageVisuals() {
    if (dblBond) {
      extras.remove(dblBond);
      dblBond = null;
    }
    oh.visible = false;
    ketone.visible = false;
    water.visible = false;
    freeCoA.visible = false;
    lblEvent.visible = false;
    fad.set(false);
    nad.set(false);
    L.setText(lblFad, "FAD");
    L.setText(lblNad, "NAD+");
  }

  /** 특정 단계 상태로 즉시(또는 애니메이션으로) 이동 */
  function gotoStage(s, animate = true) {
    flushTweens(); // 이전 단계 애니메이션을 끝낸 뒤 현재 stage 를 읽는다
    if (finished) return;
    if (s < 0) s = 0;
    if (s > 4) s = 4;
    // 되돌아갈 때는 상태를 다시 만든다
    if (s < stage) {
      clearStageVisuals();
      stage = 0;
      for (let i = 1; i <= s; i++) applyStage(i, false);
      stage = s;
      updateCaption();
      return;
    }
    for (let i = stage + 1; i <= s; i++) applyStage(i, animate && i === s);
    stage = s;
    updateCaption();
  }

  function applyStage(s, animate) {
    if (!chain) return;
    if (s === 1) {
      // 이중결합 + FADH2
      const a = chain.carbons[1].position;
      const b = chain.carbons[2].position;
      dblBond = bond(
        a.clone().add(new THREE.Vector3(0, 0.17, 0.17)),
        b.clone().add(new THREE.Vector3(0, 0.17, 0.17)),
        0.06,
        mat(C_BETA, { rough: 0.4 }),
        6
      );
      extras.add(dblBond);
      fad.set(true);
      L.setText(lblFad, "FADH2");
      showEvent("이중결합 생성 · FAD → FADH2", chain.carbons[2], animate);
      if (animate) {
        const db = dblBond; // 도중에 dblBond 가 지워져도 안전하게
        db.scale.set(0.01, 0.01, 1);
        tw(0.5, (p) => db.scale.set(easeOut(p), easeOut(p), 1));
        fad.pop();
      }
    }
    if (s === 2) {
      if (dblBond) {
        extras.remove(dblBond);
        dblBond = null;
      }
      oh.visible = true;
      oh.position.copy(chain.carbons[2].position).add(new THREE.Vector3(0, -0.62, 0));
      water.visible = false;
      showEvent("β 탄소에 −OH 가 붙는다 (물 첨가)", chain.carbons[2], animate);
      if (animate) {
        water.visible = true;
        water.position.set(-1.2, -3.2, 1.6);
        const to = chain.carbons[2].position.clone().add(new THREE.Vector3(0, -0.62, 0));
        const from = water.position.clone();
        tw(
          0.8,
          (p) => water.position.lerpVectors(from, to, easeInOut(p)),
          () => (water.visible = false)
        );
        oh.scale.setScalar(0.01);
        tw(0.9, (p) => oh.scale.setScalar(Math.max(0.01, easeOut(p))));
      } else {
        oh.scale.setScalar(1);
      }
    }
    if (s === 3) {
      oh.visible = false;
      ketone.visible = true;
      ketone.position.copy(chain.carbons[2].position).add(new THREE.Vector3(0, -0.66, 0));
      nad.set(true);
      L.setText(lblNad, "NADH");
      showEvent("β 탄소가 케톤(C=O)이 된다 · NAD+ → NADH", chain.carbons[2], animate);
      if (animate) {
        ketone.scale.setScalar(0.01);
        tw(0.5, (p) => ketone.scale.setScalar(Math.max(0.01, easeOut(p))));
        nad.pop();
      }
    }
    if (s === 4) {
      doThiolysis(animate);
    }
  }

  function showEvent(text, anchor, animate) {
    L.setText(lblEvent, text);
    lblEvent.anchor = anchor;
    lblEvent.offset.set(0, 1.6, 0);
    lblEvent.visible = true;
  }

  function doThiolysis(animate) {
    if (!chain) return;
    const leaving = [];
    // 떨어져 나가는 조각: C1, C2, 카르보닐 산소, 원래 CoA, 그 사이 결합
    leaving.push(chain.carbons[0], chain.carbons[1], chain.oxy, chain.coa);
    if (chain.bonds[0]) leaving.push(chain.bonds[0]);

    freeCoA.visible = true;
    freeCoA.position.set(chain.carbons[2].position.x - 0.4, -2.6, 1.2);

    const dest = new THREE.Vector3(6.2, -2.4 + Math.min(tally.acetyl, 7) * 0.62, 0);
    const start = leaving.map((o) => o.position.clone());

    const finish = () => {
      // 남은 사슬로 다시 그린다 (탄소 2개 감소)
      chainLen -= 2;
      tally.cycles += 1;
      tally.acetyl += 1;
      tally.nadh += 1;
      tally.fadh2 += 1;
      addProductIcon(tally.acetyl);
      clearStageVisuals();
      if (chainLen <= 2) {
        // 마지막 조각(탄소 2개) 자체가 acetyl-CoA
        tally.acetyl += 1;
        addProductIcon(tally.acetyl);
        chainLen = 0;
        finished = true;
        if (chain) {
          root.remove(chain.group);
          chain = null;
        }
        for (const it of numberLabels) {
          it.el.remove();
          const i = L.items.indexOf(it);
          if (i >= 0) L.items.splice(i, 1);
        }
        numberLabels.length = 0;
        stage = 0;
        auto = null;
        updateTally();
        setCaption(DONE);
        markSteps(els.steps, -1);
        return;
      }
      buildChainMesh(chainLen);
      stage = 0;
      updateTally();
      setCaption(cycleDone(tally.cycles, chainLen));
      markSteps(els.steps, -1);
    };

    if (!animate) {
      finish();
      return;
    }

    // 자르는 순간
    if (chain.bonds[1]) {
      const b = chain.bonds[1];
      tw(0.3, (p) => b.scale.setScalar(1 - p), () => (b.visible = false));
    }
    showEvent("C2–C3 결합이 끊어진다", chain.carbons[2], true);

    tw(
      1.2,
      (p) => {
        const e = easeInOut(p);
        leaving.forEach((o, i) => {
          o.position.lerpVectors(start[i], dest.clone().add(new THREE.Vector3(i * 0.05, 0, 0)), e);
          o.scale.setScalar(1 - e * 0.55);
        });
        freeCoA.position.lerp(chain.carbons[2].position, 0.06);
      },
      finish
    );
  }

  function addProductIcon(n) {
    if (n > 8) return;
    const g = new THREE.Group();
    const m = mat(C_ACETYL, { rough: 0.45 });
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m);
    b.position.x = 0.36;
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(C_COA, { rough: 0.45 }));
    c.position.x = 0.86;
    g.add(a, b, c);
    g.position.set(6.0, -2.4 + (n - 1) * 0.62, 0);
    g.scale.setScalar(0.01);
    products.add(g);
    tw(0.4, (p) => g.scale.setScalar(Math.max(0.01, easeOut(p))));
  }

  /* ---------------- 캡션 · 카운터 ---------------- */

  function updateCaption() {
    if (finished) return;
    if (whyMode) {
      setCaption(WHY);
      markSteps(els.steps, -1);
      return;
    }
    if (stage === 0) setCaption(INTRO);
    else setCaption(STEPS[stage - 1]);
    markSteps(els.steps, stage - 1);
    updateTally();
  }

  function updateTally() {
    els.cycles.textContent = tally.cycles;
    els.acetyl.textContent = tally.acetyl;
    els.nadh.textContent = tally.nadh;
    els.fadh2.textContent = tally.fadh2;
    els.chain.textContent = chainLen > 0 ? `C${chainLen} acyl-CoA` : "사슬 없음 · 완료";
  }

  /* ---------------- 프레임 ---------------- */

  viewer.onUpdate((dt) => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      t.fn(p);
      if (p >= 1) {
        tweens.splice(i, 1);
        t.done && t.done();
      }
    }
    fad.update(dt);
    nad.update(dt);
    if (auto && tweens.length === 0) {
      auto.timer += dt;
      if (auto.timer > 1.5) {
        auto.timer = 0;
        if (finished) {
          auto = null;
        } else if (stage < 4) {
          gotoStage(stage + 1);
        } else if (auto.mode === "repeat") {
          // 다음 cycle 로 계속
          gotoStage(1);
        } else {
          auto = null;
        }
        syncButtons();
      }
    }
  });

  /* ---------------- UI ---------------- */

  const btns = document.querySelectorAll("[data-m3]");
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.m3;
      if (a === "cycle") {
        whyMode = false;
        flushTweens();
        if (finished) return;
        if (stage >= 4) stage = 0;
        auto = { mode: "cycle", timer: 1.4 };
      }
      if (a === "repeat") {
        whyMode = false;
        flushTweens();
        if (finished) return;
        auto = { mode: "repeat", timer: 1.4 };
      }
      if (a === "next") {
        whyMode = false;
        auto = null;
        flushTweens();
        if (stage >= 4) gotoStage(1);
        else gotoStage(stage + 1);
      }
      if (a === "prev") {
        whyMode = false;
        auto = null;
        flushTweens();
        gotoStage(stage - 1);
      }
      if (a === "numbers") {
        showNumbers = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(showNumbers));
        L.show("num", showNumbers);
      }
      if (a === "why") {
        whyMode = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(whyMode));
        lblBeta.visible = whyMode;
        if (whyMode) {
          auto = null;
          if (chain) {
            chain.carbons[2].scale.setScalar(1.5);
            viewer.controls.frame({ radius: 13, theta: 0.12, phi: 1.5, target: new THREE.Vector3(1.6, 0, 0) });
          }
          setCaption(WHY);
          markSteps(els.steps, -1);
        } else {
          if (chain) chain.carbons[2].scale.setScalar(1);
          viewer.controls.frame(HOME);
          updateCaption();
        }
      }
      if (a === "example") {
        const on = els.example.hidden;
        els.example.hidden = !on;
        b.setAttribute("aria-pressed", String(on));
      }
      if (a === "reset") resetAll();
      syncButtons();
    });
  });

  function resetAll() {
    dropTweens();
    auto = null;
    whyMode = false;
    finished = false;
    stage = 0;
    chainLen = START_C;
    tally.cycles = tally.acetyl = tally.nadh = tally.fadh2 = 0;
    clearStageVisuals();
    while (products.children.length) products.remove(products.children[0]);
    buildChainMesh(chainLen);
    lblBeta.visible = false;
    document.querySelector('[data-m3="why"]').setAttribute("aria-pressed", "false");
    viewer.controls.frame(HOME);
    setCaption(INTRO);
    markSteps(els.steps, -1);
    updateTally();
    syncButtons();
  }

  function syncButtons() {
    const cycleBtn = document.querySelector('[data-m3="cycle"]');
    const repeatBtn = document.querySelector('[data-m3="repeat"]');
    cycleBtn.setAttribute("aria-pressed", String(!!auto && auto.mode === "cycle"));
    repeatBtn.setAttribute("aria-pressed", String(!!auto && auto.mode === "repeat"));
  }

  function setCaption(c) {
    els.title.textContent = c.title;
    els.text.textContent = c.text;
  }

  function wireFallback() {
    document.querySelectorAll("[data-m3]").forEach((b) => {
      b.addEventListener("click", () => {
        const a = b.dataset.m3;
        if (a === "next") { stage = Math.min(4, stage + 1); setCaption(stage ? STEPS[stage - 1] : INTRO); markSteps(els.steps, stage - 1); }
        if (a === "prev") { stage = Math.max(0, stage - 1); setCaption(stage ? STEPS[stage - 1] : INTRO); markSteps(els.steps, stage - 1); }
        if (a === "why") setCaption(WHY);
        if (a === "example") { els.example.hidden = !els.example.hidden; b.setAttribute("aria-pressed", String(!els.example.hidden)); }
        if (a === "reset") { stage = 0; setCaption(INTRO); markSteps(els.steps, -1); }
      });
    });
  }

  updateCaption();

  return {
    viewer,
    setActive(on) {
      viewer.setActive(on);
      if (!on) { auto = null; syncButtons(); }
    },
    render(dt) { viewer.render(dt); },
  };
}

/* ---------------- 부품 ---------------- */

function makeCoA(scale) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(C_SULFUR, { rough: 0.4 }));
  s.position.x = -0.42;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), mat(C_COA, { rough: 0.5 }));
  g.add(s, body);
  g.scale.setScalar(scale);
  return g;
}

function makeWater() {
  const g = new THREE.Group();
  const o = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(C_OXY, { rough: 0.35 }));
  const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xdfe6ea, { rough: 0.5 }));
  const h2 = h1.clone();
  h1.position.set(0.2, 0.16, 0);
  h2.position.set(-0.2, 0.16, 0);
  g.add(o, h1, h2);
  return g;
}

function makeCofactor(color, x, y) {
  const group = new THREE.Group();
  const pale = mat(color, { rough: 0.6, opacity: 0.45 });
  const full = mat(color, { rough: 0.35 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.2, 12), pale);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);
  group.position.set(x, y, 0);
  let popT = -1;
  return {
    group,
    set(on) {
      disc.material = on ? full : pale;
      if (!on) group.position.set(x, y, 0);
    },
    pop() {
      popT = 0;
    },
    update(dt) {
      if (popT < 0) return;
      popT += dt;
      group.position.y = y + Math.min(popT * 0.6, 0.6);
      if (popT > 1.2) popT = -1;
    },
  };
}

function addMitochondrion(root) {
  // 기질(matrix)을 감싸는 내막을 아주 옅게 표현 — 위치를 헷갈리지 않도록
  const shell = new THREE.Mesh(
    new THREE.CapsuleGeometry(6.2, 8.5, 6, 20),
    new THREE.MeshStandardMaterial({
      color: 0xbfd4d8,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      roughness: 0.9,
      depthWrite: false,
    })
  );
  shell.rotation.z = Math.PI / 2;
  shell.position.set(0, 0, 0);
  root.add(shell);

  // 크리스타(주름) 힌트
  const cMat = new THREE.MeshStandardMaterial({
    color: 0xa9c3c8,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    roughness: 0.9,
    depthWrite: false,
  });
  for (const [x, y, rot] of [
    [-6.0, 3.0, 0.35],
    [5.8, -3.2, -0.4],
    [-5.4, -3.6, -0.25],
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), cMat);
    p.position.set(x, y, -1.5);
    p.rotation.z = rot;
    root.add(p);
  }
}
