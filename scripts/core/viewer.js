/* ============================================================
   Viewer — 세 모듈이 공유하는 얇은 Three.js 래퍼
   - 밝은 라이팅, 부드러운 궤도 카메라, HTML 라벨 오버레이
   - WebGL 실패 시 fallback 메시지를 그대로 남긴다
   ============================================================ */

import * as THREE from "../../assets/vendor/three.module.min.js";

const REDUCED_MOTION =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 카메라 궤도 컨트롤 (드래그 회전 + 휠 줌) ---------- */

class Orbit {
  constructor(camera, dom, target) {
    this.camera = camera;
    this.dom = dom;
    this.target = target.clone();
    this.home = { radius: 0, theta: 0, phi: 0, target: target.clone() };

    this.radius = 30;
    this.theta = 0; // 방위각
    this.phi = Math.PI / 2.6; // 극각
    this.goal = { radius: 30, theta: 0, phi: Math.PI / 2.6 };
    this.goalTarget = target.clone();

    this.minRadius = 6;
    this.maxRadius = 140;
    this.minPhi = 0.25;
    this.maxPhi = Math.PI - 0.25;

    this.autoRotate = !REDUCED_MOTION;
    this.autoSpeed = 0.055; // rad/s — 아주 느리게
    this.idle = 0;
    this.dragging = false;
    this.engaged = false;
    this.moved = 0;

    this._bind();
  }

  _bind() {
    const dom = this.dom;
    let px = 0;
    let py = 0;
    let pointerId = null;

    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId;
      this.dragging = true;
      this.engaged = true; // 캔버스를 한 번 조작한 뒤에만 휠 확대를 켠다
      this.moved = 0;
      px = e.clientX;
      py = e.clientY;
      capture(dom, pointerId, true);
    };

    const move = (e) => {
      if (!this.dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.goal.theta -= dx * 0.006;
      this.goal.phi = clamp(this.goal.phi - dy * 0.005, this.minPhi, this.maxPhi);
      this.idle = 0;
    };

    const up = (e) => {
      if (e.pointerId !== pointerId) return;
      this.dragging = false;
      capture(dom, pointerId, false);
      pointerId = null;
    };

    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("pointerleave", () => {
      this.engaged = false;
    });
    // 캔버스 위에서 무심코 굴린 휠이 페이지 스크롤을 막지 않도록,
    // 캔버스를 한 번 클릭·드래그했거나 Ctrl 을 누른 경우에만 확대/축소한다.
    dom.addEventListener(
      "wheel",
      (e) => {
        if (!this.engaged && !e.ctrlKey) return;
        e.preventDefault();
        const f = Math.exp(e.deltaY * 0.0012);
        this.goal.radius = clamp(this.goal.radius * f, this.minRadius, this.maxRadius);
        this.idle = 0;
      },
      { passive: false }
    );
  }

  /** 카메라 목표 위치를 정한다(부드럽게 이동). */
  frame({ radius, theta, phi, target }, instant = false) {
    if (radius !== undefined) this.goal.radius = clamp(radius, this.minRadius, this.maxRadius);
    if (theta !== undefined) this.goal.theta = theta;
    if (phi !== undefined) this.goal.phi = clamp(phi, this.minPhi, this.maxPhi);
    if (target) this.goalTarget.copy(target);
    if (instant) {
      this.radius = this.goal.radius;
      this.theta = this.goal.theta;
      this.phi = this.goal.phi;
      this.target.copy(this.goalTarget);
    }
    this.idle = 0;
  }

  saveHome() {
    this.home = {
      radius: this.goal.radius,
      theta: this.goal.theta,
      phi: this.goal.phi,
      target: this.goalTarget.clone(),
    };
  }

  reset(instant = false) {
    this.frame(this.home, instant);
  }

  update(dt) {
    this.idle += dt;
    if (this.autoRotate && !this.dragging && this.idle > 1.2) {
      this.goal.theta += this.autoSpeed * dt;
    }
    const k = 1 - Math.pow(0.0015, dt); // 프레임률 독립 damping
    this.radius += (this.goal.radius - this.radius) * k;
    this.theta += (this.goal.theta - this.theta) * k;
    this.phi += (this.goal.phi - this.phi) * k;
    this.target.lerp(this.goalTarget, k);

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  }
}

/* ---------- HTML 라벨 오버레이 ---------- */

class Labels {
  constructor(host) {
    this.root = document.createElement("div");
    this.root.className = "labels";
    host.appendChild(this.root);
    this.items = [];
    this.enabled = true;
    this._v = new THREE.Vector3();
  }

  /**
   * @param {string} text
   * @param {object} opts { anchor: Object3D|Vector3, offset: Vector3, variant, group }
   */
  add(text, opts = {}) {
    const el = document.createElement("div");
    el.className = "label" + (opts.variant ? ` label--${opts.variant}` : "");
    el.textContent = text;
    el.classList.add("label--hidden");
    this.root.appendChild(el);
    const item = {
      el,
      anchor: opts.anchor || new THREE.Vector3(),
      offset: opts.offset ? opts.offset.clone() : new THREE.Vector3(),
      group: opts.group || "default",
      visible: opts.visible !== false,
      _pos: new THREE.Vector3(),
      _w: 0,
      _h: 0,
      _dirty: true,
    };
    this.items.push(item);
    return item;
  }

  setText(item, text) {
    if (!item) return;
    item.el.textContent = text;
    item._dirty = true;
  }

  show(group, on) {
    for (const it of this.items) {
      if (it.group === group) it.visible = on;
    }
  }

  only(groups) {
    const set = new Set([].concat(groups));
    for (const it of this.items) it.visible = set.has(it.group);
  }

