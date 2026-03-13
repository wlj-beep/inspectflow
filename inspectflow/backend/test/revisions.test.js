import { describe, it, expect } from "vitest";
import { nextRevisionCode, revisionCodeToIndex, revisionIndexToCode } from "../src/revisions.js";

describe("revision code progression", () => {
  it("maps revision code/index values correctly", () => {
    expect(revisionCodeToIndex("A")).toBe(1);
    expect(revisionCodeToIndex("Z")).toBe(26);
    expect(revisionCodeToIndex("AA")).toBe(27);
    expect(revisionCodeToIndex("AZ")).toBe(52);
    expect(revisionCodeToIndex("BA")).toBe(53);

    expect(revisionIndexToCode(1)).toBe("A");
    expect(revisionIndexToCode(26)).toBe("Z");
    expect(revisionIndexToCode(27)).toBe("AA");
    expect(revisionIndexToCode(52)).toBe("AZ");
    expect(revisionIndexToCode(53)).toBe("BA");
  });

  it("advances revision labels across boundaries", () => {
    expect(nextRevisionCode("A")).toBe("B");
    expect(nextRevisionCode("Y")).toBe("Z");
    expect(nextRevisionCode("Z")).toBe("AA");
    expect(nextRevisionCode("AZ")).toBe("BA");
    expect(nextRevisionCode("ZZ")).toBe("AAA");
  });
});
