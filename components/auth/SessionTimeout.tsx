"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const INACTIVITY_LIMIT_MS = 20 * 60 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 1000;
const LAST_ACTIVITY_KEY = "belglow-auth-last-activity";
const ACTIVITY_USER_KEY = "belglow-auth-activity-user";
const SESSION_EXPIRED_KEY = "belglow-auth-session-expired";
const SESSION_EXPIRED_PARAM = "sessionExpired";

function storedActivityFor(userId: string) {
  if (window.localStorage.getItem(ACTIVITY_USER_KEY) !== userId) return null;
  const timestamp = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export default function SessionTimeout() {
  const [showExpiredNotice, setShowExpiredNotice] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(0);
  const lastWrittenAtRef = useRef(0);
  const signingOutRef = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(SESSION_EXPIRED_PARAM) !== "true") return;

    url.searchParams.delete(SESSION_EXPIRED_PARAM);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const showTimer = window.setTimeout(() => setShowExpiredNotice(true), 0);
    const hideTimer = window.setTimeout(() => setShowExpiredNotice(false), 6500);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    function clearTimer() {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    function clearActivity() {
      clearTimer();
      userIdRef.current = null;
      lastActivityAtRef.current = 0;
      lastWrittenAtRef.current = 0;
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      window.localStorage.removeItem(ACTIVITY_USER_KEY);
    }

    async function expireSession() {
      if (!userIdRef.current || signingOutRef.current) return;
      signingOutRef.current = true;
      clearTimer();
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      window.localStorage.removeItem(ACTIVITY_USER_KEY);

      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        window.localStorage.setItem(SESSION_EXPIRED_KEY, String(Date.now()));
        window.location.replace(`/?${SESSION_EXPIRED_PARAM}=true`);
      }
    }

    function scheduleExpiry(lastActivity: number) {
      clearTimer();
      if (!userIdRef.current) return;

      const remaining = INACTIVITY_LIMIT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) {
        void expireSession();
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        const userId = userIdRef.current;
        if (!userId) return;
        const latestActivity = Math.max(storedActivityFor(userId) ?? 0, lastActivityAtRef.current, lastActivity);
        scheduleExpiry(latestActivity);
      }, remaining);
    }

    function startTracking(userId: string) {
      signingOutRef.current = false;
      userIdRef.current = userId;
      const storedActivity = storedActivityFor(userId);
      const lastActivity = storedActivity ?? Date.now();
      lastActivityAtRef.current = lastActivity;

      if (storedActivity === null) {
        window.localStorage.setItem(ACTIVITY_USER_KEY, userId);
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivity));
        lastWrittenAtRef.current = lastActivity;
      }

      scheduleExpiry(lastActivity);
    }

    function recordActivity() {
      const userId = userIdRef.current;
      if (!userId || signingOutRef.current) return;

      const now = Date.now();
      lastActivityAtRef.current = now;
      scheduleExpiry(now);
      if (now - lastWrittenAtRef.current < ACTIVITY_WRITE_INTERVAL_MS) return;

      lastWrittenAtRef.current = now;
      window.localStorage.setItem(ACTIVITY_USER_KEY, userId);
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }

    function checkCurrentActivity() {
      const userId = userIdRef.current;
      if (!userId) return;
      const latestActivity = Math.max(storedActivityFor(userId) ?? 0, lastActivityAtRef.current);
      scheduleExpiry(latestActivity);
    }

    function syncActivity(event: StorageEvent) {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue && userIdRef.current) {
        const timestamp = Number(event.newValue);
        if (Number.isFinite(timestamp)) {
          lastActivityAtRef.current = Math.max(lastActivityAtRef.current, timestamp);
          scheduleExpiry(lastActivityAtRef.current);
        }
      }
      if (event.key === SESSION_EXPIRED_KEY && event.newValue) {
        window.location.replace(`/?${SESSION_EXPIRED_PARAM}=true`);
      }
    }

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    window.addEventListener("focus", checkCurrentActivity);
    window.addEventListener("storage", syncActivity);
    document.addEventListener("visibilitychange", checkCurrentActivity);

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) startTracking(session.user.id);
      else clearActivity();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) startTracking(session.user.id);
      else clearActivity();
    });

    return () => {
      active = false;
      clearTimer();
      subscription.unsubscribe();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.removeEventListener("focus", checkCurrentActivity);
      window.removeEventListener("storage", syncActivity);
      document.removeEventListener("visibilitychange", checkCurrentActivity);
    };
  }, []);

  if (!showExpiredNotice) return null;

  return <div role="status" className="fixed bottom-6 left-1/2 z-[110] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-2xl bg-[#241a1e] px-5 py-4 text-center text-sm font-semibold text-white shadow-xl">
    You were signed out after 20 minutes of inactivity. Please sign in again to continue.
  </div>;
}
