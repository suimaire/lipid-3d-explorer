/* ============================================================
   지질의 생화학 3D 탐색기 — 진입점
   탭 전환 + 렌더 루프(보이는 모듈만 그린다)
   ============================================================ */

import { createMembraneModule } from "./modules/membrane.js";
import { createPip2Module } from "./modules/pip2.js";
import { createBetaModule } from "./modules/beta-oxidation.js";

const modules = {};
let current = "membrane";

function boot() {
  try {
    modules.membrane = createMembraneModule();
    modules.pip2 = createPip2Module();
    modules.beta = createBetaModule();
  } catch (err) {
    console.error("3D 모듈 초기화 실패:", err);
    return;
  }

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => select(tab.dataset.tab));
  });

  // 키보드: 좌우 화살표로 탭 이동
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    const order = ["membrane", "pip2", "beta"];
    const i = order.indexOf(current);
    if (e.key === "ArrowRight") select(order[(i + 1) % order.length]);
    if (e.key === "ArrowLeft") select(order[(i + order.length - 1) % order.length]);
  });

  select(current);
  requestAnimationFrame(loop);
}

function select(name) {
  if (!modules[name]) return;
  current = name;
  document.querySelectorAll(".tab").forEach((t) => {
    t.setAttribute("aria-selected", String(t.dataset.tab === name));
  });
  document.querySelectorAll(".module").forEach((m) => {
    m.hidden = m.dataset.module !== name;
  });
  for (const [key, mod] of Object.entries(modules)) mod.setActive(key === name);
  // 숨겨져 있던 캔버스는 크기를 다시 계산해야 한다
  requestAnimationFrame(() => modules[name].viewer.resize && modules[name].viewer.resize());
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // 탭 복귀 시 큰 점프 방지
  last = now;
  const mod = modules[current];
  if (mod) mod.render(dt);
  requestAnimationFrame(loop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
