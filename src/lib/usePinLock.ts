"use client";

import { useEffect, useState, useCallback } from "react";

const PIN_HASH_KEY = "appPinHash";
const SESSION_OK_KEY = "pinSessionOk";

// Formato nuevo: "pbkdf2$<iteraciones>$<saltHex>$<hashHex>". PBKDF2-SHA256 con sal aleatoria
// por PIN, en línea con la recomendación de OWASP para hashing de baja entropía como un PIN
// numérico corto. El formato legado (SHA-256 plano sin sal, sin el prefijo "pbkdf2$") se
// sigue aceptando al desbloquear para no invalidar los PIN ya guardados en localStorage de
// instalaciones existentes; se migra de forma transparente al formato nuevo en el primer
// desbloqueo exitoso.
const PBKDF2_PREFIX = "pbkdf2";
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;

function toHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256HexLegacy(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(buf);
}

async function derivePbkdf2Hex(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePbkdf2Hex(pin, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PBKDF2_PREFIX + "$")) {
    const [, iterStr, saltHex, hashHex] = stored.split("$");
    const iterations = parseInt(iterStr, 10);
    if (!iterations || !saltHex || !hashHex) return false;
    const candidate = await derivePbkdf2Hex(pin, fromHex(saltHex), iterations);
    return candidate === hashHex;
  }
  // Formato legado (instalaciones existentes): SHA-256 sin sal.
  return (await sha256HexLegacy(pin)) === stored;
}

// Exportadas solo para pruebas unitarias del esquema de hashing (no forman parte de la API
// pública del hook).
export { hashPin, verifyPin, sha256HexLegacy };

export interface UsePinLockResult {
  ready: boolean;
  hasPin: boolean;
  locked: boolean;
  unlock: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  removePin: (pin: string) => Promise<boolean>;
}

// Candado local por dispositivo — NO es autenticación real (la app sigue sin auth de
// servidor por defecto; ver APP_ACCESS_PASSWORD en middleware.ts y CLAUDE.md). Solo bloquea
// la UI del navegador actual para evitar que alguien que tome el teléfono/laptop desbloqueado
// vea las metas a simple vista. El hash vive en localStorage (persiste); el desbloqueo vive
// en sessionStorage (se re-pide en cada pestaña/sesión nueva del navegador).
export function usePinLock(): UsePinLockResult {
  const [ready, setReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PIN_HASH_KEY);
      const sessionOk = sessionStorage.getItem(SESSION_OK_KEY) === "1";
      setHasPin(!!stored);
      setLocked(!!stored && !sessionOk);
    } catch {}
    setReady(true);
  }, []);

  const unlock = useCallback(async (pin: string) => {
    try {
      const stored = localStorage.getItem(PIN_HASH_KEY);
      if (!stored) return false;
      const ok = await verifyPin(pin, stored);
      if (!ok) return false;

      // Migración transparente: si el hash guardado era el formato legado (sin sal),
      // lo reemplazamos por el nuevo PBKDF2+sal ahora que confirmamos el PIN correcto.
      if (!stored.startsWith(PBKDF2_PREFIX + "$")) {
        try {
          localStorage.setItem(PIN_HASH_KEY, await hashPin(pin));
        } catch {}
      }

      sessionStorage.setItem(SESSION_OK_KEY, "1");
      setLocked(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const setPin = useCallback(async (pin: string) => {
    localStorage.setItem(PIN_HASH_KEY, await hashPin(pin));
    sessionStorage.setItem(SESSION_OK_KEY, "1");
    setHasPin(true);
    setLocked(false);
  }, []);

  const removePin = useCallback(async (pin: string) => {
    try {
      const stored = localStorage.getItem(PIN_HASH_KEY);
      if (!stored) return false;
      const ok = await verifyPin(pin, stored);
      if (!ok) return false;
      localStorage.removeItem(PIN_HASH_KEY);
      sessionStorage.removeItem(SESSION_OK_KEY);
      setHasPin(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { ready, hasPin, locked, unlock, setPin, removePin };
}
