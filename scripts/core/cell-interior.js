/* A magnified lipid-bilayer scene, not an anatomical reconstruction.
 * Cylinder, funnel and tube are continuous sampling charts. Only lipids render.
 */
import { THREE, mat } from "./viewer.js";
import { COLOR } from "./lipids.js";
import { BILAYER, createCurvedBilayers, surfaceNormal } from "./curved-bilayer.js";
const TAU = Math.PI * 2, X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const radial = a => V(0, Math.sin(a), Math.cos(a));
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
export const INTERIOR = Object.freeze({ length: 26, radius: 7, membraneThickness: BILAYER.halfThickness * 2,
  cutStart: 1.78, cutEnd: 6.08, mouthAngle: 5.55, tubuleX: 0,
  tubuleRadius: 0.92, mouthRadius: 2.05, cisternaRadius: 1.22, cisternaOffset: 3.75,
  srTubuleRadius: 0.72, junctionalGap: 0.6, excitationDuration: 6 });
const C = INTERIOR;
const shellPoint = (x, a, r = C.radius) => radial(a).multiplyScalar(r).setX(x);
const fit = (distance, aspect) => distance * Math.max(1, 1.17 / Math.max(0.55, aspect || 1.6));
const ringLevel = (i, j) => i % 2 === 0 && j % 2 === 0 ? 0 : (i + j) % 2 === 0 ? 1 : 2;

export function createInteriorSurfaces() {
  const mouth = shellPoint(C.tubuleX, C.mouthAngle), bend = C.mouthRadius - C.tubuleRadius;
  const neck = shellPoint(C.tubuleX, C.mouthAngle, C.radius - bend);
  const path = new THREE.CubicBezierCurve3(neck,
    neck.clone().addScaledVector(radial(C.mouthAngle), -3.0),
    V(0, 3.6, 2.0), V(0, 3.6, -1.5));
  const shell = (u, v) => shellPoint(-C.length / 2 + C.length * u, C.cutStart + (C.cutEnd - C.cutStart) * v / TAU);
  const funnel = (u, phi) => {
    const q = u * Math.PI / 2, r = C.mouthRadius - bend * Math.sin(q), depth = bend * (1 - Math.cos(q));
    return shellPoint(C.tubuleX + r * Math.cos(phi), C.mouthAngle + r * Math.sin(phi) / C.radius, C.radius - depth);
  };
  const tube = (u, phi) => {
    const center = path.getPointAt(u), dir = path.getTangentAt(u);
    const across = new THREE.Vector3().crossVectors(X, dir).normalize();
    const p = center.clone().addScaledVector(X, C.tubuleRadius * Math.cos(phi))
      .addScaledVector(across, C.tubuleRadius * Math.sin(phi));
    // Exact shared ring with the funnel; correction fades with zero derivative.
    const initial = neck.clone().addScaledVector(X, C.tubuleRadius * Math.cos(phi))
      .addScaledVector(new THREE.Vector3().crossVectors(X, path.getTangentAt(0)).normalize(), C.tubuleRadius * Math.sin(phi));
    return p.addScaledVector(funnel(1, phi).sub(initial), 1 - smooth(0, 0.2, u));
  };
  const sr = [-1, 1].map(side => {
    // One surface widens into the terminal cisterna, with no internal cap.
    const at = t => path.getPointAt(t).setX(side * C.cisternaOffset);
    const start = at(0.30), end = at(0.80);
    const before = start.clone().addScaledVector(path.getTangentAt(0.30), -2.4).setX(side * 11.6);
    const after = end.clone().addScaledVector(path.getTangentAt(0.80), 2.4).setX(side * 11.6);
    const incoming = new THREE.CubicBezierCurve3(before, before.clone().addScaledVector(X, -side * 3.0),
      start.clone().addScaledVector(path.getTangentAt(0.30), -2.4), start);
    const outgoing = new THREE.CubicBezierCurve3(end, end.clone().addScaledVector(path.getTangentAt(0.80), 2.4),
      after.clone().addScaledVector(X, -side * 3.0), after);
    // Tangent-continuous bends with a curvature radius greater than the wall.
    const center = u => u < 0.35 ? incoming.getPoint(u / 0.35)
      : u > 0.70 ? outgoing.getPoint((u - 0.70) / 0.30) : at(0.30 + (u - 0.35) / 0.35 * 0.50);
    const radius = u => C.srTubuleRadius + (C.cisternaRadius - C.srTubuleRadius)
      * smooth(0.25, 0.44, u) * (1 - smooth(0.60, 0.82, u));
    const point = (u, phi) => {
      const p = center(u), e = 0.0001;
      const dir = center(Math.min(1, u + e)).sub(center(Math.max(0, u - e))).normalize();
      const across = V(0, 0.72, 0.69).addScaledVector(dir, -dir.dot(V(0, 0.72, 0.69))).normalize();
      const second = new THREE.Vector3().crossVectors(dir, across).normalize();
      return p.addScaledVector(across, radius(u) * Math.cos(phi)).addScaledVector(second, radius(u) * Math.sin(phi));
    };
    return { side, center, radius, point };
  });
  return { shell, funnel, tube, sr, path, mouth, neck };
}

