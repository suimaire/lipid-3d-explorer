/* Opt-in on localhost/?qa. Measures real RAF intervals, not the clamped animation dt. */
export function installMetrics(modules) {
  const details = document.createElement("details");
  details.id = "qa-metrics";
  details.style.cssText = "margin:24px;padding:16px;border:1px solid #ccd5db;font:12px monospace;white-space:pre-wrap";
  details.innerHTML = "<summary>Local rendering diagnostics</summary><pre></pre>";
  document.body.appendChild(details);
  const out = details.querySelector("pre");
  const reports = {};
  let previousKey = "", last = 0, warmup = 0, intervals = [];
  for (const [name, mod] of Object.entries(modules)) {
    if (!mod.viewer.ok) continue;
    mod.viewer.onUpdate(() => {
      const state = mod.getDiagnostics?.() || { module: name };
      // Lightweight current-state fields support transition regression checks;
      // the report below still uses the full warm-up/sample window for timing.
      details.dataset.module = name;
      details.dataset.view = state.viewMode || "scene";
      details.dataset.cameraFov = String(mod.viewer.camera.fov);
      const key = `${name}/${state.viewMode || "scene"}/${state.mode || "default"}/${state.cutaway ? "cut" : "closed"}`;
      const now = performance.now();
      if (key !== previousKey || state.transitioning || document.hidden || now - last > 250) {
        previousKey = key; intervals = []; warmup = 0; last = now; return;
      }
      const interval = now - last;
      last = now;
      if (++warmup <= 30) return;
      intervals.push(interval);
      if (intervals.length < 120) return;
      const sorted = [...intervals].sort((a, b) => a - b);
      reports[key] = { ...state, viewport: `${innerWidth}×${innerHeight}`, samples: intervals.length,
        measuredAt: new Date().toISOString(),
        canvas: `${mod.viewer.host.clientWidth}×${mod.viewer.host.clientHeight}`,
        camera: { fov: mod.viewer.camera.fov, theta: mod.viewer.controls.theta,
          phi: mod.viewer.controls.phi, radius: mod.viewer.controls.radius,
          target: mod.viewer.controls.target.toArray() },
        fps: +(1000 * intervals.length / intervals.reduce((a, b) => a + b, 0)).toFixed(1),
        medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
        p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        drawCalls: mod.viewer.renderer.info.render.calls,
        triangles: mod.viewer.renderer.info.render.triangles };
      out.textContent = JSON.stringify(reports, null, 2);
      intervals = [];
    });
  }
}
