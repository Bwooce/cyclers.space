// Lazily-loaded Three.js front-page hero gallery (task #227, spec
// docs/superpowers/specs/2026-06-13-front-page-orbit-viz-design.md §2).
//
// This module is the ONLY hero file that imports three, and it is reached only
// via the dynamic `import("../lib/hero-gallery")` in the HeroViz "View in 3D"
// click handler — mirroring OrbitView's initThreeLaunch: the front page ships
// ZERO WebGL bytes until the user clicks.
//
// Unlike three-view.ts (one heliocentric clockConfig, one craft), the gallery
// auto-cycles the THREE hero scenes (hero-scenes.ts), each a whole SYSTEM of
// V1+ rows drawn together. It reuses the pure primitives the per-cycler view is
// built on — toThree (the single ecliptic->three frame swap), kepler-time
// samplePath/stateAt for heliocentric curves, cr3bp-propagate for the rotating
// frame — plus the same palette / starfield / dispose patterns.
//
// Honesty (project law, the 3c79bd9 binding):
//   - Per-scene caption goes BELOW the canvas (never an overlay), naming each
//     curve's fidelity from the scene's computed captionLines.
//   - A row whose data supports no curve is a BADGE in the legend (named +
//     tier), NEVER an invented curve. hero-scenes.ts already encodes the
//     honest geometry (curves vs badges); the gallery only renders what it is
//     given and never manufactures a missing curve.
//   - Markers are spheres with a fixed WORLD radius, framed by the scene's own
//     extent, so they stay visible at every camera angle (the "nothing
//     vanishes edge-on" lesson — here met by world-sized glyphs, not SVG
//     counter-scale).
//
// prefers-reduced-motion: no auto-cycle, no camera drift, no marker animation —
// static curves, manual prev/next only.

import type * as THREE_NS from "three";
import type { HeroSceneSpec } from "./hero-scenes";
import { samplePath, stateAt, type KeplerElements } from "./kepler-time";
import { propagateCr3bp } from "./cr3bp-propagate";
import { toThree } from "./three-axis";
import { hohmannArcPoints } from "./uranus-scene";

// Tier colours mirror the poster's palette so the two renderers agree.
const TIER_COLOR: Record<string, number> = {
  V5: 0xe08fe0,
  V4: 0xe0907f,
  V3: 0xf0c060,
  V2: 0x6fd08c,
  V1: 0x7fa8e0,
};
// Distinct per-curve hues within a scene (colour + a named legend entry — never
// colour alone), reused for whichever scene is showing.
const CURVE_COLORS = [0x6fd08c, 0x7fa8e0, 0xf0c060, 0xe0907f, 0xc89fe8, 0x7fd0c0, 0xe0c07f];
const URANUS_COLOR = 0x8fc7d9;

const SCENE_DWELL_MS = 8000;

function palette(dark: boolean) {
  return dark
    ? { clear: 0x0b0e14, planet: 0x80a8d4, sun: 0xffcc66, earth: 0x7fb2e0, moon: 0xc9ced9, star: 0x888888 }
    : { clear: 0xf2f4f8, planet: 0x33567a, sun: 0xcc8800, earth: 0x2a6299, moon: 0x707888, star: 0x999999 };
}

/** A built scene: three.js objects + the per-frame updater + the framing extent. */
interface BuiltScene {
  group: THREE_NS.Group;
  /** Largest world radius of any object — used to frame the camera. */
  extent: number;
  /** Advance time-true markers (no-op for badge-only / reduced-motion). */
  setTime: (tDay: number) => void;
  /** Longest period (days) across this scene's curves, for the clock span. */
  periodDays: number;
  spec: HeroSceneSpec;
}

export interface HeroGallery {
  destroy(): void;
}