function surfaceSites(surfaces, compact) {
  const sites = [], pitch = BILAYER.pitch * (compact ? 1.2 : 1);
  function add(point, normal, region, system, i, j, u, v) {
    sites.push({ point, normal, region, system, level: ringLevel(i, j), u, v });
  }
  const nx = Math.ceil(C.length / pitch), na = Math.ceil(C.radius * (C.cutEnd - C.cutStart) / pitch);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= na; j++) {
    const x = -C.length / 2 + C.length * i / nx, a = C.cutStart + (C.cutEnd - C.cutStart) * j / na;
    if (Math.hypot(x - C.tubuleX, (a - C.mouthAngle) * C.radius) < C.mouthRadius + 0.08) continue;
    add(shellPoint(x, a), radial(a), "sarcolemma", "plasma", i, j, i / nx, j / na * TAU);
  }
  const nf = 8;
  for (let i = 0; i < nf; i++) {
    // The funnel narrows: keep its inner rings from piling heads into the lumen.
    const nc = (compact ? 32 : 40) - 2 * Math.round(5 * Math.sin(i / nf * Math.PI / 2));
    for (let j = 0; j < nc; j++) {
      const u = i / nf, v = j / nc * TAU, p = surfaces.funnel(u, v);
      const hint = radial(C.mouthAngle).multiplyScalar(1 - u).add(V(-Math.cos(v), 0, 0).multiplyScalar(u));
      const normal = surfaceNormal(surfaces.funnel, u, v, hint);
      add(p, normal, "invagination", "plasma", i, j, u, v);
    }
  }
  const nt = Math.ceil(surfaces.path.getLength() / pitch), nr = compact ? 20 : 24;
  for (let i = 0; i <= nt; i++) for (let j = 0; j < nr; j++) {
    const u = i / nt, v = j / nr * TAU;
    if (u > 0.29 && u < 0.90 && Math.sin(v) > 0.16) continue;
    const p = surfaces.tube(u, v), towardLumen = surfaces.path.getPointAt(u).sub(p);
    add(p, surfaceNormal(surfaces.tube, u, v, towardLumen), "tubule", "plasma", i, j, u, v);
  }
  for (const s of surfaces.sr) {
    const distances = [0], resolution = 480;
    let prev = s.center(0);
    for (let k = 1; k <= resolution; k++) {
      const next = s.center(k / resolution); distances.push(distances[k - 1] + next.distanceTo(prev)); prev = next;
    }
    const steps = Math.ceil(distances.at(-1) / pitch);
    let k = 1;
    for (let i = 0; i <= steps; i++) {
      const d = i / steps * distances.at(-1);
      while (k < resolution && distances[k] < d) k++;
      const u = ((k - 1) + (d - distances[k - 1]) / Math.max(0.00001, distances[k] - distances[k - 1])) / resolution;
      const cols = compact ? 24 : 28;
      for (let j = 0; j < cols; j++) {
        const v = j / cols * TAU, p = s.point(u, v), out = p.clone().sub(s.center(u));
        // Removed front wall exposes real head/tail cross-sections and lumen.
        if (out.dot(V(0, 0.62, 0.78)) > s.radius(u) * 0.47) continue;
        add(p, surfaceNormal(s.point, u, v, out), u > 0.30 && u < 0.82 ? "cisterna" : "sr-tubule",
          "sr", i, j, u, v);
      }
    }
  }
  return sites;
}

