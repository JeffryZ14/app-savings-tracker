import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, sha256HexLegacy } from "@/lib/usePinLock";

describe("hashPin / verifyPin (PBKDF2 + sal)", () => {
  it("un hash nuevo verifica con el PIN correcto y rechaza uno incorrecto", async () => {
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash)).toBe(true);
    expect(await verifyPin("9999", hash)).toBe(false);
  });

  it("dos hashes del mismo PIN son distintos (sal aleatoria)", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).not.toBe(b);
  });

  it("el formato es pbkdf2$iteraciones$saltHex$hashHex", async () => {
    const hash = await hashPin("1234");
    const parts = hash.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2");
    expect(Number(parts[1])).toBeGreaterThan(0);
  });

  it("acepta el formato legado (SHA-256 sin sal) para no romper PIN existentes", async () => {
    const legacy = await sha256HexLegacy("5678");
    expect(await verifyPin("5678", legacy)).toBe(true);
    expect(await verifyPin("0000", legacy)).toBe(false);
  });
});
