/* Skeletal-muscle teaching segment. Lengths are deliberately exaggerated.
 * The sarcolemma and invaginated T membrane share welded boundary vertices.
 * SR is an entirely separate, instanced network; no SR edge enters the T wall.
 */
import { THREE, mat } from "./viewer.js";
import { COLOR, rng } from "./lipids.js";

export const INTERIOR = Object.freeze({
  length: 34, radius: 7, membraneThickness: 0.22,
  cutStart: 1.78, cutEnd: Math.PI * 2 - 0.35,
  tubuleX: 4.4, mouthAngle: Math.PI * 2 - 0.68,
  lumenRadius: 0.34, tubuleRadius: 0.56,
  cisternaRadius: 0.44, cisternaOffset: 1.34,
  junctionalGap: 0.34, nmjX: -10.1, nmjAngle: Math.PI * 2 - 0.65,
  synapticGap: 0.32, excitationDuration: 6, seed: 20261003,
  colors: Object.freeze({ membrane: COLOR.PC, sr: COLOR.PI, myofibril: 0xbfc7cd,
    water: 0x75b3d4, cytosol: 0xaebfc6, neuron: COLOR.SM }),
});

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const radial = (a) => V(0, Math.sin(a), Math.cos(a));
const shellPoint = (x, a, r = INTERIOR.radius) => radial(a).multiplyScalar(r).setX(x);
const fit = (radius, aspect) => radius * Math.max(1, 1.28 / Math.max(0.55, aspect || 1.6));

/** Small indexed builder: welding here makes the aperture and invagination one mesh. */
function surfaceBuilder() {
  const positions = [], indices = [], vertices = new Map(), groups = [];
  const vertex = (p) => {
    const key = p.toArray().map((n) => n.toFixed(7)).join(",");
    if (!vertices.has(key)) { vertices.set(key, positions.length / 3); positions.push(p.x, p.y, p.z); }
    return vertices.get(key);
  };
  const tri = (a, b, c) => indices.push(a, b, c);
  const quad = (a, b, c, d, reverse = false) => reverse
    ? (tri(a, c, b), tri(a, d, c)) : (tri(a, b, c), tri(a, c, d));
  const begin = (material) => groups.push({ start: indices.length, count: 0, materialIndex: material });
  const end = () => { const g = groups[groups.length - 1]; g.count = indices.length - g.start; };
  return { positions, indices, vertex, tri, quad, begin, end, geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
  } };
}

function samples(from, to, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => from + (to - from) * i / steps);
}

