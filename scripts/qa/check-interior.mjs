/* Run: node scripts/qa/check-interior.mjs. No DOM, network, or test dependencies.
 * Checks rendered geometry and buffer lifetime, not just the teaching captions.
 */
import assert from "node:assert/strict";
import { THREE } from "../core/viewer.js";
import { createCellInterior, INTERIOR } from "../core/cell-interior.js";

const modes = ["overview", "continuity", "excitation", "triad", "nmj", "tubule", "sr"];
const vectorFinite = (v) => [v.x, v.y, v.z].every(Number.isFinite);

function inspectTopology(scene) {
  const stats = scene.getStats(), details = stats.diagnostic;
  const membrane = scene.group.getObjectByName("continuous-sarcolemma-and-t-tubule");
  const geometry = membrane.geometry, position = geometry.getAttribute("position"), index = geometry.index;
  const { surfaceHole: aperture, hollowTube: tube } = details.membrane;
  // Inspect actual edge sharing. Shell outer face bends into the lumen-facing
  // wall; shell inner face bends into the cytosol-facing wall, with no seam cap.
  const edgeMaterials = new Map();
  for (const group of geometry.groups) for (let i = group.start; i < group.start + group.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeMaterials.has(key)) edgeMaterials.set(key, []);
      edgeMaterials.get(key).push(group.materialIndex);
    }
  }
  for (const [ring, expected] of [[aperture.outerIndices, [0, 4]], [aperture.innerIndices, [1, 3]]]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      assert.deepEqual(edgeMaterials.get(key)?.sort(), expected, "each mouth edge belongs to both the shell and correct T wall");
    }
  }
  assert.deepEqual(aperture.outerIndices, tube.lumenRings[0]);
  assert.deepEqual(aperture.innerIndices, tube.outerRings[0]);
  const mouth = new THREE.Vector3(...aperture.center), normal = mouth.clone().setX(0).normalize();
  scene.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(mouth.clone().add(normal), normal.clone().negate(), 0, 1.55);
  assert.equal(ray.intersectObject(membrane).length, 0, "actual mesh has no shell face or cap over the T mouth");
  assert.ok(tube.path.some(({ center: [, y, z] }) => Math.hypot(y, z) < 4), "invagination reaches deep inside the fiber");
  assert.ok(stats.cutawayFraction >= 1 / 3 && stats.cutawayFraction <= 1 / 2, "one-third to one-half longitudinal cutaway");
  assert.ok(membrane.material.every(m => m.opacity === 1 && !m.transparent), "cutaway uses opaque membrane walls");

  const tBox = new THREE.Box3();
  for (const ring of tube.outerRings.slice(Math.ceil(tube.outerRings.length * 0.27))) {
    for (const id of ring) tBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, id));
  }
  const cisternae = scene.group.getObjectByName("separate-sr-terminal-cisternae").children
    .filter(o => o.isMesh && !o.isInstancedMesh).sort((a, b) => {
      a.geometry.computeBoundingBox(); b.geometry.computeBoundingBox();
      return a.geometry.boundingBox.min.x - b.geometry.boundingBox.min.x;
    });
  assert.equal(cisternae.length, 2, "one T-tubule is flanked by exactly two terminal cisternae");
  const gaps = [tBox.min.x - cisternae[0].geometry.boundingBox.max.x, cisternae[1].geometry.boundingBox.min.x - tBox.max.x];
  for (const gap of gaps) assert.ok(gap > 0.3 && Math.abs(gap - INTERIOR.junctionalGap) < 0.03,
    `actual T and SR surfaces remain separated: ${gap}`);
  assert.ok(cisternae.every(c => c.geometry !== geometry), "SR is a distinct geometry from the plasma membrane");

  // Validate instanced SR endpoints against the actual GPU transformations, then
  // verify the network wraps each fibril and stays clear of the T membrane.
  const sr = scene.group.getObjectByName("sr-wrapping-network"), matrix = new THREE.Matrix4();
  details.srSegments.forEach((segment, i) => {
    sr.getMatrixAt(i, matrix);
    const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix), b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix);
    assert.ok(a.distanceTo(new THREE.Vector3(...segment.a)) < 2e-5 && b.distanceTo(new THREE.Vector3(...segment.b)) < 2e-5,
      "SR diagnostic segments describe rendered instance endpoints");
    const lo = Math.min(a.x, b.x) - segment.radius, hi = Math.max(a.x, b.x) + segment.radius;
    assert.ok(hi < tBox.min.x - 0.1 || lo > tBox.max.x + 0.1, "SR branches do not cross or fuse with the T wall");
  });
  for (const [, y, z] of details.myofibrilCenters) {
    const angles = new Set();
    for (const { a, b } of details.srSegments) {
      if (Math.abs(a[0] - b[0]) > 0.01) continue;
      const r = Math.hypot(a[1] - y, a[2] - z);
      if (r > details.myofibrilRadius + 0.15 && r < details.myofibrilRadius + 0.4) {
        angles.add(Math.floor((Math.atan2(a[1] - y, a[2] - z) + Math.PI) / (Math.PI / 2)) % 4);
      }
    }
    assert.equal(angles.size, 4, "SR lies around every myofibril on all sides");
  }
  const plate = scene.group.getObjectByName("motor-end-plate-on-sarcolemma");
  for (let i = 0; i < plate.geometry.attributes.position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(plate.geometry.attributes.position, i);
    assert.ok(Math.abs(Math.hypot(p.y, p.z) - INTERIOR.radius) < 0.08, "motor end plate follows the external sarcolemma");
  }
  assert.ok(Math.abs(details.nmjPosition[0] - mouth.x) > 10, "NMJ is longitudinally separated from the T/triad site");
  const water = scene.group.getObjectByName("extracellular-water-in-t-lumen");
  assert.ok(water.count >= 20, "extracellular markers continue into the T lumen");
  for (let i = 0; i < water.count; i++) {
    water.getMatrixAt(i, matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    if (i < 4) assert.ok(p.distanceTo(mouth) < 2 && Math.hypot(p.y, p.z) > INTERIOR.radius, "entry water is extracellular");
    else {
      const distance = Math.min(...tube.path.map(({ center }) => p.distanceTo(new THREE.Vector3(...center))));
      assert.ok(distance < tube.lumenRadius - 0.1, "inner water marker centers stay inside the lumen");
    }
  }
}

