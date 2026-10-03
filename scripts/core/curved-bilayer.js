/* Render the patch's actual lipid templates on arbitrary curved mid-surfaces.
 * +Y in buildLipid points to water; -Y (both tails) points into the bilayer.
 * No visible support surface. Two systems × four geometry batches, not Mesh/lipid.
 */
import { THREE, mat } from "./viewer.js";
import { buildLipid, GEO, LIPIDS, rng } from "./lipids.js";
import { expandMix, INTERIOR_COMPOSITION } from "./membrane-composition.js";

const UP = new THREE.Vector3(0, 1, 0);
export const BILAYER = Object.freeze({ halfThickness: 0.34, tailScale: 0.129, pitch: 0.32,
  widths: [0.76, 0.58, 0.43], names: ["far", "medium", "near"] });

/** Central differences also include tube bending, funnel flare and SR swelling. */
export function surfaceNormal(point, u, v, towardWater) {
  const e = 0.00005;
  const du = point(Math.min(1, u + e), v).sub(point(Math.max(0, u - e), v));
  const dv = point(u, v + e).sub(point(u, v - e));
  const n = du.cross(dv).normalize();
  if (n.dot(towardWater) < 0) n.negate();
  return n;
}

export function createCurvedBilayers(sites, { compact = false } = {}) {
  const group = new THREE.Group(); group.name = "phospholipid-membrane-systems";
  const templates = new Map(), batches = new Map(), records = [];
  const random = rng(20261003), dummy = new THREE.Object3D(), transform = new THREE.Matrix4();
  const rotation = new THREE.Quaternion(), twist = new THREE.Quaternion();
  for (const { id } of LIPIDS) {
    const lipid = buildLipid(id); lipid.updateMatrixWorld(true);
    const parts = [];
    lipid.traverse(p => {
      if (!p.isMesh) return;
      const kind = Object.keys(GEO).find(k => GEO[k] === p.geometry);
      parts.push({ kind, matrix: p.matrixWorld.clone(), color: p.material.color.clone(),
        head: lipid.userData.parts.heads.includes(p), tail: lipid.userData.parts.tails.includes(p) });
    });
    templates.set(id, parts);
  }
  for (const system of ["plasma", "sr"]) for (const side of [1, -1]) {
    const surfaceSites = sites.filter(s => s.system === system);
    const composition = INTERIOR_COMPOSITION[system];
    const ids = expandMix(side === 1 ? composition.positive : composition.negative, surfaceSites.length, random);
    surfaceSites.forEach((s, i) => {
      const water = s.normal.clone().multiplyScalar(side);
      const position = s.point.clone().addScaledVector(water, BILAYER.halfThickness);
      const leaflet = system === "plasma" ? (side === 1 ? "exoplasmic" : "cytosolic")
        : (side === 1 ? "cytosolic" : "luminal");
      records.push({ ...s, id: ids[i], side, leaflet, water, position, twist: random() * Math.PI * 2 });
      // Same OH/ring/tail template, with the OH below the head plane.
      if (random() < composition.cholesterol) {
        const tangent = new THREE.Vector3().crossVectors(water, Math.abs(water.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
        records.push({ ...s, id: "CHOL", side, leaflet, water, twist: random() * Math.PI * 2,
          position: position.clone().addScaledVector(water, -0.045).addScaledVector(tangent, 0.15) });
      }
    });
  }
  for (const r of records) for (const p of templates.get(r.id)) {
    const key = `${r.system}/${p.kind}`;
    if (!batches.has(key)) batches.set(key, { system: r.system, kind: p.kind, capacity: 0 });
    batches.get(key).capacity++;
  }
  const geometries = {
    head: new THREE.SphereGeometry(1, compact ? 8 : 10, compact ? 6 : 7),
    bead: new THREE.SphereGeometry(1, 6, 5), tail: GEO.tail, plate: GEO.plate,
  };
  // Camera-space depth cue only for these eight batches. Rotation needs no
  // buffer rebuild; other scenes and their materials remain unaffected.
  const depthCue = { interiorFadeNear: { value: 28 }, interiorFadeFar: { value: 42 },
    interiorFadeStrength: { value: 0 }, interiorBackground: { value: new THREE.Color(0xf3f7f9) } };
  for (const [key, b] of batches) {
    const material = mat(0xffffff, { rough: b.kind === "head" ? 0.4 : 0.6 }).clone();
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, depthCue);
      shader.fragmentShader = `uniform float interiorFadeNear, interiorFadeFar, interiorFadeStrength;
        uniform vec3 interiorBackground;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        float interiorDepth = smoothstep(interiorFadeNear, interiorFadeFar, vViewPosition.z);
        outgoingLight = mix(outgoingLight, interiorBackground, interiorDepth * interiorFadeStrength);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => "interior-depth-cue-v1";
    b.mesh = new THREE.InstancedMesh(geometries[b.kind], material, b.capacity);
    b.mesh.name = `interior-${key}`; b.mesh.userData.partKind = b.kind;
    b.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    b.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 28);
    b.mesh.frustumCulled = true; b.mesh.userData.recordIndices = [];
    group.add(b.mesh);
  }
  let lastTarget = new THREE.Vector3(999, 999, 999), lastDistance = -1, lastMode = "", clock = 1;
  let stats = {}, visibleRecords = [];
  const headScale = new THREE.Vector3(), faded = new THREE.Color(), background = new THREE.Color(0xe5ecef);
  function rebuild(distance = 40, target = new THREE.Vector3(), mode = "overview") {
    const counts = [0, 0, 0], systems = { plasma: 0, sr: 0 };
    const overview = ["overview", "continuity", "excitation"].includes(mode);
    depthCue.interiorFadeNear.value = Math.max(1, distance - 6);
    depthCue.interiorFadeFar.value = distance + 8;
    depthCue.interiorFadeStrength.value = overview ? 0.48 : 0;
    for (const b of batches.values()) { b.count = 0; b.mesh.userData.recordIndices.length = 0; }
    visibleRecords = [];
    records.forEach((r, index) => {
      const localDistance = r.point.distanceTo(target);
      const shellOnly = ["sarcolemma", "cross-section"].includes(mode);
      const tOnly = ["tubule", "lumen", "membrane-zoom"].includes(mode);
      const srOnly = ["sr", "sr-lumen", "cisterna"].includes(mode);
      const junction = ["triad", "triad-detail", "compare"].includes(mode);
      const outsideFocus = (shellOnly && (r.region !== "sarcolemma" || localDistance > 5.5))
        || (tOnly && (r.system !== "plasma" || (mode !== "tubule" && r.region !== "tubule") || localDistance > 7.5))
        || (srOnly && (r.system !== "sr" || r.position.x > 0 || localDistance > (mode === "cisterna" ? 10 : 7)))
        || (junction && ["sarcolemma", "invagination"].includes(r.region))
        || (mode === "triad-detail" && r.system === "sr" && r.point.x < 0);
      if (outsideFocus) { r.visible = false; return; }
      // Local detail rises with zoom; remote membranes keep sparse lipid symbols.
      const lod = distance < 17 && localDistance < Math.max(4.5, distance * 0.62) ? 2
        : distance < 33 && localDistance < Math.max(9, distance * 0.72) ? 1 : 0;
      if (r.level > lod) { r.visible = false; return; }
      r.visible = true; r.lod = lod; counts[lod]++; systems[r.system]++;
      visibleRecords.push(r);
      rotation.setFromUnitVectors(UP, r.water).multiply(twist.setFromAxisAngle(UP, r.twist));
      dummy.position.copy(r.position); dummy.quaternion.copy(rotation);
      const lumenSide = r.system === "plasma" && r.leaflet === "exoplasmic";
      const lumenNarrowing = lumenSide ? (r.region === "tubule" ? 1 : r.region === "invagination" ? r.u : 0) : 0;
      const width = BILAYER.widths[lod] * (1 - 0.16 * lumenNarrowing);
      dummy.scale.set(width, BILAYER.tailScale, width); dummy.updateMatrix();
      r.matrix = r.matrix || new THREE.Matrix4(); r.matrix.copy(dummy.matrix);
      const backOfTube = r.region === "tubule" && Math.sin(r.v) < 0;
      const soften = r.region === "sarcolemma" ? (overview ? 0.64
        : mode === "tubule" ? 0.48 * THREE.MathUtils.smoothstep(localDistance, 2.0, 6.5) : 0)
        : mode === "triad-detail" ? 0.18 * THREE.MathUtils.smoothstep(localDistance, 1.5, 4.5)
        : mode === "triad" && backOfTube ? (lumenSide ? 0.22 : 0.38) : 0;
      // A slight cavity contrast separates the luminal wall from the rim.
      const cavity = ["tubule", "triad"].includes(mode) && r.region === "tubule" && lumenSide ? 0.90 : 1;
      for (const p of templates.get(r.id)) {
        // Far still has a head and BOTH three-segment tails. Chemical beads are
        // added from medium onward. Cholesterol remains a complete symbol.
        if (lod === 0 && !p.head && !p.tail && r.id !== "CHOL") continue;
        const b = batches.get(`${r.system}/${p.kind}`), i = b.count++;
        transform.multiplyMatrices(dummy.matrix, p.matrix);
        // Tail length is compressed to the teaching membrane thickness; heads
        // remain spheres, preserving the patch's visual language at every LOD.
        if (p.head) transform.scale(headScale.set(1, width / BILAYER.tailScale, 1));
        b.mesh.setMatrixAt(i, transform);
        b.mesh.setColorAt(i, faded.copy(p.color).multiplyScalar(cavity).lerp(background, soften));
        b.mesh.userData.recordIndices.push(index);
      }
    });
    for (const b of batches.values()) {
      b.mesh.count = b.count; b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
    stats = { lod: counts.map((n, i) => ({ level: BILAYER.names[i], lipids: n })),
      visibleLipids: counts.reduce((a, b) => a + b, 0), systems, totalSampledLipids: records.length,
      batches: batches.size, partInstances: [...batches.values()].reduce((n, b) => n + b.count, 0) };
    lastTarget.copy(target); lastDistance = distance; lastMode = mode;
  }
  rebuild();
  return { group, records, batches, templates, rebuild,
    update(dt, distance, target, mode) {
      clock += dt;
      if (clock < 0.22) return;
      if (mode !== lastMode || Math.abs(distance - lastDistance) > 1.3 || target.distanceTo(lastTarget) > 0.9) {
        rebuild(distance, target, mode); clock = 0;
      }
    },
    getStats: () => stats,
    getVisibleRecords: () => visibleRecords,
    dispose() {
      geometries.head.dispose(); geometries.bead.dispose();
      for (const b of batches.values()) { b.mesh.dispose(); b.mesh.material.dispose(); }
    },
  };
}