function makeMembrane(compact, path) {
  const b = surfaceBuilder();
  const C = INTERIOR, half = C.length / 2, box = 1.25;
  const x0 = C.tubuleX - box, x1 = C.tubuleX + box;
  const a0 = C.mouthAngle - box / C.radius, a1 = C.mouthAngle + box / C.radius;
  const n = compact ? 8 : 12;
  const xs = [...samples(-half, x0, compact ? 30 : 44).slice(0, -1),
    ...samples(x0, x1, n).slice(0, -1), ...samples(x1, half, compact ? 15 : 22)];
  const angles = [...samples(C.cutStart, a0, compact ? 32 : 48).slice(0, -1),
    ...samples(a0, a1, n).slice(0, -1), ...samples(a1, C.cutEnd, 4)];
  // Exact outer square points lie on the grid boundary. A circular aperture is
  // joined to this square by a curved annulus, avoiding a cap over the opening.
  const square = [
    ...samples(-box, box, n).slice(0, -1).map((u) => [u, -box]),
    ...samples(-box, box, n).slice(0, -1).map((v) => [box, v]),
    ...samples(box, -box, n).slice(0, -1).map((u) => [u, box]),
    ...samples(box, -box, n).slice(0, -1).map((v) => [-box, v]),
  ];
  const phis = square.map(([u, v]) => Math.atan2(v, u));
  const seam = [];
  for (let side = 0; side < 2; side++) {
    const radius = C.radius - side * C.membraneThickness;
    const holeRadius = side ? 0.98 : 0.77;
    b.begin(side);
    const ids = xs.map((x) => angles.map((a) => b.vertex(shellPoint(x, a, radius))));
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < angles.length - 1; j++) {
      const mx = (xs[i] + xs[i + 1]) / 2, ma = (angles[j] + angles[j + 1]) / 2;
      if (mx > x0 && mx < x1 && ma > a0 && ma < a1) continue;
      b.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1], side === 1);
    }
    const edge = [], hole = [];
    square.forEach(([u, v], i) => {
      edge.push(b.vertex(shellPoint(C.tubuleX + u, C.mouthAngle + v / C.radius, radius)));
      hole.push(b.vertex(shellPoint(C.tubuleX + holeRadius * Math.cos(phis[i]),
        C.mouthAngle + holeRadius * Math.sin(phis[i]) / C.radius, radius)));
    });
    for (let i = 0; i < square.length; i++) {
      const j = (i + 1) % square.length;
      b.quad(edge[i], edge[j], hole[j], hole[i], side === 1);
    }
    seam.push(hole); b.end();
  }
  // Visible thickness at the physical longitudinal cut and both segment ends.
  b.begin(2);
  for (const a of [C.cutStart, C.cutEnd]) for (let i = 0; i < xs.length - 1; i++) {
    b.quad(b.vertex(shellPoint(xs[i], a)), b.vertex(shellPoint(xs[i + 1], a)),
      b.vertex(shellPoint(xs[i + 1], a, C.radius - C.membraneThickness)),
      b.vertex(shellPoint(xs[i], a, C.radius - C.membraneThickness)));
  }
  for (const x of [-half, half]) for (let j = 0; j < angles.length - 1; j++) {
    b.quad(b.vertex(shellPoint(x, angles[j])), b.vertex(shellPoint(x, angles[j + 1])),
      b.vertex(shellPoint(x, angles[j + 1], C.radius - C.membraneThickness)),
      b.vertex(shellPoint(x, angles[j], C.radius - C.membraneThickness)));
  }
  b.end();

  const ringCount = compact ? 54 : 84, rings = [[], []], frameSamples = [];
  // The exoplasmic surface turns into the lumen; the cytoplasmic surface turns
  // into the outside of the tube. The first ring reuses shell vertex indices.
  for (let wall = 0; wall < 2; wall++) {
    rings[wall].push(seam[wall === 0 ? 1 : 0]);
    for (let k = 1; k <= ringCount; k++) {
      const t = k / ringCount, center = path.getPointAt(t), tangent = path.getTangentAt(t);
      const binormal = new THREE.Vector3().crossVectors(tangent, X).normalize();
      const radius = wall === 0 ? C.tubuleRadius : C.lumenRadius;
      const flare = Math.max(0, 1 - t / 0.13);
      const r = radius + flare * (wall === 0 ? 0.36 : 0.30);
      rings[wall].push(phis.map((phi) => b.vertex(center.clone()
        .addScaledVector(X, Math.cos(phi) * r).addScaledVector(binormal, -Math.sin(phi) * r))));
      if (wall === 0) frameSamples.push({ t, center: center.toArray(), tangent: tangent.toArray(), radius: r });
    }
  }
  // A small window on the camera-facing wall exposes the lumen after the first
  // complete invagination. Its cut edges are real wall-thickness faces.
  const windowStart = Math.ceil(ringCount * 0.23);
  const windowIndices = new Set();
  for (let j = 0; j < phis.length; j++) {
    const next = (j + 1) % phis.length;
    const u = Math.cos(phis[j]) + Math.cos(phis[next]);
    const v = Math.sin(phis[j]) + Math.sin(phis[next]);
    if (v > 0 && Math.abs(u) < v * 1.2) windowIndices.add(j);
  }
  for (let wall = 0; wall < 2; wall++) {
    b.begin(wall === 0 ? 3 : 4);
    for (let k = 0; k < ringCount; k++) for (let j = 0; j < phis.length; j++) {
      if (k >= windowStart && windowIndices.has(j)) continue;
      const next = (j + 1) % phis.length;
      b.quad(rings[wall][k][j], rings[wall][k + 1][j], rings[wall][k + 1][next], rings[wall][k][next], wall === 1);
    }
    b.end();
  }
  b.begin(2);
  for (let j = 0; j < phis.length; j++) {
    const next = (j + 1) % phis.length, previous = (j - 1 + phis.length) % phis.length;
    if (windowIndices.has(j)) b.quad(rings[0][windowStart][j], rings[0][windowStart][next],
      rings[1][windowStart][next], rings[1][windowStart][j]);
    if (windowIndices.has(j) !== windowIndices.has(previous)) for (let k = windowStart; k < ringCount; k++) {
      b.quad(rings[0][k][j], rings[1][k][j], rings[1][k + 1][j], rings[0][k + 1][j]);
    }
    if (!windowIndices.has(j)) b.quad(rings[0][ringCount][j], rings[1][ringCount][j],
      rings[1][ringCount][next], rings[0][ringCount][next]);
  }
  b.end();
  const geometry = b.geometry();
  geometry.userData.surfaceHole = { outerIndices: seam[0], innerIndices: seam[1],
    center: shellPoint(C.tubuleX, C.mouthAngle).toArray(), radius: 0.77,
    shellApertureIsOpen: true, sharedWithTubule: true };
  geometry.userData.hollowTube = { outerRings: rings[0], lumenRings: rings[1],
    path: frameSamples, lumenRadius: C.lumenRadius, membraneRadius: C.tubuleRadius,
    windowStartRing: windowStart, windowSegments: [...windowIndices], openDistalSection: true };
  return geometry;
}