/**
 * Mount the cycling 3D gallery into `host`. `scenes` is the build-computed
 * HeroSceneSpec[] (passed through the inline JSON island). `legend`, `caption`
 * and the prev/next/play buttons are DOM the caller has already created; this
 * module drives them. Returns a handle whose destroy() tears down WebGL.
 */
export async function mountHeroGallery(
  host: HTMLElement,
  scenes: HeroSceneSpec[],
  ui: {
    legend: HTMLElement;
    caption: HTMLElement;
    title: HTMLElement;
    prevBtn: HTMLButtonElement;
    nextBtn: HTMLButtonElement;
    counter: HTMLElement;
  },
): Promise<HeroGallery> {
  const THREE = (await import("three")) as typeof THREE_NS;
  host.textContent = "";

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const col = palette(dark);

  const width = host.clientWidth || 640;
  const height = host.clientHeight || 420;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.domElement.classList.add("hero-gallery-canvas");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(col.clear);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.001, 5000);

  // --- shared materials (disposed once at teardown) -------------------------
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const lineMatFor = (color: number) => track(new THREE.LineBasicMaterial({ color }));
  const meshMatFor = (color: number) => track(new THREE.MeshBasicMaterial({ color }));

  // Shared starfield shell (kept across scenes; sized big so it frames all).
  function addStarfield(parent: THREE_NS.Object3D, R: number) {
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = R * s * Math.cos(th);
      pos[i * 3 + 1] = R * u;
      pos[i * 3 + 2] = R * s * Math.sin(th);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    parent.add(new THREE.Points(g, track(new THREE.PointsMaterial({ color: col.star, size: R * 0.004 }))));
  }

  // --- per-scene builders ---------------------------------------------------

  function lineFromPoints(pts: { x: number; y: number; z: number }[], color: number): THREE_NS.Line {
    const g = track(new THREE.BufferGeometry()).setFromPoints(
      pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    return new THREE.Line(g, lineMatFor(color));
  }

  function sphere(r: number, color: number): THREE_NS.Mesh {
    return new THREE.Mesh(track(new THREE.SphereGeometry(r, 16, 12)), meshMatFor(color));
  }

  /** Heliocentric scene: planet ellipses + Kepler curves + honest aphelion rings. */
  function buildHelio(spec: HeroSceneSpec): BuiltScene {
    const group = new THREE.Group();
    let extent = 1.6;
    let maxPeriod = 0;

    // Sun.
    group.add(sphere(0.05, col.sun));

    // Planet sourced ellipses + time-true markers.
    const planetMarkers: { el: KeplerElements; mesh: THREE_NS.Mesh }[] = [];
    for (const b of spec.bodies) {
      if (b.kind === "star" || !b.el) continue;
      const path = samplePath(b.el, 180).map(toThree);
      group.add(lineFromPoints(path, col.planet));
      extent = Math.max(extent, b.el.a * (1 + b.el.e));
      const m = sphere(0.035, col.earth);
      group.add(m);
      planetMarkers.push({ el: b.el, mesh: m });
    }

    // Curves: kepler ellipses (true) and aphelion rings (honest scale-only).
    const craftMarkers: { el: KeplerElements; mesh: THREE_NS.Mesh }[] = [];
    spec.curves.forEach((c, i) => {
      const color = TIER_COLOR[c.tier] ?? CURVE_COLORS[i % CURVE_COLORS.length]!;
      if (c.geom.kind === "kepler-ellipse") {
        const el = c.geom.el;
        group.add(lineFromPoints(samplePath(el, 240).map(toThree), color));
        extent = Math.max(extent, el.a * (1 + el.e));
        maxPeriod = Math.max(maxPeriod, periodOf(el));
        const m = sphere(0.04, color);
        group.add(m);
        craftMarkers.push({ el, mesh: m });
      } else if (c.geom.kind === "ring") {
        const r = c.geom.radiusAu;
        const pts: { x: number; y: number; z: number }[] = [];
        for (let k = 0; k <= 96; k++) {
          const a = (k / 96) * Math.PI * 2;
          pts.push(toThree({ x: r * Math.cos(a), y: r * Math.sin(a), z: 0 }));
        }
        const line = lineFromPoints(pts, color);
        (line.material as THREE_NS.LineBasicMaterial).transparent = true;
        (line.material as THREE_NS.LineBasicMaterial).opacity = 0.4;
        group.add(line);
        extent = Math.max(extent, r);
      }
    });

    const setTime = (tDay: number) => {
      for (const { el, mesh } of planetMarkers) {
        const w = toThree(stateAt(el, tDay));
        mesh.position.set(w.x, w.y, w.z);
      }
      for (const { el, mesh } of craftMarkers) {
        const w = toThree(stateAt(el, tDay));
        mesh.position.set(w.x, w.y, w.z);
      }
    };
    setTime(0);
    return { group, extent, setTime, periodDays: maxPeriod, spec };
  }

  /** Earth-Moon scene: rotating-frame PCR3BP propagations + fixed primaries. */
  function buildEarthMoon(spec: HeroSceneSpec): BuiltScene {
    const group = new THREE.Group();
    let extent = 1.2;
    let maxPeriod = 0;

    // Curves are in the rotating frame (units = Earth-Moon distance). The
    // rotating frame's (x, y) plane maps onto the ecliptic z=0 plane via the
    // same toThree swap so the camera convention is identical.
    const orbits: { pts: { x: number; y: number }[]; times: number[]; periodNd: number; marker: THREE_NS.Mesh; periodDays: number | null }[] = [];
    spec.curves.forEach((c, i) => {
      if (c.geom.kind !== "cr3bp") return;
      const color = CURVE_COLORS[i % CURVE_COLORS.length]!;
      const orbit = propagateCr3bp(c.geom.mu, c.geom.stateNd, c.geom.periodNd);
      group.add(lineFromPoints(orbit.points.map((p) => toThree({ x: p.x, y: p.y, z: 0 })), color));
      for (const p of orbit.points) extent = Math.max(extent, Math.hypot(p.x, p.y));
      const m = sphere(0.03, color);
      group.add(m);
      orbits.push({ pts: orbit.points, times: orbit.timesNd, periodNd: c.geom.periodNd, marker: m, periodDays: c.geom.periodDays });
      if (c.geom.periodDays != null) maxPeriod = Math.max(maxPeriod, c.geom.periodDays);
    });

    // Earth + Moon at their fixed rotating-frame positions.
    for (const b of spec.bodies) {
      if (!b.fixed) continue;
      const m = sphere(b.name === "Earth" ? 0.06 : 0.035, b.name === "Earth" ? col.earth : col.moon);
      const w = toThree({ x: b.fixed.x, y: b.fixed.y, z: 0 });
      m.position.set(w.x, w.y, w.z);
      group.add(m);
    }

    const setTime = (tDay: number) => {
      for (const o of orbits) {
        // Map the wall clock onto each orbit's own nondimensional period. When
        // the row publishes a period in days, run time-true (the rotating-frame
        // marker advances at the sourced rate); else fall back to phase.
        const pd = o.periodDays ?? 30;
        const phase = ((tDay % pd) + pd) % pd / pd; // 0..1
        const idx = Math.min(o.pts.length - 1, Math.floor(phase * (o.pts.length - 1)));
        const p = o.pts[idx]!;
        const w = toThree({ x: p.x, y: p.y, z: 0 });
        o.marker.position.set(w.x, w.y, w.z);
      }
    };
    setTime(0);
    return { group, extent, setTime, periodDays: maxPeriod, spec };
  }

  /** Uranian scene: real moon-orbit circles (km) + idealized Hohmann-type
   *  transfer arcs. Units here are km (hundreds of thousands), unlike the
   *  AU/nondimensional units of the other scenes, so marker radii are sized
   *  relative to this scene's own extent rather than the fixed world radii
   *  used elsewhere. The scene's local frame already defines z=pole (i=0 for
   *  every moon), so the shared toThree swap puts the pole on world "up" —
   *  the camera looks straight down it with no extra transform needed. */
  function buildUranian(spec: HeroSceneSpec): BuiltScene {
    const group = new THREE.Group();
    const maxSma = Math.max(1, ...spec.bodies.filter((b) => b.el).map((b) => b.el!.a));
    const extent = maxSma;
    const markerR = extent * 0.012;

    group.add(sphere(extent * 0.02, URANUS_COLOR));

    const moonMarkers: { el: KeplerElements; mesh: THREE_NS.Mesh }[] = [];
    for (const b of spec.bodies) {
      if (b.kind === "star" || !b.el) continue;
      group.add(lineFromPoints(samplePath(b.el, 120).map(toThree), col.moon));
      const m = sphere(markerR * 0.7, col.moon);
      group.add(m);
      moonMarkers.push({ el: b.el, mesh: m });
    }

    spec.curves.forEach((c, i) => {
      if (c.geom.kind !== "uranian-transfer") return;
      const color = CURVE_COLORS[i % CURVE_COLORS.length]!;
      const pts2d = hohmannArcPoints(
        { aKm: c.geom.aKm, e: c.geom.e, aIsPeriapsis: c.geom.smaAKm <= c.geom.smaBKm },
        c.geom.azimuthDeg,
        96,
      );
      const pts3d = pts2d.map((p) => toThree({ x: p.x, y: p.y, z: 0 }));
      group.add(lineFromPoints(pts3d, color));
    });

    const setTime = (tDay: number) => {
      for (const { el, mesh } of moonMarkers) {
        const w = toThree(stateAt(el, tDay));
        mesh.position.set(w.x, w.y, w.z);
      }
    };
    setTime(0);
    let maxPeriod = 0;
    for (const { el } of moonMarkers) maxPeriod = Math.max(maxPeriod, periodOf(el));
    return { group, extent, setTime, periodDays: maxPeriod, spec };
  }

  /** Badge-only scene (Jovian / other): no curve drawn — handled by the DOM
   *  legend + caption. The 3D group shows only a faint starfield + the host
   *  primary marker so the canvas isn't blank, NEVER a fabricated trajectory. */
  function buildBadgeOnly(spec: HeroSceneSpec): BuiltScene {
    const group = new THREE.Group();
    group.add(sphere(0.08, col.sun));
    return { group, extent: 1, setTime: () => {}, periodDays: 0, spec };
  }

  function periodOf(el: KeplerElements): number {
    const n = el.n_deg_per_day ?? 0.9856076686 / Math.pow(el.a, 1.5);
    return 360 / n;
  }

  function buildScene(spec: HeroSceneSpec): BuiltScene {
    if (spec.id === "heliocentric") return buildHelio(spec);
    if (spec.id === "earth-moon") return buildEarthMoon(spec);
    if (spec.id === "uranian") return buildUranian(spec);
    return buildBadgeOnly(spec);
  }

  const built = scenes.map(buildScene);
  // One starfield, sized for the largest scene, parented to the root scene.
  const maxExtent = Math.max(...built.map((b) => b.extent), 1);
  addStarfield(scene, maxExtent * 8 + 5);

  // --- scene switching + the DOM chrome it drives ---------------------------
  let current = -1;
  let activeGroup: THREE_NS.Group | null = null;

  function renderLegend(b: BuiltScene) {
    const parts: string[] = [];
    b.spec.curves.forEach((c) => {
      const color = `#${(TIER_COLOR[c.tier] ?? 0x888888).toString(16).padStart(6, "0")}`;
      parts.push(
        `<li class="hero-leg-item"><span class="hero-leg-swatch" style="background:${color}"></span>` +
          `<span class="hero-leg-tier">${esc(c.tier)}</span> ${esc(c.label)}` +
          `<span class="hero-leg-fid">${esc(c.fidelity)}</span></li>`,
      );
    });
    for (const bd of b.spec.badges) {
      const color = `#${(TIER_COLOR[bd.tier] ?? 0x888888).toString(16).padStart(6, "0")}`;
      parts.push(
        `<li class="hero-leg-item hero-leg-badge"><span class="hero-leg-tierbox" style="border-color:${color};color:${color}">${esc(bd.tier)}</span>` +
          ` ${esc(bd.label)} <span class="hero-leg-fid">${esc(bd.detail)} — no curve drawn</span></li>`,
      );
    }
    ui.legend.innerHTML = parts.join("");
  }

  function frameCamera(b: BuiltScene) {
    const R = b.extent * 2.4;
    camera.near = Math.max(0.0005, b.extent * 0.001);
    camera.far = R * 40 + 10;
    camera.updateProjectionMatrix();
    return R;
  }

  let camR = 4;
  function showScene(i: number) {
    if (i === current) return;
    if (activeGroup) scene.remove(activeGroup);
    current = ((i % built.length) + built.length) % built.length;
    const b = built[current]!;
    activeGroup = b.group;
    scene.add(activeGroup);
    camR = frameCamera(b);
    ui.title.textContent = b.spec.title;
    ui.counter.textContent = `${current + 1} / ${built.length}`;
    ui.caption.textContent = b.spec.captionLines.join("\n");
    renderLegend(b);
    azimuth = 0;
    b.setTime(0);
  }

  // --- camera orbit + clock loop --------------------------------------------
  let azimuth = 0;
  const elevation = 0.62; // looking down on the plane with depth
  function placeCamera() {
    const x = camR * Math.cos(elevation) * Math.sin(azimuth);
    const y = camR * Math.sin(elevation);
    const z = camR * Math.cos(elevation) * Math.cos(azimuth);
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
  }

  let raf = 0;
  let lastFrame = 0;
  let dwell = 0;
  let clockDay = 0;
  let autoCycle = !reduced;

  const render = (now: number) => {
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    const b = built[current]!;
    if (!reduced) {
      azimuth += dt * 0.00006; // slow camera orbit (~17 s per revolution)
      // Drive the clock for time-true markers.
      const span = b.periodDays > 0 ? b.periodDays : 0;
      if (span > 0) clockDay = (clockDay + (dt / 1000) * (span / 12)) % (span * 4);
      b.setTime(clockDay);
      if (autoCycle) {
        dwell += dt;
        if (dwell >= SCENE_DWELL_MS) {
          dwell = 0;
          clockDay = 0;
          showScene(current + 1);
        }
      }
    }
    placeCamera();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  };

  // --- manual nav (stops auto-cycle) ----------------------------------------
  const manual = (delta: number) => {
    autoCycle = false;
    dwell = 0;
    clockDay = 0;
    showScene(current + delta);
  };
  const onPrev = () => manual(-1);
  const onNext = () => manual(1);
  ui.prevBtn.addEventListener("click", onPrev);
  ui.nextBtn.addEventListener("click", onNext);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      manual(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      manual(1);
      e.preventDefault();
    }
  };
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "application");
  renderer.domElement.setAttribute(
    "aria-label",
    "3D hero gallery cycling the catalogue's independently reproduced orbit systems. Left and right arrows step between scenes.",
  );
  renderer.domElement.addEventListener("keydown", onKey);

  const onResize = () => {
    const w = host.clientWidth || width;
    const h = host.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  showScene(0);
  placeCamera();
  raf = requestAnimationFrame(render);

  const destroy = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("keydown", onKey);
    ui.prevBtn.removeEventListener("click", onPrev);
    ui.nextBtn.removeEventListener("click", onNext);
    for (const b of built) {
      b.group.traverse((o) => {
        const mesh = o as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    }
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { destroy };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
