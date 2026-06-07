// Hand-rolled damped spherical orbit controls for the viz-2b orbit-cam (viz
// phase 2b, plan Task 1.4). NOT three/examples OrbitControls — hand-rolled to
// keep the lazy chunk small (design §4.1). Spherical (radius, azimuth,
// elevation) about the system centroid (the origin), critically-damped easing
// toward target angles/radius. Pointer-drag -> az/el, wheel -> radius; the
// keyboard bindings (arrows orbit, +/- dolly) are wired by three-view.ts which
// calls the step* methods here so every pointer action has a key equivalent.
//
// Under reduced-motion the easing is disabled (poses snap): three-view passes
// `snap: true` so no transition animates.

import type * as THREE_NS from "three";
import { frameRadiusAU, cameraPoseFromSpherical } from "./three-controls-math";
import type { ClockConfig } from "./three-types";

const MIN_EL = -Math.PI / 2 + 0.05;
const MAX_EL = Math.PI / 2 - 0.001;
const AZ_STEP = Math.PI / 18; // 10 deg per key/drag-tick
const EL_STEP = Math.PI / 24;
const DOLLY = 1.12; // multiplicative zoom per key/wheel step

export interface OrbitControls {
  update(): void; // call each frame; eases current -> target
  stepAzimuth(sign: number): void;
  stepElevation(sign: number): void;
  dolly(sign: number): void; // +1 in, -1 out
  attachPointer(el: HTMLElement): void;
  detachPointer(): void;
}

export function makeOrbitControls(
  camera: THREE_NS.PerspectiveCamera,
  cfg: ClockConfig,
  snap: boolean,
): OrbitControls {
  let radius = frameRadiusAU(cfg);
  let azimuth = 0;
  let elevation = Math.PI / 2 - 0.35; // a near-top-down opening pose with a hint of depth
  let tRadius = radius;
  let tAz = azimuth;
  let tEl = elevation;
  const minR = radius * 0.15;
  const maxR = radius * 4;

  const apply = (r: number, az: number, el: number) => {
    const p = cameraPoseFromSpherical(r, az, el);
    camera.position.set(p.x, p.y, p.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
  };
  apply(radius, azimuth, elevation);

  const clampEl = (e: number) => Math.max(MIN_EL, Math.min(MAX_EL, e));
  const clampR = (r: number) => Math.max(minR, Math.min(maxR, r));

  const update = () => {
    if (snap) {
      radius = tRadius;
      azimuth = tAz;
      elevation = tEl;
    } else {
      const k = 0.18; // critical-ish damping factor toward the target
      radius += (tRadius - radius) * k;
      azimuth += (tAz - azimuth) * k;
      elevation += (tEl - elevation) * k;
    }
    apply(radius, azimuth, elevation);
  };

  const stepAzimuth = (sign: number) => {
    tAz += sign * AZ_STEP;
  };
  const stepElevation = (sign: number) => {
    tEl = clampEl(tEl + sign * EL_STEP);
  };
  const dolly = (sign: number) => {
    tRadius = clampR(sign > 0 ? tRadius / DOLLY : tRadius * DOLLY);
  };

  // --- pointer (mirrors the keys) -------------------------------------------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointerEl: HTMLElement | null = null;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    pointerEl?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    tAz += dx * 0.005;
    tEl = clampEl(tEl - dy * 0.005);
  };
  const onUp = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    dolly(e.deltaY < 0 ? 1 : -1);
  };

  const attachPointer = (el: HTMLElement) => {
    pointerEl = el;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
  };
  const detachPointer = () => {
    const el = pointerEl;
    if (!el) return;
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    pointerEl = null;
  };

  return { update, stepAzimuth, stepElevation, dolly, attachPointer, detachPointer };
}
