"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY > 520);
    }
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  return <button
    type="button"
    aria-label="Back to top"
    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    className={`frame-fab fixed bottom-5 z-[60] grid h-12 w-12 place-items-center rounded-full bg-[#ef4b74] text-white shadow-[0_12px_30px_rgba(150,45,75,.3)] transition duration-300 hover:-translate-y-1 hover:bg-[#dc3764] ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
  ><ArrowUp size={21} /></button>;
}
