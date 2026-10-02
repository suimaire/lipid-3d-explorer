/* Closed bilayer built from the SAME buildLipid templates as the flat patch.
 * Only four geometry batches, regardless of the number of molecules.
 * No sphere mesh, texture shell, or transparent surface stands in for lipids.
 */
import { THREE, mat } from "./viewer.js";
import { buildLipid, COLOR, GEO, LIPIDS, rng } from "./lipids.js";
import { OUTER_MIX, INNER_MIX, expandMix } from "./membrane-composition.js";

export const CELL = Object.freeze({ core: 10, outer: 12.6, inner: 7.4, seed: 20261002 });
export const CUT_NORMAL = new THREE.Vector3(0.28, 0.12, 1).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Equal-area bands, with no duplicate samples or concentration at the poles. */
export function fibonacciNormal(index, count, phase = 0) {
  const y = 1 - 2 * (index + 0.5) / count;
  const r = Math.sqrt(1 - y * y);
  const a = index * GOLDEN_ANGLE + phase;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

export function inCutaway(normal) {
  return normal.dot(CUT_NORMAL) > 0.24;
}

/** Local +Y points toward water; the existing template's tails point along -Y. */
export function lipidQuaternion(normal, leaflet, twist = 0) {
  const waterDirection = normal.clone().multiplyScalar(leaflet === "outer" ? 1 : -1);
  return new THREE.Quaternion().setFromUnitVectors(UP, waterDirection)
    .multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
}

export function createWholeCell({ compact = false } = {}) {
  const group = new THREE.Group();
  group.name = "whole-cell-bilayer";
  const random = rng(CELL.seed);
  const outerCount = compact ? 1800 : 3200;
  const innerCount = Math.round(outerCount * (CELL.inner / CELL.outer) ** 2);
  // Fewer, slightly wider symbols on narrow/low-memory devices; radial length is unchanged.
  const width = compact ? Math.sqrt(3200 / 1800) : 1;
  const records = [];
  for (const [leaflet, count, mix, phase] of [
    ["outer", outerCount, OUTER_MIX, 0],
    ["inner", innerCount, INNER_MIX, 0.71],
  ]) {
    const ids = expandMix(mix, count, random);
    for (let i = 0; i < count; i++) {
      const normal = fibonacciNormal(i, count, phase);
      records.push({ id: ids[i], leaflet, normal, radius: CELL[leaflet], twist: random() * Math.PI * 2 });
    }
  }

  // Sterol OH is just beneath the head plane; rings and short tail lie in the core.
  // Place in local gaps between neighbouring phospholipids, not on their head positions.
  for (const leaflet of ["outer", "inner"]) {
    const neighbors = records.filter((r) => r.leaflet === leaflet);
    const count = Math.round(neighbors.length * 0.07);
    for (let i = 0; i < count; i++) {
      const a = neighbors[Math.floor((i + 0.5) * neighbors.length / count)];
      let first = null, second = null, d1 = Infinity, d2 = Infinity;
      for (const b of neighbors) {
        if (b === a) continue;
        const d = a.normal.distanceToSquared(b.normal);
        if (d < d1) { second = first; d2 = d1; first = b; d1 = d; }
        else if (d < d2) { second = b; d2 = d; }
      }
      const normal = a.normal.clone().add(first.normal).add(second.normal).normalize();
      records.push({ id: "CHOL", leaflet, normal,
        radius: CELL[leaflet] + (leaflet === "outer" ? -0.42 : 0.42), twist: a.twist });
    }
  }

  // A fixed, modest subset of inner PS exchanges sites with outer PC/PE.
  // Both identities are conserved. This is a before/after teaching model, not a trajectory.
  const ps = records.filter((r) => r.id === "PS" && r.leaflet === "inner");
  const exchangeCount = Math.round(ps.length * 0.18);
  const used = new Set();
  const exchanges = ps.filter((_, i) => i % Math.max(1, Math.floor(ps.length / exchangeCount)) === 0)
    .slice(0, exchangeCount).map((inner) => {
      const outer = records.filter((r) => r.leaflet === "outer" && ["PC", "PE"].includes(r.id) && !used.has(r))
        .reduce((best, r) => !best || r.normal.dot(inner.normal) > best.normal.dot(inner.normal) ? r : best, null);
      used.add(outer);
      return { inner, outer };
    });

  // Extract each template once, keeping its part transforms and exact palette.
  const templates = new Map();
  const batches = new Map();
  for (const { id } of LIPIDS) {
    const template = buildLipid(id);
    template.updateMatrixWorld(true);
    const parts = [];
    template.traverse((part) => {
      if (!part.isMesh) return;
      const key = part.geometry.uuid;
      if (!batches.has(key)) batches.set(key, { geometry: part.geometry, capacity: 0 });
      parts.push({ key, matrix: part.matrixWorld.clone(), color: part.material.color.clone() });
    });
    templates.set(id, parts);
  }
  // Capacity remains sufficient even when PS and a shorter template exchange sites.
  for (const rec of records) for (const part of templates.get(rec.id)) batches.get(part.key).capacity++;
  for (const batch of batches.values()) {
    const kind = Object.keys(GEO).find((key) => GEO[key] === batch.geometry);
    // Keep the same symbols and transforms; small-screen heads need fewer facets.
    const geometry = compact && kind === "head" ? new THREE.SphereGeometry(1, 10, 7)
      : compact && kind === "bead" ? new THREE.SphereGeometry(1, 8, 5)
      : batch.geometry;
    const material = mat(0xffffff, { rough: batch.geometry === GEO.head ? 0.4 : 0.6 }).clone();
    const mesh = new THREE.InstancedMesh(geometry, material, batch.capacity);
    mesh.name = "cell-lipid-batch";
    mesh.userData.partKind = kind;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.pickIds = [];
    // A fixed conservative bound avoids recomputing thousands of bounds on mode changes.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CELL.outer + 1);
    batch.mesh = mesh;
    group.add(mesh);
  }

  const dummy = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const dim = new THREE.Color(COLOR.DIM);
  let cutaway = false;
  let externalized = false;
  let highlight = null;

  function rebuild() {
    for (const b of batches.values()) b.count = 0;
    const swapped = new Map();
    if (externalized) for (const { inner, outer } of exchanges) {
      swapped.set(inner, outer.id);
      swapped.set(outer, "PS");
    }
    for (const rec of records) {
      rec.currentId = swapped.get(rec) || rec.id;
      rec.visible = !cutaway || !inCutaway(rec.normal);
      if (!rec.visible) continue;
      dummy.position.copy(rec.normal).multiplyScalar(rec.radius);
      dummy.quaternion.copy(lipidQuaternion(rec.normal, rec.leaflet, rec.twist));
      dummy.scale.set(width, 1, width);
      dummy.updateMatrix();
      for (const part of templates.get(rec.currentId)) {
        const b = batches.get(part.key);
        const index = b.count++;
        matrix.multiplyMatrices(dummy.matrix, part.matrix);
        b.mesh.setMatrixAt(index, matrix);
        b.mesh.setColorAt(index, highlight && rec.currentId !== highlight ? dim : part.color);
        b.mesh.userData.pickIds[index] = rec.currentId;
      }
    }
    for (const b of batches.values()) {
      b.mesh.count = b.count;
      b.mesh.userData.pickIds.length = b.count;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }

  // Subordinate water hints, wholly outside or wholly inside the head planes.
  const water = new THREE.Group();
  water.name = "aqueous-compartments";
  for (const inside of [false, true]) {
    const count = inside ? 100 : 80;
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const n = fibonacciNormal(i, count, random() * Math.PI * 2);
      const radius = inside ? Math.cbrt(random()) * (CELL.inner - 0.9) : CELL.outer + 1.2 + random() * 2.8;
      n.multiplyScalar(radius).toArray(points, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    const dots = new THREE.Points(geo, new THREE.PointsMaterial({
      color: inside ? 0x9ebac8 : COLOR.WATER, size: inside ? 0.13 : 0.11,
      transparent: true, opacity: inside ? 0.45 : 0.55, depthWrite: false,
    }));
    water.add(dots);
  }
  group.add(water);
  rebuild();

  return {
    group, records, exchanges, compact,
    pickables: [...batches.values()].map((b) => b.mesh),
    setState(next = {}) {
      const c = next.cutaway ?? cutaway;
      const e = next.externalized ?? externalized;
      const h = next.highlight === undefined ? highlight : next.highlight;
      if (c === cutaway && e === externalized && h === highlight) return;
      cutaway = c; externalized = e; highlight = h;
      rebuild();
    },
    getStats() {
      return { phospholipids: outerCount + innerCount, cholesterol: records.length - outerCount - innerCount,
        visibleLipids: records.filter((r) => r.visible).length,
        externalPS: externalized ? exchanges.length : 0,
        batches: batches.size, cutaway, compact };
    },
  };
}
