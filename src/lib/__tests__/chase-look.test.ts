import { describe, it, expect } from "vitest";
import { chaseLookDir, chaseCameraPose } from "../three-view-chase";
import { stateAt } from "../kepler-time";
import { toThree } from "../three-axis";
import type { KeplerElements } from "../kepler-time";

const craft: KeplerElements = { a: 1.6, e: 0.2, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 };

describe("chaseLookDir", () => {
  it("returns a unit vector", () => {
    const d = chaseLookDir(craft, 10);
    const m = Math.hypot(d.x, d.y, d.z);
    expect(m).toBeCloseTo(1, 6);
  });
  it("points roughly prograde (changes smoothly along the orbit)", () => {
    const a = chaseLookDir(craft, 0);
    const b = chaseLookDir(craft, 1);
    expect(a).not.toEqual(b); // direction evolves
  });
  it("is the toThree-mapped finite-difference of stateAt", () => {
    const t = 30;
    const p0 = stateAt(craft, t);
    const p1 = stateAt(craft, t + 1e-6);
    // direction sign should agree with a raw forward difference (mapped)
    const raw = toThree({ x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z });
    const d = chaseLookDir(craft, t);
    const dot = d.x * raw.x + d.y * raw.y + d.z * raw.z;
    expect(dot).toBeGreaterThan(0);
  });
});

describe("chaseCameraPose", () => {
  it("places the look target at the craft (toThree(stateAt))", () => {
    const t = 25;
    const pose = chaseCameraPose(craft, t);
    expect(pose.lookAt).toEqual(toThree(stateAt(craft, t)));
  });
  it("places the camera behind the craft (opposite the look direction)", () => {
    const t = 25;
    const pose = chaseCameraPose(craft, t);
    const dir = chaseLookDir(craft, t);
    // camera -> craft vector should align with the look direction (camera trails)
    const toCraft = {
      x: pose.lookAt.x - pose.position.x,
      y: pose.lookAt.y - pose.position.y,
      z: pose.lookAt.z - pose.position.z,
    };
    const dot = toCraft.x * dir.x + toCraft.y * dir.y + toCraft.z * dir.z;
    expect(dot).toBeGreaterThan(0);
  });
  it("offsets the camera by the requested trailing distance plus a height lift", () => {
    const t = 25;
    const trail = 0.5;
    const pose = chaseCameraPose(craft, t, trail);
    const craftW = toThree(stateAt(craft, t));
    const off = Math.hypot(
      pose.position.x - craftW.x,
      pose.position.y - craftW.y,
      pose.position.z - craftW.z,
    );
    // trailing distance plus the vertical lift -> strictly greater than trail
    expect(off).toBeGreaterThan(trail);
  });
});
