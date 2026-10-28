"use client";

import { Download, Share2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const PROMPT_SHOWN_KEY = "belglow-pwa-install-prompt-shown";

export default function PwaManager() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }

    function captureInstall(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => window.removeEventListener("beforeinstallprompt", captureInstall);
  }, []);

  useEffect(() => {
    if (pathname !== "/" || window.localStorage.getItem(PROMPT_SHOWN_KEY)) return;

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!appleMobile && !installEvent) return;

    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(PROMPT_SHOWN_KEY)) return;
      window.localStorage.setItem(PROMPT_SHOWN_KEY, "true");
      setIsIOS(appleMobile);
      setVisible(true);
    }, appleMobile ? 2500 : 0);

    return () => window.clearTimeout(timer);
  }, [installEvent, pathname]);

  useEffect(() => {
    function hidePromptShownInAnotherTab(event: StorageEvent) {
      if (event.key === PROMPT_SHOWN_KEY && event.newValue) setVisible(false);
    }

    window.addEventListener("storage", hidePromptShownInAnotherTab);
    return () => window.removeEventListener("storage", hidePromptShownInAnotherTab);
  }, []);

  function dismiss() {
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setVisible(false);
    setInstallEvent(null);
  }

  if (!visible || pathname !== "/") return null;

  return <aside aria-label="Install BelGlow" className="pwa-install fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[70] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-[#efd7de] bg-white/95 p-4 shadow-[0_18px_55px_rgba(73,29,43,.22)] backdrop-blur sm:w-auto">
    <button onClick={dismiss} aria-label="Dismiss install message" className="absolute right-2 top-2 grid min-h-10 min-w-10 place-items-center rounded-full text-[#75696e] hover:bg-[#fff1f5]"><X size={17} /></button>
    <div className="flex gap-3 pr-8"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff0f4] text-[#df3b68]">{isIOS ? <Share2 size={21} /> : <Download size={21} />}</span><div><p className="font-bold text-[#2b2226]">Add BelGlow to your home screen</p><p className="mt-1 text-xs leading-5 text-[#75696e]">{isIOS ? "In Safari, tap Share, then choose Add to Home Screen." : "Install BelGlow for a fast, full-screen app experience."}</p></div></div>
    {!isIOS && installEvent && <button onClick={() => void install()} className="mt-3 min-h-11 w-full rounded-xl bg-[#ef4b74] px-4 text-sm font-bold text-white">Install BelGlow</button>}
  </aside>;
}
