export default function Logo({ size = "md", showWordmark = true }) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const textSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className={`relative ${dims} shrink-0 overflow-hidden`}>
        <svg viewBox="0 0 32 32" fill="none" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" className="fill-electric" />
          <path d="M11 11L6 16L11 21" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M21 11L26 16L21 21" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18.5 7L13.5 25" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <p className={`font-display font-semibold tracking-tight ${textSize} text-slate-900`}>
            Coding<span className="text-electric">Club</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">Learn · Code · Build</p>
        </div>
      )}
    </div>
  );
}
