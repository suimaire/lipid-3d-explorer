/* ============================================================
   원자 단위 지질 구조 자체 점검 (node scripts/qa/check-molecules.mjs)

   - 화학식(무거운 원자)과 실제로 만든 원자 수가 맞는지
   - 결합 길이가 상식적인 범위(1.1 ~ 1.75 Å)인지
   - 결합하지 않은 원자끼리 지나치게 가까운(겹치는) 곳이 없는지
   - 각 분자에 꼭 있어야 할 구조(에스터/아미드/인산/고리)가 있는지
   ============================================================ */

import { getMolecule, MOLECULE_IDS } from "../core/molecules.js";

let failed = 0;
const bad = (id, msg) => {
  failed++;
  console.log(`  ✗ ${id}: ${msg}`);
};

function parseFormula(f) {
  const out = {};
  for (const [, el, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (!el) continue;
    out[el] = (out[el] || 0) + (n ? Number(n) : 1);
  }
  return out;
}

/** 원자별 이웃 목록 */
function neighbors(mol) {
  const nb = mol.atoms.map(() => []);
  for (const b of mol.bonds) {
    nb[b.a].push(b.b);
    nb[b.b].push(b.a);
  }
  return nb;
}

/** a 에서 b 까지의 결합 수 (최대 3까지만 센다) */
function within3(nb, a) {
  const seen = new Set([a]);
  let front = [a];
  for (let d = 0; d < 3; d++) {
    const next = [];
    for (const i of front) {
      for (const j of nb[i]) {
        if (!seen.has(j)) {
          seen.add(j);
          next.push(j);
        }
      }
    }
    front = next;
  }
  return seen;
}


/** a-b-c-d 이면각(도) */
function torsion(A, B, C, D) {
  const s = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
  const cr = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
  const dt = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z;
  const b1 = s(B, A);
  const b2 = s(C, B);
  const b3 = s(D, C);
  const n1 = cr(b1, b2);
  const n2 = cr(b2, b3);
  const m1 = cr(n1, { x: b2.x, y: b2.y, z: b2.z });
  const L = Math.hypot(b2.x, b2.y, b2.z);
  return (Math.atan2(dt(m1, n2) / L, dt(n1, n2)) * 180) / Math.PI;
}

for (const id of MOLECULE_IDS) {
  const mol = getMolecule(id);
  const counts = {};
  for (const a of mol.atoms) counts[a.el] = (counts[a.el] || 0) + 1;
  const want = parseFormula(mol.formula);
  delete want.H; // 수소는 그리지 않는다

  console.log(
    `${id.padEnd(5)} ${mol.formula.padEnd(14)} 원자 ${String(mol.atoms.length).padStart(3)} · 결합 ${String(
      mol.bonds.length
    ).padStart(3)} · 반지름 ${mol.radius.toFixed(1)} Å`
  );

  for (const el of new Set([...Object.keys(want), ...Object.keys(counts)])) {
    if ((want[el] || 0) !== (counts[el] || 0))
      bad(id, `${el} 개수가 화학식과 다르다 (식 ${want[el] || 0} / 모델 ${counts[el] || 0})`);
  }

  // 결합 길이
  let minB = 9;
  let maxB = 0;
  for (const b of mol.bonds) {
    const A = mol.atoms[b.a];
    const B = mol.atoms[b.b];
    const d = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
    minB = Math.min(minB, d);
    maxB = Math.max(maxB, d);
    if (d < 1.1 || d > 1.75) bad(id, `결합 길이 이상: ${A.el}-${B.el} = ${d.toFixed(2)} Å`);
  }

  // 결합하지 않은 원자끼리의 최단 거리 (3결합 이내는 제외)
  const nb = neighbors(mol);
  let worst = { d: 99, i: -1, j: -1 };
  for (let i = 0; i < mol.atoms.length; i++) {
    const near = within3(nb, i);
    for (let j = i + 1; j < mol.atoms.length; j++) {
      if (near.has(j)) continue;
      const A = mol.atoms[i];
      const B = mol.atoms[j];
      const d = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
      if (d < worst.d) worst = { d, i, j };
    }
  }
  console.log(
    `      결합 ${minB.toFixed(2)}–${maxB.toFixed(2)} Å · 비결합 최단 ${worst.d.toFixed(2)} Å ` +
      `(${mol.atoms[worst.i].el}${worst.i}–${mol.atoms[worst.j].el}${worst.j})`
  );
  if (worst.d < 2.4) bad(id, `원자가 겹친다: ${worst.d.toFixed(2)} Å`);

  // 구조적으로 반드시 있어야 할 것들
  const has = (g) => mol.atoms.some((a) => a.group === g);
  const dbl = mol.bonds.filter((b) => b.order === 2).length;
  if (id !== "CHOL") {
    if (!mol.tags.phosphate) bad(id, "인산이 없다");
    if (!has("head")) bad(id, "머리 그룹이 없다");
  }
  if (["PC", "PE", "PS", "PI", "PIP2"].includes(id)) {
    if (mol.tags.amide !== undefined) bad(id, "글리세로인지질에 아미드가 있으면 안 된다");
    if (mol.tags.ester === undefined) bad(id, "에스터 결합이 없다");
    // P=O 1 + 에스터 C=O 2 + 올레오일 C=C 1 = 4, PS 는 −COO⁻ 로 1개, PIP2 는 인산 2개로 2개 더
    const wantDbl = 4 + (id === "PS" ? 1 : 0) + (id === "PIP2" ? 2 : 0);
    if (dbl !== wantDbl) bad(id, `이중결합 수가 다르다 (기대 ${wantDbl} / 모델 ${dbl})`);
  }
  if (id === "SM") {
    if (mol.tags.amide === undefined) bad(id, "아미드 결합이 없다");
    if (mol.tags.ester !== undefined) bad(id, "SM 에는 에스터가 없어야 한다");
  }
  if (id === "PIP2") {
    if (mol.tags.P4 === undefined || mol.tags.P5 === undefined) bad(id, "4번·5번 인산이 없다");
    const p = mol.atoms.filter((a) => a.el === "P").length;
    if (p !== 3) bad(id, `인 원자가 3개여야 한다 (현재 ${p})`);
  }
  // 탄소-탄소 이중결합의 cis / trans 확인
  const nbAll = neighbors(mol);
  for (const b of mol.bonds) {
    if (b.order !== 2) continue;
    const A = mol.atoms[b.a];
    const B = mol.atoms[b.b];
    if (A.el !== "C" || B.el !== "C") continue;
    const ra = nbAll[b.a].find((i) => i !== b.b && mol.atoms[i].el === "C");
    const rb = nbAll[b.b].find((i) => i !== b.a && mol.atoms[i].el === "C");
    if (ra === undefined || rb === undefined) continue;
    const t = Math.abs(torsion(mol.atoms[ra], A, B, mol.atoms[rb]));
    const want = id === "SM" || id === "CHOL" ? 180 : 0; // 올레오일은 cis, 스핑고신 Δ4 는 trans
    const label = want === 0 ? "cis" : "trans";
    console.log(`      C=C 이면각 ${t.toFixed(0)}° (${label} 기대)`);
    if (Math.abs(t - want) > 20) bad(id, `C=C 배치가 ${label} 가 아니다 (${t.toFixed(0)}°)`);
  }

  if (id === "CHOL") {
    const ringIdx = mol.atoms.map((a, i) => (a.group === "ring" ? i : -1)).filter((i) => i >= 0);
    if (ringIdx.length !== 19)
      bad(id, `스테로이드 고리 탄소 17 + 메틸 2 = 19 를 기대 (현재 ${ringIdx.length})`);
    // 네 고리(6-6-6-5)가 변을 공유하며 붙어 있으면 고리 내부 결합은 20개,
    // 여기에 메틸 2개를 더해 22개, 접합 탄소(이웃 3개 이상)는 6개여야 한다.
    const set = new Set(ringIdx);
    const inner = mol.bonds.filter((b2) => set.has(b2.a) && set.has(b2.b));
    if (inner.length !== 22) bad(id, `고리 골격 결합 22개를 기대 (현재 ${inner.length})`);
    const deg = new Map(ringIdx.map((i) => [i, 0]));
    for (const b2 of inner) {
      deg.set(b2.a, deg.get(b2.a) + 1);
      deg.set(b2.b, deg.get(b2.b) + 1);
    }
    const fused = [...deg.values()].filter((d) => d >= 3).length;
    if (fused !== 6) bad(id, `고리 접합 탄소 6개를 기대 (현재 ${fused})`);
  }
}

// 글리세로인지질의 머리 그룹만 다르고 나머지는 같아야 한다
const core = ["PC", "PE", "PS", "PI", "PIP2"].map((id) => {
  const m = getMolecule(id);
  return { id, chain: m.atoms.filter((a) => a.group === "chain").length };
});
const chainN = core[0].chain;
for (const c of core) if (c.chain !== chainN) bad(c.id, `아실 사슬 원자 수가 다르다 (${c.chain} ≠ ${chainN})`);

console.log(failed ? `\n실패 ${failed} 건` : "\n모든 점검 통과");
process.exit(failed ? 1 : 0);
