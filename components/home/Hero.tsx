import {
  ArrowRight,
  HeartHandshake,
  Leaf,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#fff8fa] via-[#ffeef3] to-[#ffdbe6]">
      {/* Background decorations */}
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl" />
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-[560px] max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-20">

        {/* LEFT */}
        <div className="max-w-xl">

          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 sm:text-sm">
            Natural • Effective • Radiant
          </p>

          <h1 className="text-5xl font-bold leading-[0.98] tracking-tight text-neutral-950 sm:text-6xl lg:text-7xl">
            Skincare
            <br />
            that cares
            <br />

            <span className="text-pink-500">
              for your glow
            </span>
          </h1>

          <p className="mt-7 max-w-md text-base leading-7 text-neutral-600 sm:text-lg">
            Discover skincare essentials made with gentle ingredients for
            healthy, radiant skin.
          </p>

          <button className="mt-8 inline-flex items-center gap-3 rounded-full bg-pink-500 px-7 py-3.5 font-semibold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-pink-600">
            Shop Now

            <ArrowRight size={18} />
          </button>

          {/* Trust Features */}
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-5">

            <TrustFeature
              icon={<Leaf size={23} />}
              text="Gentle"
              subtext="Formulas"
            />

            <TrustFeature
              icon={<HeartHandshake size={23} />}
              text="Cruelty"
              subtext="Free"
            />

            <TrustFeature
              icon={<ShieldCheck size={23} />}
              text="Dermatologist"
              subtext="Trusted"
            />

          </div>
        </div>

        {/* RIGHT PRODUCT DISPLAY */}
        <div className="relative flex min-h-[400px] items-center justify-center">

          {/* Decorative circle */}
          <div className="absolute h-[350px] w-[350px] rounded-full border border-white/70 bg-white/20 sm:h-[430px] sm:w-[430px]" />

          {/* Decorative leaves / circles */}
          <div className="absolute left-5 top-16 h-24 w-24 rounded-full bg-pink-300/40 blur-xl" />
          <div className="absolute bottom-10 right-5 h-32 w-32 rounded-full bg-white/50 blur-2xl" />

          {/* Main showcase */}
          <div className="relative z-10 flex items-end justify-center gap-3 sm:gap-5">

            {/* Serum */}
            <div className="flex h-44 w-24 flex-col items-center justify-end rounded-[28px] border border-white/70 bg-gradient-to-b from-white to-pink-100 p-3 shadow-xl shadow-pink-200/50">
              <Sparkles
                size={18}
                className="mb-auto mt-4 text-pink-400"
              />

              <p className="text-sm font-bold">
                Bel<span className="text-pink-500">Glow</span>
              </p>

              <span className="mt-1 text-[8px] uppercase text-neutral-500">
                Glow Serum
              </span>
            </div>

            {/* Cleanser */}
            <div className="flex h-72 w-32 flex-col items-center rounded-t-[38px] rounded-b-[24px] border border-white/80 bg-gradient-to-b from-pink-200 to-pink-100 px-3 py-8 shadow-2xl shadow-pink-300/40">

              <p className="mt-12 text-lg font-bold">
                Bel<span className="text-pink-500">Glow</span>
              </p>

              <span className="mt-2 text-center text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
                Brightening
                <br />
                Face Cleanser
              </span>

              <span className="mt-auto text-[8px] text-neutral-500">
                100 ml
              </span>
            </div>

            {/* Toner */}
            <div className="flex h-64 w-28 flex-col items-center rounded-[26px] border border-white/80 bg-gradient-to-b from-white to-pink-100 px-3 py-7 shadow-xl shadow-pink-200/50">

              <div className="-mt-10 mb-8 h-12 w-16 rounded-t-xl bg-pink-300 shadow-sm" />

              <p className="text-base font-bold">
                Bel<span className="text-pink-500">Glow</span>
              </p>

              <span className="mt-2 text-center text-[9px] font-semibold uppercase text-neutral-500">
                Glow Toner
              </span>

              <span className="mt-auto text-[8px] text-neutral-500">
                120 ml
              </span>
            </div>

            {/* Moisturizer */}
            <div className="hidden h-36 w-28 flex-col items-center justify-center rounded-[30px] border border-white bg-gradient-to-b from-white to-pink-100 shadow-xl shadow-pink-200/50 sm:flex">

              <p className="text-sm font-bold">
                Bel<span className="text-pink-500">Glow</span>
              </p>

              <span className="mt-1 text-[8px] uppercase text-neutral-500">
                Moisture Gel
              </span>

            </div>
          </div>

          {/* Platform */}
          <div className="absolute bottom-4 h-12 w-[85%] rounded-[50%] bg-pink-200/60 blur-sm" />
        </div>
      </div>
    </section>
  );
}

function TrustFeature({
  icon,
  text,
  subtext,
}: {
  icon: React.ReactNode;
  text: string;
  subtext: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-pink-500">
        {icon}
      </div>

      <div className="text-sm leading-tight text-neutral-700">
        <p>{text}</p>
        <p>{subtext}</p>
      </div>
    </div>
  );
}