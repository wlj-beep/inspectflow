import { describe, it, expect } from "vitest";
import {
  nextRevisionCode as sharedNextRevisionCode,
  normalizeRevisionCode,
  revisionCodeToIndex as sharedRevisionCodeToIndex,
  revisionIndexToCode as sharedRevisionIndexToCode
} from "../../frontend/src/shared/utils/revisions.js";
import {
  nextRevisionCode,
  revisionCodeToIndex,
  revisionIndexToCode
} from "../src/revisions.js";

describe("revision code progression", () => {
  it("maps revision code/index values correctly", () => {
    expect(normalizeRevisionCode(" a-1 ")).toBe("A");
    expect(sharedRevisionCodeToIndex("A")).toBe(1);
    expect(sharedRevisionCodeToIndex("Z")).toBe(26);
    expect(sharedRevisionCodeToIndex("AA")).toBe(27);
    expect(sharedRevisionCodeToIndex("AZ")).toBe(52);
    expect(sharedRevisionCodeToIndex("BA")).toBe(53);

    expect(sharedRevisionIndexToCode(1)).toBe("A");
    expect(sharedRevisionIndexToCode(26)).toBe("Z");
    expect(sharedRevisionIndexToCode(27)).toBe("AA");
    expect(sharedRevisionIndexToCode(52)).toBe("AZ");
    expect(sharedRevisionIndexToCode(53)).toBe("BA");
  });

  it("reuses the shared revision helpers from the backend module", () => {
    expect(revisionCodeToIndex).toBe(sharedRevisionCodeToIndex);
    expect(revisionIndexToCode).toBe(sharedRevisionIndexToCode);
    expect(nextRevisionCode).toBe(sharedNextRevisionCode);
  });

  it("advances revision labels across boundaries", () => {
    expect(sharedNextRevisionCode("A")).toBe("B");
    expect(sharedNextRevisionCode("Y")).toBe("Z");
    expect(sharedNextRevisionCode("Z")).toBe("AA");
    expect(sharedNextRevisionCode("AZ")).toBe("BA");
    expect(sharedNextRevisionCode("ZZ")).toBe("AAA");
  });
});
