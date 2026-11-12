export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Stage 1 · Repository Setup
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Inventory Management System
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Frontend workspace is initialized with Next.js, TypeScript, and
          Tailwind CSS.
        </p>
      </section>
    </main>
  );
}
