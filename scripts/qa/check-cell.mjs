/* Run: node scripts/qa/check-cell.mjs. No DOM, network, or test dependencies. */
import assert from "node:assert/strict";
import { THREE, Orbit } from "../core/viewer.js";
import { CELL, createWholeCell, inCutaway } from "../core/whole-cell.js";

const countIds = (records) => records.reduce((out, r) => {
  out[r.currentId] = (out[r.currentId] || 0) + 1; return out;
}, {});

for (const compact of [false, true]) {
  const start = performance.now();
  const cell = createWholeCell({ compact });
  const stats = cell.getStats();
  assert.equal(stats.batches, 4);
  const baseline = countIds(cell.records);
  const buffers = cell.pickables.map((mesh) => mesh.instanceMatrix);
  for (const r of cell.records) {
    if (r.id === "PIP2" || r.id === "PS") assert.equal(r.leaflet, "inner");
    assert.ok(Math.abs(r.normal.length() - 1) < 1e-10);
  }
  // Equal-area latitude bands should have equal counts, including polar bands.
  for (const leaflet of ["outer", "inner"]) {
    const records = cell.records.filter((r) => r.leaflet === leaflet && r.id !== "CHOL");
    const bands = Array(10).fill(0);
    for (const r of records) bands[Math.min(9, Math.floor((r.normal.y + 1) * 5))]++;
    assert.ok(Math.max(...bands) - Math.min(...bands) <= 1);
    // Actual head surfaces do not overlap; the exaggerated symbols still have space.
    let nearest = Infinity;
    for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
      nearest = Math.min(nearest, records[i].normal.distanceTo(records[j].normal) * CELL[leaflet]);
    }
    assert.ok(nearest > (compact ? 0.78 : 0.59), `${leaflet} minimum spacing ${nearest}`);
  }
  // Validate the actual GPU matrices, independently of quaternion construction.
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  for (const mesh of cell.pickables) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      pos.setFromMatrixPosition(matrix);
      yAxis.setFromMatrixColumn(matrix, 1).normalize();
      const radius = pos.length();
      const sign = yAxis.dot(pos.clone().normalize());
      assert.ok(radius > CELL.inner - 0.55 && radius < CELL.outer + 0.55);
      if (mesh.userData.partKind === "head") {
        if (radius > CELL.core) {
          assert.ok(Math.abs(radius - CELL.outer) < 0.001 && sign > 0.999);
          // -Y tail terminus approaches the midplane from the OUTSIDE.
          const end = pos.clone().addScaledVector(yAxis, -2.55).length();
          assert.ok(end > CELL.core && end < CELL.core + 0.06);
        } else {
          assert.ok(Math.abs(radius - CELL.inner) < 0.001 && sign < -0.999);
          // -Y tail terminus approaches the midplane from the INSIDE.
          const end = pos.clone().addScaledVector(yAxis, -2.55).length();
          assert.ok(end < CELL.core && end > CELL.core - 0.06);
        }
      }
      if (mesh.userData.partKind === "plate") assert.ok(radius > CELL.inner + 0.7 && radius < CELL.outer - 0.7);
      assert.ok(mesh.userData.pickIds[i]);
    }
  }
  cell.setState({ externalized: true });
  assert.deepEqual(countIds(cell.records), baseline, "PS exchange must conserve all lipid identities");
  const exposed = cell.records.filter((r) => r.leaflet === "outer" && r.currentId === "PS");
  assert.equal(exposed.length, stats.compact ? 25 : 44);
  assert.ok(exposed.length / cell.records.filter((r) => r.leaflet === "outer").length < 0.02);
  assert.ok(cell.records.every((r) => r.currentId !== "PIP2" || r.leaflet === "inner"));
  cell.setState({ cutaway: true });
  assert.ok(cell.getStats().visibleLipids < cell.records.length * 0.64);
  assert.ok(cell.records.every((r) => r.visible === !inCutaway(r.normal)));
  for (const [i, mesh] of cell.pickables.entries()) {
    assert.equal(mesh.instanceMatrix, buffers[i], "mode changes must reuse buffers");
    assert.ok(mesh.count <= mesh.instanceMatrix.count);
    assert.equal(mesh.userData.pickIds.length, mesh.count);
  }
  cell.setState({ externalized: false, cutaway: false, highlight: "PIP2" });
  assert.deepEqual(countIds(cell.records), baseline);
  assert.equal(cell.records.filter((r) => r.leaflet === "outer" && r.currentId === "PS").length, 0);
  const again = createWholeCell({ compact });
  assert.deepEqual(again.records.map((r) => [r.id, ...r.normal.toArray(), r.twist]),
    cell.records.map((r) => [r.id, ...r.normal.toArray(), r.twist]));
  console.log(`${compact ? "Compact" : "Desktop"}: ${stats.phospholipids} phospholipids + ${stats.cholesterol} sterols; 4 batches; orientation, distribution, PS conservation, cutaway, picking and reproducibility passed (${Math.round(performance.now() - start)} ms including checks).`);
}

// Exercise the real Orbit input handlers: pinch, clamping, release, drag and wheel.
const listeners = new Map();
const dom = { addEventListener(name, fn) { listeners.set(name, fn); } };
const controls = new Orbit(new THREE.PerspectiveCamera(), dom, new THREE.Vector3());
controls.minRadius = 16.6; controls.maxRadius = 80;
controls.frame({ radius: 40 }, true);
const send = (name, id, x, y) => listeners.get(name)({ pointerId: id, clientX: x, clientY: y, button: 0 });
send("pointerdown", 1, 100, 100); send("pointerdown", 2, 200, 100);
send("pointermove", 2, 300, 100);
assert.equal(controls.goal.radius, 20);
send("pointermove", 2, 1000, 100);
assert.equal(controls.goal.radius, controls.minRadius);
send("pointerup", 2, 1000, 100); send("pointerup", 1, 100, 100);
assert.ok(controls.moved > 6, "a completed pinch must not pick a lipid");
assert.equal(controls.dragging, false);
send("pointerdown", 3, 100, 100); send("pointermove", 3, 150, 100); send("pointerup", 3, 150, 100);
assert.ok(controls.goal.theta < 0);
listeners.get("wheel")({ deltaY: 10000, preventDefault() {} });
assert.equal(controls.goal.radius, controls.maxRadius);
controls.enabled = false;
const theta = controls.goal.theta;
send("pointerdown", 4, 100, 100); send("pointermove", 4, 300, 100);
assert.equal(controls.goal.theta, theta);
console.log("Orbit: touch pinch, no accidental selection, drag, wheel limits and transition lock passed.");
