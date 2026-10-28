export default function AdminLoading() {
  return (
    <main className="min-h-dvh bg-[#e9dfdb] p-0 text-[#292527] lg:p-5">
      <div className="mx-auto grid min-h-dvh max-w-[1600px] overflow-hidden bg-[#f8f5f3] lg:min-h-[calc(100dvh-40px)] lg:grid-cols-[250px_1fr] lg:rounded-[28px]">
        <aside className="hidden bg-[#292326] p-5 lg:block">
          <div className="h-11 w-40 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-white/7" />)}
          </div>
        </aside>
        <section className="p-5 sm:p-8">
          <div className="h-12 animate-pulse rounded-xl bg-white" />
          <div className="mt-8 h-10 w-64 animate-pulse rounded-xl bg-[#eadfdb]" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />)}
          </div>
          <div className="mt-5 h-72 animate-pulse rounded-2xl bg-white" />
        </section>
      </div>
    </main>
  );
}
