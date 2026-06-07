import { describe, it, expect } from "vitest";
import { toThree } from "../three-axis";
import type { Vec3 } from "../kepler-time";

describe("toThree axis convention (ecliptic z=0 -> Three ground plane XZ)", () => {
  it("maps ecliptic north (+z) to Three up (+y)", () => {
    const v: Vec3 = { x: 0, y: 0, z: 1 };
    expect(toThree(v)).toEqual({ x: 0, y: 1, z: 0 });
  });
  it("maps ecliptic +x to Three +x", () => {
    expect(toThree({ x: 2, y: 0, z: 0 })).toEqual({ x: 2, y: 0, z: 0 });
  });
  it("maps ecliptic +y to Three -z (right-handed)", () => {
    expect(toThree({ x: 0, y: 3, z: 0 })).toEqual({ x: 0, y: 0, z: -3 });
  });
});
