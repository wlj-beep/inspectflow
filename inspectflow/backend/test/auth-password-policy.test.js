import { describe, expect, it } from "vitest";
import { makePasswordHash, validatePasswordStrength, verifyPassword } from "../src/auth.js";

describe("auth password policy", () => {
  it("requires 12+ chars with uppercase, number, and special character", () => {
    expect(validatePasswordStrength("Short1!")).toBe("password_min_length_12");
    expect(validatePasswordStrength("longpassword1!")).toBe("password_requires_uppercase");
    expect(validatePasswordStrength("LongPassword!!")).toBe("password_requires_number");
    expect(validatePasswordStrength("LongPassword12")).toBe("password_requires_special");
    expect(validatePasswordStrength("ValidPass1!23")).toBeNull();
  });

  it("uses timing-safe password verification for matches and mismatches", () => {
    const password = "ValidPass1!23";
    const hash = makePasswordHash(password);
    expect(verifyPassword(password, hash.salt, hash.hash)).toBe(true);
    expect(verifyPassword("WrongPass1!23", hash.salt, hash.hash)).toBe(false);
    expect(verifyPassword(password, null, null)).toBe(false);
    expect(verifyPassword(password, hash.salt, "not-a-hex-hash")).toBe(false);
  });
});