function instancedSegments(segments, material, geometry) {
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
  const dummy = new THREE.Object3D();
  segments.forEach(({ a, b, radius }, i) => {
    const d = new THREE.Vector3().subVectors(b, a);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(Y, d.clone().normalize());
    dummy.scale.set(radius, d.length(), radius); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  return mesh;
}

function instancedDots(points, material, geometry, radius) {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const dummy = new THREE.Object3D();
  points.forEach((p, i) => { dummy.position.copy(p); dummy.scale.setScalar(radius); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  return mesh;
}

export function createCellInterior({ compact = false } = {}) {
  const C = INTERIOR, random = rng(C.seed);
  const group = new THREE.Group(); group.name = "skeletal-muscle-cell-interior";
  const ownedGeometry = new Set(), ownedMaterials = new Set();
  const ownGeo = (g) => (ownedGeometry.add(g), g);
  const material = (color, opts = {}) => {
    const m = mat(color, opts).clone(); m.side = THREE.DoubleSide; ownedMaterials.add(m); return m;
  };
  const sphere = ownGeo(new THREE.SphereGeometry(1, compact ? 8 : 12, compact ? 6 : 8));
  const cylinder = ownGeo(new THREE.CylinderGeometry(1, 1, 1, compact ? 7 : 10, 1));
  const shellMaterials = [material(C.colors.membrane, { rough: 0.52 }), material(0x769abe, { rough: 0.6 }),
    material(0xb7d0e4, { rough: 0.62 }), material(C.colors.membrane, { rough: 0.4 }), material(0xa3cce3, { rough: 0.5 })];
  const srMaterial = material(C.colors.sr, { rough: 0.5 });
  const cisternaMaterial = material(C.colors.sr, { rough: 0.42 });
  const fibrilMaterial = material(C.colors.myofibril, { rough: 0.78 });
  const bandMaterial = material(0xaeb9c0, { rough: 0.8 });
  const waterMaterial = material(C.colors.water, { rough: 0.4, opacity: 0.65 });
  const cytosolMaterial = material(C.colors.cytosol, { opacity: 0.35 });
  const neuronMaterial = material(C.colors.neuron, { rough: 0.6 });
  const plateMaterial = material(0xdac080, { rough: 0.72 });

  const entrance = shellPoint(C.tubuleX, C.mouthAngle);
  const path = new THREE.CatmullRomCurve3([
    entrance, shellPoint(C.tubuleX, C.mouthAngle, 6.5),
    V(C.tubuleX, -3.05, 4.35), V(C.tubuleX, -1.05, 3.45),
    V(C.tubuleX, 1.15, 2.45), V(C.tubuleX, 2.95, 0.65), V(C.tubuleX, 3.55, -1.6),
  ], false, "centripetal");
  const membraneGeometry = ownGeo(makeMembrane(compact, path));
  const membrane = new THREE.Mesh(membraneGeometry, shellMaterials);
  membrane.name = "continuous-sarcolemma-and-t-tubule"; group.add(membrane);

  // Sparse, parallel context structures. No contractile protein detail is implied.
  const fibrilCenters = [[-3.55, -2.0], [-2.05, 0.95], [-0.35, -3.65], [-0.15, -0.8], [1.75, -2.3], [1.55, 0.15]];
  const fibrilRadius = 0.72;
  const fibrils = instancedSegments(fibrilCenters.map(([y, z]) => ({ a: V(-15.8, y, z), b: V(15.8, y, z), radius: fibrilRadius })), fibrilMaterial, cylinder);
  fibrils.name = "parallel-myofibrils"; group.add(fibrils);
  const bandGeo = ownGeo(new THREE.TorusGeometry(fibrilRadius + 0.008, 0.013, 4, compact ? 16 : 24));
  const bands = new THREE.InstancedMesh(bandGeo, bandMaterial, fibrilCenters.length * 16);
  const dummy = new THREE.Object3D(); let bi = 0;
  for (const [y, z] of fibrilCenters) for (let i = 0; i < 16; i++) {
    dummy.position.set(-14.4 + i * 1.92, y, z); dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); bands.setMatrixAt(bi++, dummy.matrix);
  }
  bands.name = "subtle-myofibril-bands"; group.add(bands);

  // Two terminal cisternae run beside the inner T segment. Their offset is along
  // the long axis of the fiber, leaving an exaggerated but real junctional gap.
  const cisternaPaths = [-1, 1].map((side) => new THREE.CatmullRomCurve3(
    samples(0.27, 0.97, compact ? 18 : 28).map((t) => path.getPointAt(t).addScaledVector(X, side * C.cisternaOffset)), false, "centripetal"));
  const cisternae = new THREE.Group(); cisternae.name = "separate-sr-terminal-cisternae";
  for (const p of cisternaPaths) {
    const mesh = new THREE.Mesh(ownGeo(new THREE.TubeGeometry(p, compact ? 34 : 50, C.cisternaRadius, compact ? 9 : 14, false)), cisternaMaterial);
    mesh.name = "terminal-cisterna"; cisternae.add(mesh);
    const caps = instancedDots([p.getPointAt(0), p.getPointAt(1)], cisternaMaterial, sphere, C.cisternaRadius);
    caps.name = "closed-cisterna-ends"; cisternae.add(caps);
  }
  group.add(cisternae);

  const srSegments = [], srNodes = [];
  const addSR = (a, b, radius = 0.075) => srSegments.push({ a, b, radius });
  // A wrap lies outside each myofibril. The two sides terminate at their own
  // cisterna plane, and never cross the space occupied by the T-tubule.
  const ringRadius = 1.04, ringResolution = compact ? 10 : 14;
  for (const [cy, cz] of fibrilCenters) for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex ? 1 : -1, cx = C.tubuleX + side * C.cisternaOffset;
    const axial = side < 0 ? [-14.7, -10.5, -6.3, -2.1, cx] : [cx, 9.5, 14.7];
    const onRing = (x, a) => V(x, cy + ringRadius * Math.sin(a), cz + ringRadius * Math.cos(a));
    for (const x of axial) for (let j = 0; j < ringResolution; j++) addSR(onRing(x, TAU * j / ringResolution), onRing(x, TAU * (j + 1) / ringResolution));
    for (const a of [0.2, 1.8, 3.4, 5.0]) for (let j = 0; j < axial.length - 1; j++) {
      const a0 = onRing(axial[j], a), b0 = onRing(axial[j + 1], a + 0.3);
      const middle = a0.clone().lerp(b0, 0.5); middle.y += 0.09;
      addSR(a0, middle, 0.085); addSR(middle, b0, 0.085);
    }
    const cp = cisternaPaths[sideIndex];
    let nearestT = 0, nearestDist = Infinity;
    for (let j = 0; j <= 50; j++) {
      const q = cp.getPointAt(j / 50), d = (q.y - cy) ** 2 + (q.z - cz) ** 2;
      if (d < nearestDist) { nearestDist = d; nearestT = j / 50; }
    }
    const q = cp.getPointAt(nearestT), a = Math.atan2(q.y - cy, q.z - cz), r = onRing(cx, a);
    addSR(r, q, 0.11); srNodes.push(r);
  }
  const sr = instancedSegments(srSegments, srMaterial, cylinder); sr.name = "sr-wrapping-network"; group.add(sr);
  const srJunctions = instancedDots(srNodes, srMaterial, sphere, 0.11); srJunctions.name = "sr-network-junctions"; group.add(srJunctions);

  const nmjNormal = radial(C.nmjAngle), plateCenter = shellPoint(C.nmjX, C.nmjAngle, C.radius + 0.04);
  const plateBuilder = surfaceBuilder(); plateBuilder.begin(0);
  const rows = 12, cols = 18;
  const plateIds = samples(-1, 1, cols).map((u) => samples(-1, 1, rows).map((v) =>
    plateBuilder.vertex(shellPoint(C.nmjX + 2.9 * u, C.nmjAngle + 0.135 * v * Math.sqrt(Math.max(0.06, 1 - u * u)), C.radius + 0.035))));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) plateBuilder.quad(plateIds[i][j], plateIds[i + 1][j], plateIds[i + 1][j + 1], plateIds[i][j + 1]);
  plateBuilder.end();
  const plate = new THREE.Mesh(ownGeo(plateBuilder.geometry()), plateMaterial); plate.name = "motor-end-plate-on-sarcolemma"; group.add(plate);
  const terminal = new THREE.Mesh(sphere, neuronMaterial);
  terminal.position.copy(shellPoint(C.nmjX, C.nmjAngle, C.radius + 1.075));
  terminal.quaternion.setFromUnitVectors(Y, nmjNormal); terminal.scale.set(2.45, 0.64, 0.73);
  terminal.name = "motor-neuron-terminal-outside-cell"; group.add(terminal);
  const axonPath = new THREE.CatmullRomCurve3([
    shellPoint(-17, C.nmjAngle + 0.21, 11.5), shellPoint(-14.8, C.nmjAngle + 0.14, 10.3),
    shellPoint(-12.7, C.nmjAngle + 0.08, 8.9), terminal.position.clone(),
  ]);
  const axon = new THREE.Mesh(ownGeo(new THREE.TubeGeometry(axonPath, 24, 0.28, 10, false)), neuronMaterial);
  axon.name = "motor-axon"; group.add(axon);
  // Low relief end-plate folds are separate from the T-tubule system.
  const folds = [];
  for (let i = 0; i < 9; i++) {
    const x = C.nmjX - 2.1 + i * 0.52;
    folds.push({ a: shellPoint(x, C.nmjAngle - 0.09, 7.08), b: shellPoint(x, C.nmjAngle + 0.09, 7.08), radius: 0.035 });
  }
  const foldMesh = instancedSegments(folds, neuronMaterial, cylinder); foldMesh.name = "motor-end-plate-fold-hints"; group.add(foldMesh);

  const outsideWater = [], lumenWater = [], cytosolPoints = [];
  for (let i = 0; i < (compact ? 40 : 72); i++) {
    const a = -0.9 + random() * 2.9, r = C.radius + 1.2 + random() * 2.3;
    outsideWater.push(shellPoint(-15 + random() * 30, a, r));
  }
  // A visible chain of the SAME water markers spans outside → mouth → lumen.
  for (let i = 0; i < 4; i++) lumenWater.push(entrance.clone().addScaledVector(radial(C.mouthAngle), 0.35 + i * 0.43));
  for (let i = 0; i < 26; i++) lumenWater.push(path.getPointAt(0.014 + i / 26 * 0.96));
  for (let i = 0; i < (compact ? 30 : 54); i++) {
    const a = random() * TAU, r = 1.3 + random() * 4.5;
    cytosolPoints.push(shellPoint(-15.4 + random() * 30.8, a, r));
  }
  const extracellular = instancedDots(outsideWater, waterMaterial, sphere, 0.07); extracellular.name = "extracellular-water"; group.add(extracellular);
  const lumen = instancedDots(lumenWater, waterMaterial, sphere, 0.105); lumen.name = "extracellular-water-in-t-lumen"; group.add(lumen);
  const cytosol = instancedDots(cytosolPoints, cytosolMaterial, sphere, 0.055); cytosol.name = "cytosol-water-hints"; group.add(cytosol);

  const patchCenter = shellPoint(-2.6, C.mouthAngle + 0.04, C.radius + 0.025);
  const patchPoints = samples(0, TAU, 56).map((a) => shellPoint(patchCenter.x + 1.0 * Math.cos(a),
    C.mouthAngle + 0.04 + 0.62 * Math.sin(a) / C.radius, C.radius + 0.045));
  const patchMaterial = new THREE.LineBasicMaterial({ color: 0xc8e9fc, transparent: true, opacity: 0.9 }); ownedMaterials.add(patchMaterial);
  const patch = new THREE.Line(ownGeo(new THREE.BufferGeometry().setFromPoints(patchPoints)), patchMaterial);
  patch.name = "sarcolemma-patch-portal"; group.add(patch);

  const focusPoint = path.getPointAt(0.68);
  const anchors = {
    sarcolemma: patchCenter, nmj: plateCenter.clone().addScaledVector(nmjNormal, 0.8),
    tubule: path.getPointAt(0.22), lumen: path.getPointAt(0.62),
    sr: V(-4.2, 2.52, 0.15), triad: focusPoint,
    cisternae: focusPoint.clone().addScaledVector(X, C.cisternaOffset),
    cisternaLeft: focusPoint.clone().addScaledVector(X, -C.cisternaOffset),
    cisternaRight: focusPoint.clone().addScaledVector(X, C.cisternaOffset),
    myofibril: V(-11.7, 1.55, 0.15), cytosol: V(-1, 3.6, 2.0),
    extracellular: V(-4.0, 6.0, 8.1),
  };

  // A membrane-bound band, not a travelling particle, marks the surface phase.
  const sweepBuilder = surfaceBuilder(); sweepBuilder.begin(0);
  const sweepRows = samples(C.mouthAngle - 0.18, C.mouthAngle + 0.18, 10);
  for (let i = 0; i < sweepRows.length - 1; i++) sweepBuilder.quad(
    sweepBuilder.vertex(shellPoint(-0.26, sweepRows[i], 7.06)),
    sweepBuilder.vertex(shellPoint(0.26, sweepRows[i], 7.06)),
    sweepBuilder.vertex(shellPoint(0.26, sweepRows[i + 1], 7.06)),
    sweepBuilder.vertex(shellPoint(-0.26, sweepRows[i + 1], 7.06)));
  sweepBuilder.end();
  const sweepMaterial = material(0xf0cf80, { rough: 0.35, emissive: 0xb07524, emissiveIntensity: 0.3 });
  const surfaceSweep = new THREE.Mesh(ownGeo(sweepBuilder.geometry()), sweepMaterial);
  surfaceSweep.name = "membrane-depolarization-highlight"; surfaceSweep.visible = false; group.add(surfaceSweep);
  const tubeSweep = new THREE.Mesh(ownGeo(new THREE.TorusGeometry(C.tubuleRadius + 0.025, 0.035, 5, 28)), sweepMaterial);
  tubeSweep.name = "t-membrane-depolarization-highlight"; tubeSweep.visible = false; group.add(tubeSweep);

  // Diagnostics are immutable construction records; frame-by-frame progress
  // reads must not resample curves or allocate hundreds of segment arrays.
  let meshes = 0, batches = 0, instances = 0;
  group.traverse((o) => { if (o.isMesh) meshes++; if (o.isInstancedMesh) { batches++; instances += o.count; } });
  const diagnostic = { membrane: membraneGeometry.userData,
    myofibrilCenters: fibrilCenters.map(([y, z]) => [0, y, z]), myofibrilRadius: fibrilRadius,
    srSegments: srSegments.map(({ a, b, radius }) => ({ a: a.toArray(), b: b.toArray(), radius })),
    cisternaPaths: cisternaPaths.map((p) => p.getSpacedPoints(64).map((v) => v.toArray())),
    lumenWater: lumenWater.map((v) => v.toArray()), nmjPosition: plateCenter.toArray() };

  let mode = "overview", elapsed = 0, excitationStep = -1;
  const excitationMaterials = [neuronMaterial, plateMaterial, shellMaterials[0], shellMaterials[3], cisternaMaterial, srMaterial];
  function setMode(next = "overview") {
    mode = ["overview", "continuity", "excitation", "triad", "nmj", "tubule", "sr"].includes(next) ? next : "overview";
    elapsed = 0; excitationStep = mode === "excitation" ? 0 : -1;
    surfaceSweep.visible = false; tubeSweep.visible = false;
    for (const m of excitationMaterials) { m.emissive.setHex(0); m.emissiveIntensity = 0; }
    const continuity = mode === "continuity";
    waterMaterial.opacity = continuity ? 1 : 0.65;
    waterMaterial.emissive.setHex(continuity ? 0x16394a : 0); waterMaterial.emissiveIntensity = 0.35;
    srMaterial.color.setHex(continuity ? 0x9273bb : C.colors.sr);
    cisternaMaterial.color.copy(srMaterial.color);
    fibrilMaterial.color.setHex(continuity ? 0xd5dce0 : C.colors.myofibril);
    cytosolMaterial.opacity = continuity ? 0.72 : 0.35;
    group.userData.mode = mode;
    if (mode === "excitation") update(0);
  }
  function update(dt = 0) {
    if (mode !== "excitation") return;
    elapsed = Math.min(C.excitationDuration, elapsed + Math.max(0, dt));
    excitationStep = Math.min(5, Math.floor(elapsed));
    surfaceSweep.visible = elapsed >= 2 && elapsed < 3;
    if (surfaceSweep.visible) surfaceSweep.position.x = C.nmjX + (C.tubuleX - C.nmjX) * (elapsed - 2);
    tubeSweep.visible = elapsed >= 3 && elapsed < 4;
    if (tubeSweep.visible) {
      const t = Math.min(0.99, (elapsed - 3) * 0.99);
      tubeSweep.position.copy(path.getPointAt(t));
      tubeSweep.quaternion.setFromUnitVectors(V(0, 0, 1), path.getTangentAt(t));
    }
    for (let i = 0; i < excitationMaterials.length; i++) {
      const m = excitationMaterials[i];
      m.emissive.setHex(i === excitationStep && elapsed < C.excitationDuration ? 0xd8952f : 0);
      m.emissiveIntensity = i === excitationStep && elapsed < C.excitationDuration ? 0.32 * Math.sin((elapsed % 1) * Math.PI) : 0;
    }
  }
  const home = (aspect) => ({ radius: fit(47, aspect), theta: 0.34, phi: 1.08, target: V(-0.6, 0.2, 0) });
  function focus(key, aspect) {
    const target = anchors[key] || anchors.triad;
    if (key === "nmj") return { radius: fit(17, aspect), theta: -0.24, phi: 1.65, target: target.clone() };
    if (["tubule", "lumen"].includes(key)) return { radius: fit(20, aspect), theta: 0.20, phi: 1.3, target: path.getPointAt(0.36) };
    if (key === "sarcolemma") return { radius: fit(16, aspect), theta: 0.15, phi: 1.65, target: target.clone() };
    if (key === "sr") return { radius: fit(20, aspect), theta: 0.48, phi: 0.95, target: V(-4.0, 0.8, -0.6) };
    return { radius: fit(17.5, aspect), theta: 0.30, phi: 1.15, target: focusPoint.clone().add(V(0, -0.4, 0.1)) };
  }
  function getStats() {
    return { mode, compact, myofibrils: fibrilCenters.length, srSegments: srSegments.length,
      meshes, batches, instances, geometryCount: ownedGeometry.size,
      cutawayFraction: 1 - (C.cutEnd - C.cutStart) / TAU,
      topology: { continuousSarcolemmaTubule: true, sharedSeamVertices: membraneGeometry.userData.surfaceHole.outerIndices.length * 2,
        shellApertureOpen: true, lumenOpenToExtracellular: true, srSeparate: true,
        teachingLumenWindow: true, distalSectionOpen: true, junctionalGap: C.junctionalGap,
        nmjTriadSeparation: Math.abs(C.nmjX - C.tubuleX), synapticGap: C.synapticGap },
      excitationElapsed: elapsed, excitationProgress: elapsed / C.excitationDuration,
      excitationStep, excitationComplete: mode === "excitation" && elapsed >= C.excitationDuration,
      excitationDone: mode === "excitation" && elapsed >= C.excitationDuration, diagnostic,
    };
  }
  setMode("overview");
  return { group, anchors, compact, home, focus, setMode, update, getStats, pickables: [],
    patchFrame: (aspect) => ({ radius: fit(8.5, aspect), theta: 0.08, phi: 1.75, target: patchCenter.clone() }),
    dispose() { ownedGeometry.forEach((g) => g.dispose()); ownedMaterials.forEach((m) => m.dispose()); },
  };
}