  hideAll() {
    for (const it of this.items) it.visible = false;
  }

  setEnabled(on) {
    this.enabled = on;
    this.root.style.display = on ? "" : "none";
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }

  update(camera, width, height) {
    if (!this.enabled) return;
    const v = this._v;
    for (const it of this.items) {
      if (!it.visible) {
        it.el.classList.add("label--hidden");
        continue;
      }
      if (it.anchor.isObject3D) {
        it.anchor.getWorldPosition(v);
      } else {
        v.copy(it.anchor);
      }
      v.add(it.offset);
      v.project(camera);
      const behind = v.z > 1;
      const off = v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15;
      if (behind || off) {
        it.el.classList.add("label--hidden");
        continue;
      }
      it.el.classList.remove("label--hidden");
      if (it._dirty || !it._w) {
        it._w = it.el.offsetWidth;
        it._h = it.el.offsetHeight;
        it._dirty = false;
      }
      // 캔버스 밖으로 잘리지 않도록 가장자리에서 붙잡아 둔다
      const hw = it._w / 2 + 4;
      const hh = it._h / 2 + 3;
      const px = clamp((v.x * 0.5 + 0.5) * width, hw, Math.max(hw, width - hw));
      const py = clamp((-v.y * 0.5 + 0.5) * height, hh, Math.max(hh, height - hh));
      it.el.style.transform = `translate(-50%,-50%) translate(${px}px, ${py}px)`;
    }
  }
}

/* ---------- Viewer ---------- */

export class Viewer {
  constructor(hostId) {
    this.host = document.getElementById(hostId);
    this.ok = false;
    this.active = false;
    if (!this.host) return;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (err) {
      console.warn("WebGL 초기화 실패:", err);
      return;
    }
    if (!this.renderer.getContext()) return;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0xf3f7f9, 1);
    this.host.appendChild(this.renderer.domElement);
    this.host.classList.add("canvas-wrap--ok");

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf3f7f9);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.5, 500);

    // 밝고 단순한 라이팅 — 구조가 어둡게 묻히지 않도록
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d6de, 0.75);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(14, 22, 18);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.38);
    fill.position.set(-16, -6, -12);
    this.scene.add(fill);

    this.controls = new Orbit(this.camera, this.host, new THREE.Vector3());
    this.labels = new Labels(this.host);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._clickHandlers = [];
    this.host.addEventListener("pointerup", (e) => this._onClick(e));

    this._updaters = [];
    this._size = { w: 0, h: 0 };
    this.ok = true;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.host);
    this.resize();
  }

  onUpdate(fn) {
    this._updaters.push(fn);
  }

  /** 클릭 가능한 객체를 등록한다. hit.object.userData.pickId 를 사용. */
  onPick(fn) {
    this._clickHandlers.push(fn);
  }

  /** 현재 상태에서 클릭 가능한 객체만 등록한다(빈 배열이면 클릭이 아예 없다). */
  setPickables(objects) {
    this._pickables = objects || [];
  }

  _onClick(e) {
    if (!this._pickables || !this._pickables.length) return;
    if (this.controls.moved > 6) return;
    const r = this.host.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this._pickables, true);
    for (const hit of hits) {
      // three.js 의 raycaster 는 visible=false 인 것도 그대로 맞힌다.
      // 숨어 있는 물체가 잡히지 않도록 조상까지 거슬러 올라가 확인한다.
      if (!isVisible(hit.object)) continue;
      let obj = hit.object;
      while (obj && obj.userData.pickId === undefined) obj = obj.parent;
      if (!obj) continue;
      for (const fn of this._clickHandlers) fn(obj.userData.pickId, obj);
      return;
    }
  }

  resize() {
    if (!this.ok) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h || (w === this._size.w && h === this._size.h)) return;
    this._size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    if (!this.ok) return;
    this.resize();
    for (const fn of this._updaters) fn(dt);
    this.controls.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera, this._size.w, this._size.h);
  }

  setActive(on) {
    this.active = on;
    if (on) this.resize();
  }
}

/** 포인터 캡처는 포인터가 이미 사라졌으면 예외를 던지므로 감싸 둔다. */
function capture(dom, id, on) {
  try {
    if (on) dom.setPointerCapture?.(id);
    else dom.releasePointerCapture?.(id);
  } catch {
    /* 이미 해제된 포인터 — 무시해도 된다 */
  }
}

/** 자기 자신과 모든 조상이 visible 일 때만 true */
function isVisible(obj) {
  let o = obj;
  while (o) {
    if (o.visible === false) return false;
    o = o.parent;
  }
  return true;
}

/* ---------- 공용 유틸 ---------- */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** 재질 캐시 — 같은 색은 재사용해서 draw call 부담을 줄인다. */
const matCache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${opts.rough ?? 0.45}|${opts.metal ?? 0.02}|${
    opts.opacity ?? 1
  }|${opts.flat ? 1 : 0}|${opts.emissive ?? 0}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.45,
    metalness: opts.metal ?? 0.02,
    flatShading: !!opts.flat,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  matCache.set(key, m);
  return m;
}

/** 두 점을 잇는 원기둥 (결합 표현) */
export function bond(a, b, radius, material, radialSegments = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1);
  geo.translate(0, len / 2, 0);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a);
  mesh.lookAt(b);
  return mesh;
}

export function setBond(mesh, a, b) {
  const len = a.distanceTo(b);
  mesh.position.copy(a);
  mesh.lookAt(b);
  mesh.scale.set(1, 1, Math.max(len / mesh.userData.baseLen, 0.001));
}

export { THREE, REDUCED_MOTION };