function dots(points, color, radius, geometry) {
  const material = mat(color, { rough: 0.48 }).clone();
  const mesh = new THREE.InstancedMesh(geometry, material, points.length), d = new THREE.Object3D();
  points.forEach((p, i) => { d.position.copy(p); d.scale.setScalar(radius); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); return mesh;
}

export function createCellInterior({ compact = false } = {}) {
  const group = new THREE.Group(); group.name = "membrane-centric-cell-interior";
  const surfaces = createInteriorSurfaces(), sites = surfaceSites(surfaces, compact);
  const lipids = createCurvedBilayers(sites, { compact }); group.add(lipids.group);
  const sphere = new THREE.SphereGeometry(1, 10, 7), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const waterGeometry = new THREE.OctahedronGeometry(1, 0);
  const context = new THREE.Group(); context.name = "myofibril-context"; group.add(context);
  const fibrils = new THREE.InstancedMesh(cylinder, mat(0xd2d8d8, { opacity: 0.10 }).clone(), 5);
  fibrils.material.depthWrite = false;
  const dummy = new THREE.Object3D();
  [[-3,-3],[-1,-4.8],[1.3,-4.8],[3.3,-3.4],[-4.8,-0.7]].forEach(([y,z], i) => {
    dummy.position.set(0,y,z); dummy.quaternion.setFromUnitVectors(Y,X); dummy.scale.set(0.7,24,0.7);
    dummy.updateMatrix(); fibrils.setMatrixAt(i,dummy.matrix);
  });
  fibrils.name = "muted-myofibril-context"; context.add(fibrils);
  const waterPoints = [0.4,1.0,1.6].map(d => surfaces.mouth.clone().addScaledVector(radial(C.mouthAngle),d));
  for (let i=0;i<9;i++) waterPoints.push(surfaces.path.getPointAt(i/9));
  waterPoints.push(surfaces.funnel(0.5,0).clone().setX(0));
  const water = dots(waterPoints,0x419bc5,0.12,waterGeometry); water.name="extracellular-and-t-lumen-water";group.add(water);
  const srWaterPoints=surfaces.sr.flatMap(s=>[0.09,0.17,0.42,0.53,0.64,0.90].map(u=>s.center(u)));
  const srWater=dots(srWaterPoints,0x9176a9,0.14,waterGeometry);srWater.name="separate-sr-lumen-markers";group.add(srWater);
  const nmj=new THREE.Group();nmj.name="optional-nmj-context";group.add(nmj);
  const nmjAnchor=shellPoint(-9,C.mouthAngle,8.1);
  const terminal=new THREE.Mesh(sphere,mat(COLOR.SM,{rough:0.65}).clone());terminal.position.copy(nmjAnchor);terminal.scale.set(1.2,0.7,0.7);nmj.add(terminal);
  const axonCurve=new THREE.CatmullRomCurve3([nmjAnchor.clone().add(V(-4,1,2)),nmjAnchor.clone().add(V(-2,0.6,0.7)),nmjAnchor]);
  const axonGeometry=new THREE.TubeGeometry(axonCurve,18,0.18,7,false);
  const axon=new THREE.Mesh(axonGeometry,terminal.material);nmj.add(axon);
  const signal=dots([surfaces.mouth],0xd0a244,0.17,sphere);signal.name="optional-excitation-sequence-marker";group.add(signal);
  const triad=surfaces.path.getPointAt(0.59);
  const srAnchor=surfaces.sr[0].center(0.16), srLumen=surfaces.sr[0].center(0.48);
  const shellAnchor=shellPoint(-4.6,C.cutEnd), tubeSurface=surfaces.tube(0.61,0);
  const anchors={sarcolemma:shellAnchor,tubule:surfaces.funnel(0.5,Math.PI),lumen:triad,
    sr:srAnchor,srLumen,triad,cisternae:srLumen,cisternaLeft:triad.clone().addScaledVector(X,-C.cisternaOffset),
    cisternaRight:triad.clone().addScaledVector(X,C.cisternaOffset),cytosol:triad.clone().addScaledVector(X,2.1),
    extracellular:surfaces.mouth.clone().addScaledVector(radial(C.mouthAngle),1.3),nmj:nmjAnchor,
    myofibril:V(-8,1.3,-4.8),tCytosolic:tubeSurface.clone().addScaledVector(X,BILAYER.halfThickness),
    srCytosolic:surfaces.sr[1].center(0.575).addScaledVector(X,-C.cisternaRadius-BILAYER.halfThickness),
    exoplasmic:surfaces.tube(0.62,0).addScaledVector(X,-BILAYER.halfThickness),
    srLuminal:surfaces.sr[1].center(0.575).addScaledVector(X,-C.cisternaRadius+BILAYER.halfThickness),
    head:shellAnchor.clone().addScaledVector(radial(C.cutEnd),BILAYER.halfThickness),tail:shellAnchor.clone()};
  anchors.junctionGap=anchors.tCytosolic.clone().lerp(anchors.srCytosolic,0.5);
  let mode="overview",elapsed=0;
  const modes=["overview","continuity","tubule","lumen","sr","sr-lumen","cisterna","triad","triad-detail","sarcolemma","cross-section","membrane-zoom","compare","nmj","excitation"];
  const home=aspect=>({radius:fit(34,aspect),theta:0.52,phi:1.18,target:V(0,-0.5,0)});
  function focus(key,aspect){
    const frame=(radius,theta,phi,target)=>({radius:fit(radius,aspect),theta,phi,target:target.clone()});
    if(key==="sarcolemma")return frame(8.5,-0.12,1.76,shellAnchor);
    if(key==="cross-section")return frame(5.8,0.10,0.30,shellAnchor);
    if(key==="tubule")return frame(10.3,0.04,2.68,surfaces.mouth.clone().lerp(surfaces.neck,0.65));
    if(key==="lumen")return frame(7.1,0.18,1.12,triad);
    if(key==="sr")return frame(8.1,0.22,1.03,srAnchor);
    if(key==="sr-lumen"||key==="cisterna")return frame(key==="cisterna"?10.2:6.8,0.14,1.07,srLumen);
    if(key==="triad")return frame(16.0,0.06,1.30,triad);
    if(key==="triad-detail")return frame(7.2,0.03,1.08,anchors.junctionGap);
    if(key==="membrane-zoom")return frame(4.3,0.16,1.14,tubeSurface);
    if(key==="nmj")return frame(9,-0.18,1.95,nmjAnchor);
    return frame(16.0,0.06,1.12,triad);
  }
  function setMode(next="overview"){
    mode=modes.includes(next)?next:"overview";elapsed=0;
    nmj.visible=mode==="nmj"||mode==="excitation";signal.visible=mode==="excitation";
    water.visible=["overview","continuity","tubule","lumen","triad","compare"].includes(mode);
    srWater.visible=["overview","continuity","sr","sr-lumen","cisterna","triad","compare"].includes(mode);
    context.visible=["overview","continuity","nmj","excitation"].includes(mode);group.userData.mode=mode;
    const frame=["overview","continuity","excitation"].includes(mode)?home(1.6):focus(mode,1.6);
    lipids.rebuild(frame.radius,frame.target,mode);
  }
  function update(dt=0,camera){
    if(camera)lipids.update(dt,camera.radius,camera.target,mode);
    if(mode!=="excitation")return;
    elapsed=Math.min(C.excitationDuration,elapsed+Math.max(0,dt));signal.visible=elapsed<C.excitationDuration;
    if(signal.visible){
      const p=elapsed<2?nmjAnchor:elapsed<3?shellPoint(-9+(elapsed-2)*9,C.mouthAngle,7.45)
        :elapsed<4?surfaces.path.getPointAt(elapsed-3):triad;
      dummy.position.copy(p);dummy.scale.setScalar(0.17);dummy.quaternion.identity();dummy.updateMatrix();signal.setMatrixAt(0,dummy.matrix);signal.instanceMatrix.needsUpdate=true;
    }
  }
  function getStats(){
    let meshes=0;group.traverse(o=>{if(o.isMesh)meshes++;});
    return{mode,compact,meshes,...lipids.getStats(),myofibrils:5,nmjVisible:nmj.visible,
      topology:{continuousSarcolemmaTubule:true,srSeparate:true,lumenOpenToExtracellular:true,
        teachingLumenWindow:true,junctionalGap:C.junctionalGap},
      excitationStep:Math.min(5,Math.floor(elapsed)),excitationComplete:elapsed>=C.excitationDuration,
      excitationElapsed:elapsed,diagnostic:{sites,records:lipids.records,surfaces,srWaterPoints,waterPoints}};
  }
  setMode();
  return{group,anchors,compact,home,focus,setMode,update,getStats,pickables:[],lipids,surfaces,
    patchFrame:aspect=>focus(["sarcolemma","cross-section"].includes(mode)?"cross-section":"membrane-zoom",aspect),
    dispose(){lipids.dispose();sphere.dispose();cylinder.dispose();waterGeometry.dispose();axonGeometry.dispose();
      new Set([fibrils.material,water.material,srWater.material,terminal.material,signal.material]).forEach(m=>m.dispose());
      [fibrils,water,srWater,signal].forEach(m=>m.dispose());},};
}
