/* ============================================================
   원자 단위 지질 모델을 three.js 장면 객체로 만든다 (ball-and-stick)

   표현 방식은 같은 시리즈인 carbohydrate-3d-explorer(포도당 3D)와 맞췄다.
     - 원자 = 반데르발스 반지름의 0.28 배 구
     - 결합 = 반지름 0.13 Å 원기둥, 양쪽 원자 색으로 반씩 나눠 칠한다
     - 원자 색 C 회청색 · O 붉은색 · N 파란색 · P 주황색 (화학 관례)
   원자·결합 수가 많으므로 원소별 InstancedMesh 하나로 묶어 그린다.
   지질 하나당 draw call 이 10개 남짓이라 학교 노트북에서도 가볍다.
   ============================================================ */

import { THREE, mat } from "./viewer.js";
import { getMolecule } from "./molecules.js";

/** 원소별 색과 반데르발스 반지름(Å) */
export const ELEMENT = {
  C: { color: 0x626b75, vdw: 1.7, ko: "탄소 C" },
  O: { color: 0xd93835, vdw: 1.52, ko: "산소 O" },
  N: { color: 0x2f56b5, vdw: 1.55, ko: "질소 N" },
  P: { color: 0xd9822b, vdw: 1.8, ko: "인 P" },
  S: { color: 0xd8b62a, vdw: 1.8, ko: "황 S" },
  H: { color: 0xd9dfe5, vdw: 1.2, ko: "수소 H" },
};

const BALL = 0.28; // 반데르발스 반지름에 곱하는 비율
const STICK = 0.13; // 결합 원기둥 반지름 (Å)
const DOUBLE_GAP = 0.17; // 이중결합 두 막대 사이 간격

/* 공유 지오메트리 — 분자를 몇 번 만들어도 하나만 쓴다 */
const SPHERE = new THREE.SphereGeometry(1, 18, 12);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
CYL.rotateX(Math.PI / 2); // 축을 +Z 로 맞춘다

const Z = new THREE.Vector3(0, 0, 1);
const cache = new Map();

/**
 * 지질 하나의 원자 단위 모델을 만든다.
 * @returns {THREE.Group} userData = { molecule, radius, anchors }
 */
export function buildAtomisticModel(id) {
  const mol = getMolecule(id);
  if (!mol) return null;

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const pos = mol.atoms.map((a) => new THREE.Vector3(a.x, a.y, a.z));

  // ---- 원소별로 모은다 (원자 구 · 반쪽 결합 막대)
  const byEl = new Map();
  const bucket = (el) => {
    if (!byEl.has(el)) byEl.set(el, { atoms: [], sticks: [] });
    return byEl.get(el);
  };
  mol.atoms.forEach((a, i) => bucket(a.el).atoms.push(i));

  for (const b of mol.bonds) {
    const a1 = pos[b.a];
    const a2 = pos[b.b];
    const mid = a1.clone().add(a2).multiplyScalar(0.5);
    if (b.order === 2) {
      // 이중결합 — 얇은 막대 두 개를 나란히 놓는다
      const off = offsetDir(mol, pos, b).multiplyScalar(DOUBLE_GAP / 2);
      for (const s of [1, -1]) {
        const d = off.clone().multiplyScalar(s);
        bucket(mol.atoms[b.a].el).sticks.push([a1.clone().add(d), mid.clone().add(d), STICK * 0.62]);
        bucket(mol.atoms[b.b].el).sticks.push([a2.clone().add(d), mid.clone().add(d), STICK * 0.62]);
      }
    } else {
      bucket(mol.atoms[b.a].el).sticks.push([a1, mid, STICK]);
      bucket(mol.atoms[b.b].el).sticks.push([a2, mid, STICK]);
    }
  }

  // ---- InstancedMesh 로 굽는다
  for (const [el, data] of byEl) {
    const spec = ELEMENT[el] || ELEMENT.C;
    const material = mat(spec.color, { rough: 0.42, metal: 0.03 });

    if (data.atoms.length) {
      const inst = new THREE.InstancedMesh(SPHERE, material, data.atoms.length);
      data.atoms.forEach((i, k) => {
        dummy.position.copy(pos[i]);
        dummy.quaternion.identity();
        dummy.scale.setScalar(spec.vdw * BALL);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      group.add(inst);
    }

    if (data.sticks.length) {
      const inst = new THREE.InstancedMesh(CYL, material, data.sticks.length);
      data.sticks.forEach(([from, to, r], k) => {
        const dir = to.clone().sub(from);
        const len = dir.length() || 0.001;
        dummy.position.copy(from).add(to).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(Z, dir.normalize());
        dummy.scale.set(r, r, len);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      group.add(inst);
    }
  }

  const anchors = {};
  for (const [k, v] of Object.entries(mol.anchors)) anchors[k] = new THREE.Vector3(v.x, v.y, v.z);

  group.userData = {
    molecule: mol,
    radius: mol.radius,
    extent: mol.extent,
    anchors,
    atomistic: true,
  };
  return group;
}

/** 이중결합 두 막대를 벌릴 방향(가능하면 이웃 원자가 만드는 평면 안쪽으로) */
function offsetDir(mol, pos, b) {
  const axis = pos[b.b].clone().sub(pos[b.a]).normalize();
  let ref = null;
  for (const other of mol.bonds) {
    if (other === b) continue;
    let n = -1;
    if (other.a === b.a) n = other.b;
    else if (other.b === b.a) n = other.a;
    else if (other.a === b.b) n = other.b;
    else if (other.b === b.b) n = other.a;
    if (n >= 0) {
      ref = pos[n].clone().sub(pos[b.a]);
      break;
    }
  }
  if (!ref) ref = new THREE.Vector3(0, 1, 0);
  const perp = ref.clone().sub(axis.clone().multiplyScalar(ref.dot(axis)));
  if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0).cross(axis);
  return perp.normalize();
}

/**
 * 분자 크기에 맞는 카메라 거리.
 * 지질은 길쭉해서 bounding sphere 로 맞추면 화면이 남는다.
 * 그래서 세로는 세로 화각, 가로는 가로 화각에 각각 맞춰 더 큰 쪽을 쓴다.
 */
export function fitDistance(camera, extent, margin = 1.2) {
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (camera.aspect || 1.6));
  const half = typeof extent === "number" ? { x: extent, y: extent, z: extent } : extent;
  const wide = Math.max(half.x, half.z); // 회전하면 x·z 가 번갈아 가로가 된다
  const d = Math.max(half.y / Math.tan(vfov / 2), wide / Math.tan(hfov / 2));
  return d * margin; // 라벨이 걸릴 자리를 조금 남긴다
}

/** 원자 색 범례 (캔버스 아래 안내용) */
export function atomLegend() {
  return ["C", "O", "N", "P"].map((el) => ({
    label: ELEMENT[el].ko,
    color: "#" + ELEMENT[el].color.toString(16).padStart(6, "0"),
  }));
}

/** 미리 만들어 둔 모델을 재사용한다(같은 지질을 다시 열 때). */
export function getAtomisticModel(id) {
  if (!cache.has(id)) cache.set(id, buildAtomisticModel(id));
  return cache.get(id);
}
