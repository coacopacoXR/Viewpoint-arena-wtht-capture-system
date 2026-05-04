import { useState, useEffect } from 'react';

export interface UserIdentity {
  name: string;
  color: string;
  team?: string;
  role?: string;
}

const KEY = 'vp_user';

export const AVATAR_COLORS = [
  '#4F8EF7', '#F76B4F', '#4FF7A0', '#F7E24F',
  '#C44FF7', '#F74FA0', '#4FF7F7', '#F7A44F',
];

export function getIdentity(): UserIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name) return null;
    return parsed as UserIdentity;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: UserIdentity): void {
  localStorage.setItem(KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  localStorage.removeItem(KEY);
}

export function useIdentity(): [UserIdentity | null, (i: UserIdentity) => void] {
  const [identity, setIdentityState] = useState<UserIdentity | null>(() => getIdentity());

  function setIdentity(i: UserIdentity) {
    saveIdentity(i);
    setIdentityState(i);
  }

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setIdentityState(getIdentity());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [identity, setIdentity];
}

export function getDisplayName(): string {
  return getIdentity()?.name ?? 'Guest';
}
