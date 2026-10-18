export function TopBar() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-rule bg-card">
      <div className="mx-auto flex h-full max-w-[1200px] items-center px-4">
        <p className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-[15px] font-semibold text-text">Fare Finder</span>
          <span className="hidden truncate text-sm text-subtle sm:inline">The cheapest way into and out of a country</span>
        </p>
      </div>
    </header>
  );
}
