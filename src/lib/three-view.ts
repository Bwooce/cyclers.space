// Lazy-loaded Three.js 3D camera for the per-cycler orbit view (viz phase 2b,
// design 2026-06-07-viz-phase2-timetrue-flying-camera-design.md §4). This module
// is the ONLY place that imports three, and it is itself only reached via the
// dynamic `import("../lib/three-view")` in the "View in 3D" click handler — so
// the page ships zero WebGL bytes until intent.
//
// It reads the SAME clockConfig JSON the 2a SVG island consumes (one clock, two
// renderers) and routes every position through toThree (the single ecliptic ->
// Three frame swap) so the 3D scene can never disagree with the 2D SVG. All work
// is in AU world units (3D drops the SVG's px/AU scale).

import type * as THREE_NS from "three";
import { stateAt } from "./kepler-time";
import { toThree } from "./three-axis";
import { buildOrbitLinePoints, buildCraftPathPoints } from "./three-geometry";
import { makeOrbitControls, type OrbitControls } from "./three-controls";
import { PLANETS, PLANET_GEOMETRY_CITATION } from "./orbit";
import type { ClockConfig } from "./three-types";

export interface ThreeView {
  destroy(): void;
}

/** Light/dark material colours, chosen once at init from matchMedia (design
 *  §4.3 — two material sets mirroring the CSS variables). */
function palette(dark: boolean) {
  return dark
    ? { clear: 0x161616, planet: 0x80a8d4, craft: 0xe6e6e6, sun: 0xffcc66, grid: 0x333333, star: 0x888888, marker: 0xffffff }
    : { clear: 0xfafafa, planet: 0x003366, craft: 0x1a1a1a, sun: 0xcc8800, grid: 0xcccccc, star: 0x999999, marker: 0x111111 };
}

export async function mountThreeView(
  host: HTMLElement,
  cfg: ClockConfig,
  _svgId: string,
): Promise<ThreeView> {
  const THREE = (await import("three")) as typeof THREE_NS;
  host.textContent = "";

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const col = palette(dark);

  const width = host.clientWidth || 480;
  const height = host.clientHeight || 480;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(col.clear);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  host.appendChild(renderer.domElement);

  // --- scene contents (all AU world units, all via toThree) -----------------

  // Sun at origin.
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 24, 16),
    new THREE.MeshBasicMaterial({ color: col.sun }),
  );
  scene.add(sun);

  // Sourced planet orbit lines.
  const planetMat = new THREE.LineBasicMaterial({ color: col.planet });
  for (const line of buildOrbitLinePoints(cfg)) {
    const geom = new THREE.BufferGeometry().setFromPoints(
      line.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    scene.add(new THREE.Line(geom, planetMat));
  }

  // Cycler inked trajectory.
  const craftPts = buildCraftPathPoints(cfg);
  const craftGeom = new THREE.BufferGeometry().setFromPoints(
    craftPts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
  );
  scene.add(new THREE.Line(craftGeom, new THREE.LineBasicMaterial({ color: col.craft })));

  // Faint ecliptic grid (orientation aid; helps both orbit- and chase-cam).
  const aphelion = cfg.craft.a * (1 + cfg.craft.e);
  const grid = new THREE.GridHelper(Math.ceil(aphelion * 2) + 2, 12, col.grid, col.grid);
  (grid.material as THREE_NS.Material).opacity = 0.25;
  (grid.material as THREE_NS.Material).transparent = true;
  scene.add(grid);

  // Starfield (a thin shell of points for depth/parallax).
  const starCount = 400;
  const starPos = new Float32Array(starCount * 3);
  const R = aphelion * 8 + 5;
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = R * s * Math.cos(th);
    starPos[i * 3 + 1] = R * u;
    starPos[i * 3 + 2] = R * s * Math.sin(th);
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: col.star, size: R * 0.004 })));

  // Body + spacecraft markers (small spheres). Positions are set in setTime.
  const markerMat = new THREE.MeshBasicMaterial({ color: col.marker });
  const planetMarkers = new Map<string, THREE_NS.Mesh>();
  for (const p of cfg.planets) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), planetMat);
    scene.add(m);
    planetMarkers.set(p.code, m);
  }
  const craftMarker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), markerMat);
  scene.add(craftMarker);

  // Honesty caption overlay (model badge + planet citation + clock label).
  const caption = document.createElement("div");
  caption.className = "orbit-3d-caption";
  caption.textContent = `planets: ${PLANET_GEOMETRY_CITATION}`;
  host.appendChild(caption);

  // --- orbit-cam controller (hand-rolled, damped; reduced-motion = snap) -----
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controls: OrbitControls = makeOrbitControls(camera, cfg, reduced);
  controls.attachPointer(renderer.domElement);

  // Keyboard: arrows orbit, +/- dolly (the full key map lands in Task 1.6).
  const onKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft": controls.stepAzimuth(-1); break;
      case "ArrowRight": controls.stepAzimuth(1); break;
      case "ArrowUp": controls.stepElevation(1); break;
      case "ArrowDown": controls.stepElevation(-1); break;
      case "+": case "=": controls.dolly(1); break;
      case "-": case "_": controls.dolly(-1); break;
      default: return;
    }
    e.preventDefault();
  };
  renderer.domElement.tabIndex = 0;
  renderer.domElement.classList.add("orbit-3d-canvas");
  renderer.domElement.addEventListener("keydown", onKey);

  // Marker placement at the default instant (the shared clock arrives in 1.5).
  const setTime = (t: number) => {
    for (const [code, mesh] of planetMarkers) {
      const el = cfg.planets.find((p) => p.code === code)!.el;
      const w = toThree(stateAt(el, t));
      mesh.position.set(w.x, w.y, w.z);
    }
    const c = toThree(stateAt(cfg.craft, t));
    craftMarker.position.set(c.x, c.y, c.z);
  };
  setTime(cfg.t0);

  // Render loop: ease the camera toward its target each frame, then paint.
  let raf = 0;
  const render = () => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);

  // Resize.
  const onResize = () => {
    const w = host.clientWidth || width;
    const h = host.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  const destroy = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("keydown", onKey);
    controls.detachPointer();
    renderer.dispose();
    scene.traverse((o) => {
      const mesh = o as THREE_NS.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
    renderer.domElement.remove();
    caption.remove();
  };

  // Avoid unused-suppression for PLANETS until markers use it (Task 1.5/1.6
  // labels). Reference it so the import stays meaningful and tree-shake-safe.
  void PLANETS;

  return { destroy };
}
