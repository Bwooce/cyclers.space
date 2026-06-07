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
import type { Vec3 } from "./kepler-time";
import { stateAt, distance } from "./kepler-time";
import { sampledStateAt } from "./three-clock-sampled";
import { markerWorldPos, defaultStartTime } from "./three-clock";
import { toThree } from "./three-axis";
import { buildOrbitLinePoints, buildCraftPathPoints, buildSampledPathPoints } from "./three-geometry";
import { makeOrbitControls, type OrbitControls } from "./three-controls";
import { chaseCameraPose } from "./three-view-chase";
import { tourKeyframes, type TourKeyframe } from "./three-tour";
import { PLANETS } from "./orbit";
import { captionLines } from "./three-caption";
import type { ClockConfig } from "./three-types";

const AU_KM = 149_597_870.7;

/** The keyboard binding table (design §4.3), surfaced in the `?` overlay. */
const KEY_HELP: [string, string][] = [
  ["arrows", "orbit the camera (azimuth / elevation)"],
  ["+ / -", "dolly in / out"],
  ["[ / ]", "step time backward / forward"],
  ["Space", "play / pause (inert under reduced-motion)"],
  ["1", "orbit-cam (look down on the system)"],
  ["2", "chase-cam (ride the spacecraft; disabled under reduced-motion)"],
  ["T", "guided tour (departure -> flyby -> aphelion -> return; [ / ] step beats under reduced-motion)"],
  ["?", "toggle this help"],
  ["Esc", "exit 3D, return to the 2D view"],
];

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
  svgId: string,
): Promise<ThreeView> {
  const THREE = (await import("three")) as typeof THREE_NS;
  host.textContent = "";

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const col = palette(dark);

  // viz-2c: the craft can be described two ways — the analytic Kepler ellipse
  // (cfg.craft, the 2b default) or a numerically-sampled polyline
  // (cfg.craftSampled). craftPosAt is the ONE craft-position rule the marker and
  // the proximity readout key off, mirroring how the SVG island keys off a
  // single stateAt; it interpolates the sampled source when present, else solves
  // Kepler. The camera framing (chase/tour) stays on cfg.craft, which remains
  // populated as the time-base/aphelion fallback.
  const sampled = cfg.craftSampled;
  const craftPosAt = (tDay: number): Vec3 =>
    sampled ? sampledStateAt(sampled, tDay) : stateAt(cfg.craft, tDay);
  const craftWorldAt = (tDay: number): Vec3 => toThree(craftPosAt(tDay));

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

  // Cycler inked trajectory. From the sampled polyline when present (the
  // integrator's own samples, per-point through toThree), else the analytic
  // samplePath. Either way it is a Three.Line of the SAME craft curve.
  const craftPts = sampled ? buildSampledPathPoints(sampled) : buildCraftPathPoints(cfg);
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

  // Honesty caption overlay (design §5, viz-2c binding): PER-CURVE fidelity —
  // captionLines names the craft's own model (analytic badge, or "craft:
  // sampled (...)" + provenance for a sampled row) and ALWAYS states the planets
  // are Standish osculating ellipses, plus the clock regime + encounter-marker
  // provenance. So 3D never claims more fidelity than the data, and a sampled
  // craft can never be read as implying the planets are sampled too.
  const caption = document.createElement("div");
  caption.className = "orbit-3d-caption";
  caption.textContent = captionLines(cfg).join("\n");
  host.appendChild(caption);

  // On-canvas key-help overlay (toggled by `?`), listing the binding table.
  const keyHelp = document.createElement("div");
  keyHelp.className = "orbit-3d-keyhelp";
  keyHelp.hidden = true;
  keyHelp.innerHTML =
    "<strong>Keyboard</strong>" +
    KEY_HELP.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  host.appendChild(keyHelp);

  // --- orbit-cam controller (hand-rolled, damped; reduced-motion = snap) -----
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controls: OrbitControls = makeOrbitControls(camera, cfg, reduced);
  controls.attachPointer(renderer.domElement);

  // --- camera mode (Slice 2): "orbit" (default) or "chase" ------------------
  // Chase-cam rides the spacecraft and looks along its velocity (a finite-diff
  // of stateAt, design §4.2). Under reduced-motion chase-cam is DISABLED (the
  // motion-sickness guard) — key `2` is ignored and we announce it. The chase
  // pose is applied each frame in the render loop; switching back to `1` hands
  // the orbit controller back. The trailing distance is framed off the craft's
  // own aphelion so the camera sits a sensible distance behind.
  type CamMode = "orbit" | "chase" | "tour";
  let mode: CamMode = "orbit";
  const chaseTrail = Math.max(0.25, cfg.craft.a * (1 + cfg.craft.e) * 0.18);
  // Damped look-at so the craft motion does not snap the gaze (skipped on
  // reduced-motion, though chase is itself disabled there).
  const lookEased = { x: 0, y: 0, z: 0 };
  let lookInit = false;
  // Sampled-craft chase pose: ride the SAME sampled position the marker uses
  // (so the camera does not drift off the drawn curve), looking along a
  // finite-diff of the sampled positions. Analytic rows keep the closed-form
  // chaseCameraPose. The trailing offset + lift mirror the analytic helper.
  const sampledChasePose = () => {
    const span = cfg.t1 - cfg.t0 || 1;
    const dt = span / 4000;
    const lookAt = craftWorldAt(t);
    const ahead = craftWorldAt(t + dt);
    let vx = ahead.x - lookAt.x;
    let vy = ahead.y - lookAt.y;
    let vz = ahead.z - lookAt.z;
    const m = Math.hypot(vx, vy, vz) || 1;
    vx /= m; vy /= m; vz /= m;
    const lift = chaseTrail * 0.35;
    return {
      position: { x: lookAt.x - vx * chaseTrail, y: lookAt.y - vy * chaseTrail + lift, z: lookAt.z - vz * chaseTrail },
      lookAt,
    };
  };
  const applyChase = () => {
    const pose = sampled ? sampledChasePose() : chaseCameraPose(cfg.craft, t, chaseTrail);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.up.set(0, 1, 0);
    if (!lookInit) {
      lookEased.x = pose.lookAt.x;
      lookEased.y = pose.lookAt.y;
      lookEased.z = pose.lookAt.z;
      lookInit = true;
    } else {
      const k = reduced ? 1 : 0.25;
      lookEased.x += (pose.lookAt.x - lookEased.x) * k;
      lookEased.y += (pose.lookAt.y - lookEased.y) * k;
      lookEased.z += (pose.lookAt.z - lookEased.z) * k;
    }
    camera.lookAt(lookEased.x, lookEased.y, lookEased.z);
  };

  // --- guided tour (Slice 3): geometry-derived keyframes --------------------
  // `T` flies the camera over the didactic beats (departure -> flyby ->
  // aphelion -> return), each keyframe DERIVED from the geometry by tourKeyframes
  // (no per-row authoring). Continuous lerp drives both the camera pose AND the
  // clock t between keyframes, narrating each beat in the live region. ANY user
  // input cancels immediately and returns control to orbit-cam. Under
  // reduced-motion the tour does NOT autoplay: it arms a stepped fallback where
  // [ / ] jump-cut between keyframes with snapped poses (design §4.3).
  const tourFrames: TourKeyframe[] = tourKeyframes(cfg);
  let tourSeg = 0; // index of the keyframe we are travelling FROM
  let tourPhase = 0; // 0..1 progress within the current segment
  let tourBeatAnnounced = -1; // last beat index narrated (avoid repeats)
  const TOUR_SEG_MS = 4500; // wall-time per segment when animating

  const announceBeat = (i: number) => {
    const kf = tourFrames[i];
    if (!kf || tourBeatAnnounced === i) return;
    tourBeatAnnounced = i;
    const prox = lastNearestText ? ` ${lastNearestText}` : "";
    announce(`Tour beat ${i + 1} of ${tourFrames.length}: ${kf.caption}${prox}`);
  };

  // Place the camera at a tour pose (snap), set the clock to its instant.
  const applyTourPose = (pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }) => {
    camera.up.set(0, 1, 0);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(look.x, look.y, look.z);
  };

  // Continuous tour step (animated path): advance tourPhase by dt, lerp pose +
  // clock between keyframe tourSeg and tourSeg+1; end -> return to orbit-cam.
  const applyTour = (dtMs: number) => {
    if (tourFrames.length < 2) {
      endTour("ended");
      return;
    }
    announceBeat(tourSeg);
    const a = tourFrames[tourSeg]!;
    const b = tourFrames[tourSeg + 1]!;
    tourPhase += dtMs / TOUR_SEG_MS;
    if (tourPhase >= 1) {
      tourPhase = 0;
      tourSeg += 1;
      if (tourSeg >= tourFrames.length - 1) {
        // settle on the final beat, narrate it, then end.
        const last = tourFrames[tourFrames.length - 1]!;
        applyTourPose(last.pose.position, last.pose.lookAt);
        setTime(last.t);
        broadcast();
        announceBeat(tourFrames.length - 1);
        endTour("ended");
        return;
      }
      announceBeat(tourSeg);
      return;
    }
    const s = tourPhase;
    const lerp = (x: number, y: number) => x + (y - x) * s;
    applyTourPose(
      { x: lerp(a.pose.position.x, b.pose.position.x), y: lerp(a.pose.position.y, b.pose.position.y), z: lerp(a.pose.position.z, b.pose.position.z) },
      { x: lerp(a.pose.lookAt.x, b.pose.lookAt.x), y: lerp(a.pose.lookAt.y, b.pose.lookAt.y), z: lerp(a.pose.lookAt.z, b.pose.lookAt.z) },
    );
    setTime(lerp(a.t, b.t));
    broadcast();
  };

  // Reduced-motion stepped fallback: jump-cut to a specific keyframe (snap pose
  // + clock), no continuous motion.
  const tourJumpTo = (i: number) => {
    const idx = Math.max(0, Math.min(tourFrames.length - 1, i));
    tourSeg = idx;
    const kf = tourFrames[idx]!;
    applyTourPose(kf.pose.position, kf.pose.lookAt);
    setTime(kf.t);
    broadcast();
    announceBeat(idx);
  };

  function startTour() {
    if (tourFrames.length < 2) {
      announce("No guided tour available for this trajectory.");
      return;
    }
    mode = "tour";
    tourSeg = 0;
    tourPhase = 0;
    tourBeatAnnounced = -1;
    playing = false; // the tour drives the clock itself
    if (reduced) {
      announce("Guided tour requires motion — stepped fallback. Use [ and ] to jump between beats; any other key exits.");
      tourJumpTo(0);
    } else {
      announce("Guided tour: departure, flyby, aphelion, return. Any key exits.");
    }
  }

  function endTour(why: "ended" | "cancelled") {
    if (mode !== "tour") return;
    mode = "orbit";
    announce(why === "ended" ? "Tour ended; returned to orbit-cam." : "Tour cancelled; returned to orbit-cam.");
  }

  // --- the shared clock (one clock, two renderers) --------------------------
  // The 3D view opens PAUSED at the first encounter (design §4.2). Stepping time
  // here dispatches an "orbit-time" CustomEvent on the host so the 2a SVG island
  // moves its craft/planet markers together, and we listen for the same event so
  // SVG scrubbing moves the 3D markers — switching renderers continues the same
  // instant. A re-entrancy guard stops the event ping-ponging.
  const span = cfg.t1 - cfg.t0 || 1;
  const STEP = span / 60; // one [ / ] press = ~1/60 of the period
  let t = defaultStartTime(cfg);
  let syncing = false;

  // Off-canvas live region (design §4.3): announces mode + nearest-body
  // proximity so a screen-reader user gets the narrative the canvas can't carry.
  const live = document.querySelector<HTMLElement>(`[data-orbit-3d-live="${svgId}"]`);
  let lastAnnounce = "";
  const announce = (msg: string) => {
    if (live && msg !== lastAnnounce) {
      live.textContent = msg;
      lastAnnounce = msg;
    }
  };
  const planetName = (code: string) => PLANETS[code]?.name ?? code;
  let lastNearestText = ""; // most recent proximity readout (folded into tour narration)

  const setTime = (next: number) => {
    t = next;
    let nearest: { code: string; d: number } | null = null;
    // Craft position comes from the sampled clock when present, else Kepler;
    // proximity is therefore measured from the SAME sampled positions the marker
    // and the line draw (the proximity indicator stays honest to the curve).
    const craftState = craftPosAt(t);
    for (const [code, mesh] of planetMarkers) {
      const el = cfg.planets.find((p) => p.code === code)!.el;
      const w = markerWorldPos(el, t);
      mesh.position.set(w.x, w.y, w.z);
      if (cfg.bodies.includes(code)) {
        const d = distance(craftState, stateAt(el, t));
        if (!nearest || d < nearest.d) nearest = { code, d };
      }
    }
    const c = craftWorldAt(t);
    craftMarker.position.set(c.x, c.y, c.z);
    if (nearest) {
      const d = nearest.d;
      const txt = d < 0.01 ? `${(d * AU_KM).toFixed(0)} km` : `${d.toFixed(3)} AU`;
      lastNearestText = `Nearest: ${planetName(nearest.code)}, ${txt}.`;
      // During a tour the beat narration owns the live region (it folds in the
      // proximity below); the per-frame proximity must not clobber the caption.
      if (mode !== "tour") {
        const modeLabel = mode === "chase" ? "Chase-cam" : "Orbit-cam";
        announce(`${modeLabel}. ${lastNearestText}`);
      }
    }
  };

  const broadcast = () => {
    if (syncing) return;
    host.dispatchEvent(new CustomEvent("orbit-time", { detail: { t } }));
  };
  const onExternalTime = (e: Event) => {
    const detail = (e as CustomEvent).detail as { t?: number } | undefined;
    if (!detail || typeof detail.t !== "number") return;
    syncing = true;
    setTime(detail.t);
    syncing = false;
  };
  host.addEventListener("orbit-time", onExternalTime);

  setTime(t);

  // play/pause (only when not reduced-motion); under reduced-motion Space is
  // inert and [/] step (design §4.3).
  let playing = false;
  let lastNow = 0;
  const stepTime = (sign: number) => {
    setTime(t + sign * STEP);
    broadcast();
  };

  const toggleHelp = () => {
    keyHelp.hidden = !keyHelp.hidden;
    announce(keyHelp.hidden ? "Key help hidden." : "Key help shown.");
  };

  // Keyboard (design §4.3): arrows orbit, +/- dolly, [ / ] step time, Space
  // play/pause (inert under reduced-motion), 1 = orbit-cam (the only Slice-1
  // mode), ? = key help, Esc = exit to the 2D SVG.
  const onKey = (e: KeyboardEvent) => {
    // While the tour runs, ANY user input cancels and returns control to
    // orbit-cam (design Slice-3 rule), with two exceptions: Esc exits 3D
    // entirely, and under reduced-motion [ / ] jump-cut between beats (the
    // stepped fallback). Everything else cancels the tour.
    if (mode === "tour") {
      if (e.key === "Escape") { closeView(); e.preventDefault(); return; }
      if (reduced && e.key === "]") { tourJumpTo(tourSeg + 1); e.preventDefault(); return; }
      if (reduced && e.key === "[") { tourJumpTo(tourSeg - 1); e.preventDefault(); return; }
      endTour("cancelled");
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case "ArrowLeft": controls.stepAzimuth(-1); break;
      case "ArrowRight": controls.stepAzimuth(1); break;
      case "ArrowUp": controls.stepElevation(1); break;
      case "ArrowDown": controls.stepElevation(-1); break;
      case "+": case "=": controls.dolly(1); break;
      case "-": case "_": controls.dolly(-1); break;
      case "[": stepTime(-1); break;
      case "]": stepTime(1); break;
      case " ":
        if (reduced) announce("Manual step only under reduced-motion; use [ and ] to step time.");
        else { playing = !playing; announce(playing ? "Playing." : "Paused."); }
        break;
      case "1":
        mode = "orbit";
        announce("Orbit-cam.");
        break;
      case "2":
        if (reduced) {
          announce("Chase-cam disabled under reduced-motion; staying in orbit-cam.");
        } else if (mode !== "chase") {
          mode = "chase";
          lookInit = false;
          announce("Chase-cam: riding the spacecraft, looking along its velocity.");
        }
        break;
      case "T": case "t": startTour(); break;
      case "?": toggleHelp(); break;
      case "Escape": closeView(); break;
      default: return;
    }
    e.preventDefault();
  };
  renderer.domElement.tabIndex = 0;
  renderer.domElement.classList.add("orbit-3d-canvas");
  renderer.domElement.setAttribute("role", "application");
  renderer.domElement.setAttribute(
    "aria-label",
    "3D orbit camera. Arrow keys orbit, plus and minus dolly, brackets step time, 1 for orbit-cam, 2 for chase-cam, T for guided tour, question mark for help, Escape to exit.",
  );
  renderer.domElement.addEventListener("keydown", onKey);
  // Move focus into the canvas on open; announce entry + reduced-motion state.
  renderer.domElement.focus();
  announce(
    reduced
      ? "Entered 3D orbit-cam, paused at the first encounter. Reduced-motion: manual step with [ and ]."
      : "Entered 3D orbit-cam, paused at the first encounter.",
  );

  // Render loop: ease the camera, advance the clock if playing, then paint.
  let raf = 0;
  let lastFrame = 0; // wall-clock of the previous frame (for the tour lerp)
  const render = (now: number) => {
    const frameDt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (mode === "tour" && !reduced) {
      // The tour drives both the camera pose and the clock itself; ordinary
      // play/pause is suspended while it runs.
      applyTour(frameDt);
      lastNow = 0;
    } else if (playing && !reduced) {
      if (!lastNow) lastNow = now;
      const dtMs = now - lastNow;
      lastNow = now;
      // ~one period per 18 s of wall time (Kepler-true: aphelion visibly slow).
      let next = t + (span * dtMs) / 18000;
      if (next > cfg.t1) next = cfg.t0 + ((next - cfg.t0) % span);
      setTime(next);
      broadcast();
    } else {
      lastNow = 0;
    }
    // Orbit-cam runs the hand-rolled spherical controller; chase-cam rides the
    // craft (pose recomputed each frame so Earth/Mars sweep past as flyby
    // geometry); the tour (above) has already set the camera pose. All three end
    // with the same render call.
    if (mode === "chase") {
      applyChase();
    } else if (mode === "orbit") {
      controls.update();
    }
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
    host.removeEventListener("orbit-time", onExternalTime);
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
    keyHelp.remove();
  };

  // Esc exit (design §4.3): tear down WebGL, hide the host, and return focus to
  // the 2D SVG (the accessible source of truth). A "Close 3D" button click could
  // call the same path; the SVG is always the floor.
  function closeView() {
    destroy();
    host.hidden = true;
    if (live) live.textContent = "Exited 3D; returned to the 2D view.";
    const svg = document.getElementById(svgId);
    if (svg) {
      svg.setAttribute("tabindex", "-1");
      (svg as unknown as HTMLElement).focus();
    }
  }

  return { destroy };
}