function inspectBuffers(group) {
  const geometry = new Set(), instances = new Map(), objects = new Set();
  let triangles = 0, meshes = 0;
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    objects.add(object);
    assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${object.name}: finite world transform`);
    if (!object.geometry) return;
    geometry.add(object.geometry);
    const positions = object.geometry.getAttribute("position");
    assert.ok(positions?.count > 0, `${object.name}: nonempty geometry`);
    assert.ok([...positions.array].every(Number.isFinite), `${object.name}: finite vertices`);
    const normals = object.geometry.getAttribute("normal");
    if (normals) assert.ok([...normals.array].every(Number.isFinite), `${object.name}: finite normals`);
    const index = object.geometry.index;
    if (index) assert.ok([...index.array].every(i => i >= 0 && i < positions.count), `${object.name}: valid indices`);
    if (object.isMesh) {
      meshes++;
      triangles += (index?.count || positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    }
    if (object.isInstancedMesh) {
      instances.set(object, object.instanceMatrix);
      assert.ok(object.count > 0 && object.count <= object.instanceMatrix.count, `${object.name}: instance capacity`);
      const transform = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, transform);
        assert.ok(transform.elements.every(Number.isFinite), `${object.name}[${i}]: finite matrix`);
        assert.ok(transform.determinant() > 0, `${object.name}[${i}]: nondegenerate positive-scale instance`);
      }
    }
  });
  assert.ok(instances.size >= 4, "repeated structures must use multiple instance batches");
  assert.ok(meshes < 80, `avoid hundreds of individual meshes: ${meshes}`);
  return { geometry, instances, objects, triangles, meshes };
}

let desktopTriangles = Infinity;
for (const compact of [false, true]) {
  const start = performance.now();
  const scene = createCellInterior({ compact });
  assert.ok(scene.group.isGroup);
  const initial = inspectBuffers(scene.group);
  inspectTopology(scene);
  for (const aspect of [1.8, 1, 0.65]) {
    for (const frame of [scene.home(aspect), scene.patchFrame(aspect), ...modes.slice(3).map(mode => scene.focus(mode, aspect))]) {
      assert.ok(Number.isFinite(frame.radius) && frame.radius > 0, "finite positive camera distance");
      assert.ok(Number.isFinite(frame.theta) && Number.isFinite(frame.phi), "finite camera angles");
      assert.ok(vectorFinite(frame.target), "finite camera target");
    }
  }
  for (let repeat = 0; repeat < 2; repeat++) for (const mode of modes) {
    scene.setMode(mode);
    for (let frame = 0; frame < 12; frame++) scene.update(1 / 30);
    scene.update(10); // Excitation must end, including the reduced-motion one-step path.
    if (mode === "excitation") {
      assert.equal(scene.getStats().excitationComplete, true);
      const progress = scene.getStats().excitationProgress;
      scene.update(10);
      assert.equal(scene.getStats().excitationProgress, progress, "excitation does not loop");
    }
    const current = inspectBuffers(scene.group);
    assert.deepEqual(current.geometry, initial.geometry, `${mode}: geometry objects reused`);
    assert.deepEqual(current.objects, initial.objects, `${mode}: no accumulating scene objects`);
    assert.equal(current.instances.size, initial.instances.size);
    for (const [mesh, buffer] of initial.instances) assert.equal(mesh.instanceMatrix, buffer, `${mode}: instance buffers reused`);
  }
  if (compact) assert.ok(initial.triangles <= desktopTriangles, "compact scene does not increase polygon count");
  else desktopTriangles = initial.triangles;
  console.log(`${compact ? "Compact" : "Desktop"}: ${initial.meshes} meshes, ${initial.instances.size} instance batches, ` +
    `${Math.round(initial.triangles)} triangles; welded open mouth, separate triad gap, SR wrapping, NMJ placement, lumen markers, finite geometry/cameras, finite excitation and buffer reuse passed (${Math.round(performance.now() - start)} ms).`);
}
