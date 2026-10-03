/* Actual transforms, chart boundaries, aqueous spaces and memory reuse. */
import assert from "node:assert/strict";
import { THREE } from "../core/viewer.js";
import { createCellInterior, INTERIOR } from "../core/cell-interior.js";
import { BILAYER, surfaceNormal } from "../core/curved-bilayer.js";
import { INTERIOR_COMPOSITION } from "../core/membrane-composition.js";
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), up=V(0,1,0), matrix=new THREE.Matrix4();
const findings=[];
for(const compact of [false,true]){
  const scene=createCellInterior({compact}), {surfaces,lipids}=scene;
  const records=lipids.records, sites=scene.getStats().diagnostic.sites;
  // Seam identity is mathematical, independent of visual sparsity/LOD.
  let neckError=0, rimError=0, minimumNormalDot=1;
  for(let j=0;j<160;j++){
    const phi=j/160*Math.PI*2, rim=surfaces.funnel(0,phi), normal=V(0,rim.y,rim.z).normalize();
    rimError=Math.max(rimError,Math.abs(Math.hypot(rim.y,rim.z)-INTERIOR.radius));
    neckError=Math.max(neckError,surfaces.funnel(1,phi).distanceTo(surfaces.tube(0,phi)));
    const a=surfaceNormal(surfaces.funnel,0,phi,normal);
    assert.ok(a.dot(normal)>.999,'shell normal bends continuously into funnel');
    const towardLumen=surfaces.neck.clone().sub(surfaces.funnel(1,phi));
    const n1=surfaceNormal(surfaces.funnel,1,phi,towardLumen);
    const n2=surfaceNormal(surfaces.tube,0,phi,towardLumen);
    minimumNormalDot=Math.min(minimumNormalDot,n1.dot(n2));
  }
  assert.ok(neckError<1e-9&&rimError<1e-9,'no gap or cap at shell/funnel/tube boundaries');
  assert.ok(minimumNormalDot>.98,'leaflet direction is continuous across neck');
  for(const r of records){
    assert.ok([...r.position.toArray(),...r.water.toArray()].every(Number.isFinite));
    assert.ok(Math.abs(r.water.length()-1)<1e-6);
    if(r.id==='CHOL')continue;
    assert.ok(Math.abs(r.position.distanceTo(r.point)-BILAYER.halfThickness)<1e-9);
    if(r.region==='sarcolemma'){
      const out=V(0,r.point.y,r.point.z).normalize();
      assert.ok(r.water.dot(out)*(r.leaflet==='exoplasmic'?1:-1)>.999);
    }
    if(r.region==='tubule'){
      const inward=surfaces.path.getPointAt(r.u).sub(r.point).normalize();
      assert.ok(r.water.dot(inward)*(r.leaflet==='exoplasmic'?1:-1)>.97,'T lumen keeps the exoplasmic leaflet');
    }
    if(r.system==='sr'){
      const s=surfaces.sr[r.point.x<0?0:1], outward=r.point.clone().sub(s.center(r.u)).normalize();
      assert.ok(r.water.dot(outward)*(r.leaflet==='cytosolic'?1:-1)>.60,'SR water-facing orientation, including swelling');
    }
  }
  // Tube lumen is wider than the luminal head envelope, never filled by tails.
  const headRadius=0.34*BILAYER.widths[0];
  assert.ok(INTERIOR.tubuleRadius-BILAYER.halfThickness-headRadius>0.25);
  assert.ok(INTERIOR.srTubuleRadius-BILAYER.halfThickness-headRadius>0.09);
  // Facing head envelopes in the central triad: both point into junction cytosol.
  const tube=records.filter(r=>r.region==='tubule'&&r.leaflet==='cytosolic'&&r.id!=='CHOL'&&r.u>.4&&r.u<.75);
  const sr=records.filter(r=>r.region==='cisterna'&&r.leaflet==='cytosolic'&&r.id!=='CHOL'&&r.u>.40&&r.u<.61&&r.point.x>0);
  const tmax=Math.max(...tube.map(r=>r.position.x)), smin=Math.min(...sr.map(r=>r.position.x));
  const conservativeGap=smin-tmax-2*headRadius;
  assert.ok(conservativeGap>0.20,`SR/T head envelopes cannot merge at any LOD: ${conservativeGap}`);
  assert.ok(tube.filter(r=>r.position.x>tmax-.10).every(r=>r.water.x>.9));
  assert.ok(sr.filter(r=>r.position.x<smin+.10).every(r=>r.water.x<-.8));
  assert.notDeepEqual(INTERIOR_COMPOSITION.plasma.positive,INTERIOR_COMPOSITION.sr.positive);
  const distribution=(system,leaflet)=>{
    const d={};records.filter(r=>r.system===system&&r.leaflet===leaflet).forEach(r=>d[r.id]=(d[r.id]||0)+1);return d;
  };
  const outer=distribution('plasma','exoplasmic'),inner=distribution('plasma','cytosolic'),srMix=distribution('sr','luminal');
  assert.ok(outer.SM>inner.SM&&inner.PS>outer.PS&&inner.PIP2>outer.PIP2);
  assert.ok(outer.PS>0&&outer.PI>0&&outer.PIP2>0&&inner.SM>0,'sampling does not assert absolute PM exclusivity');
  assert.ok(srMix.PC>srMix.PI&&srMix.PE>srMix.PS&&!srMix.PIP2&&!srMix.SM);
  const buffers=[...lipids.batches.values()].map(b=>b.mesh.instanceMatrix.array);
  const far=lipids.getStats().visibleLipids;
  scene.setMode('cross-section');
  assert.ok(lipids.getStats().lod[2].lipids>0);
  assert.equal(lipids.batches.size,8);
  // Inspect actual uploaded head/tail matrices, not just record normals.
  for(const b of lipids.batches.values())for(let i=0;i<b.mesh.count;i++){
    b.mesh.getMatrixAt(i,matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    const r=records[b.mesh.userData.recordIndices[i]],p=V().setFromMatrixPosition(matrix);
    if(b.kind==='head'){
      assert.ok(p.distanceTo(r.position)<1e-5,'rendered head at its water-facing plane');
      const scale=V().setFromMatrixScale(matrix);
      assert.ok(Math.abs(scale.x-scale.y)<1e-6,'head remains a sphere');
    }
    if(b.kind==='tail')assert.ok(p.clone().sub(r.position).dot(r.water)<-.035,'every tail points inward, into its own bilayer');
  }
  for(const mode of ['tubule','lumen','sr','sr-lumen','cisterna','triad','triad-detail','membrane-zoom','compare','nmj','excitation','overview']){
    scene.setMode(mode);const f=scene.focus(mode,.6);scene.update(.3,{radius:f.radius,target:f.target});
    assert.ok(f.radius>0&&f.target.toArray().every(Number.isFinite));
    assert.ok([...lipids.batches.values()].every((b,i)=>b.mesh.instanceMatrix.array===buffers[i]));
  }
  assert.equal(scene.getStats().nmjVisible,false);
  scene.setMode('excitation');scene.update(10);assert.equal(scene.getStats().excitationComplete,true);
  scene.setMode('overview');assert.equal(scene.getStats().nmjVisible,false);
  findings.push({compact,samples:sites.length,lipids:records.length,farLipids:far,batches:8,neckError,rimError,minimumNormalDot,conservativeGap});
  scene.dispose();
}
console.log('Bilayer geometry, orientation, aqueous compartments, composition, LOD and buffer reuse: PASS');
console.log(JSON.stringify(findings,null,2));
