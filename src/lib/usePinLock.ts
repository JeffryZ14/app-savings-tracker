"use client";

import { useEffect, useState, useCallback } from "react";

const PIN_HASH_KEY = "appPinHash";
const SESSION_OK_KEY = "pinSessionOk";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UsePinLockResult {
  ready: boolean;
  hasPin: boolean;
  locked: boolean;
  unlock: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  removePin: (pin: string) => Promise<boolean>;
}

// Candado local por dispositivo — NO es autenticación real (la app sigue sin auth de
// servidor, ver CLAUDE.md). Solo bloquea la UI del navegador actual para evitar que
// alguien que tome el teléfono/laptop desbloqueado vea las metas a simple vista.
// El hash vive en localStorage (persiste); el desbloqueo vive en sessionStorage
// (se re-pide en cada pestaña/sesión nueva del navegador).
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
      const hash = await sha256Hex(pin);
      if (stored && hash === stored) {
        sessionStorage.setItem(SESSION_OK_KEY, "1");
        setLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const setPin = useCallback(async (pin: string) => {
    const hash = await sha256Hex(pin);
    localStorage.setItem(PIN_HASH_KEY, hash);
    sessionStorage.setItem(SESSION_OK_KEY, "1");
    setHasPin(true);
    setLocked(false);
  }, []);

  const removePin = useCallback(async (pin: string) => {
    try {
      const stored = localStorage.getItem(PIN_HASH_KEY);
      const hash = await sha256Hex(pin);
      if (stored && hash === stored) {
        localStorage.removeItem(PIN_HASH_KEY);
        sessionStorage.removeItem(SESSION_OK_KEY);
        setHasPin(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { ready, hasPin, locked, unlock, setPin, removePin };
}
