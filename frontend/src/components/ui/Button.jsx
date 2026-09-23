const variants = {
  primary:
    "bg-electric text-white shadow-soft font-semibold hover:bg-electric-light active:scale-[0.98]",
  secondary:
    "bg-white border border-slate-200 text-slate-700 shadow-soft font-semibold hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]",
  ghost:
    "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  danger:
    "bg-coral text-white shadow-soft font-semibold hover:brightness-110 active:scale-[0.98]",
  success:
    "bg-mint text-white shadow-soft font-semibold hover:brightness-110 active:scale-[0.98]",
};

const sizes = {
  sm: "text-xs px-3 py-1.5 rounded-md gap-1.5",
  md: "text-sm px-4 py-2 rounded-lg gap-2",
  lg: "text-base px-6 py-3 rounded-xl gap-2",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
      {children}
    </button>
  );
}
