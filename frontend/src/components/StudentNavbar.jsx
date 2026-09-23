import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogIn, UserPlus, LogOut, LayoutDashboard, User } from "lucide-react";
import Logo from "./Logo";
import { useStudentAccountAuth } from "../lib/studentAccountAuth";

const GUEST_NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/demo-quiz", label: "Demo Quiz" },
  { to: "/programming", label: "Programming" },
  { to: "/gallery", label: "Gallery" },
];

const AUTHED_NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/quizzes", label: "Quizzes" },
  { to: "/programming", label: "Programming" },
  { to: "/gallery", label: "Gallery" },
  { to: "/profile", label: "Profile" },
];

export default function StudentNavbar() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, signOut } = useStudentAccountAuth();

  const navItems = isAuthenticated ? AUTHED_NAV_ITEMS : GUEST_NAV_ITEMS;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const isActive = (to) => {
    const [path, itemHash] = to.split("#");
    if (itemHash) return pathname === "/" && hash === `#${itemHash}`;
    return path === "/" ? pathname === "/" && !hash : pathname.startsWith(path);
  };

  const iconFor = (to) => {
    if (to === "/dashboard") return LayoutDashboard;
    if (to === "/profile") return User;
    return null;
  };

  const handleSignOut = () => {
    signOut();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-none">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
        <Link to={isAuthenticated ? "/dashboard" : "/"} onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = iconFor(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.to)
                    ? "bg-electric/8 text-electric font-semibold"
                    : "text-ink-500 hover:text-ink-100 hover:bg-stone-100"
                }`}
              >
                {Icon && <Icon className="h-4 w-4" />} {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-coral hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          ) : (
            <>
              <Link
                to="/signin"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-100 hover:bg-stone-100"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 rounded-xl bg-electric px-3.5 py-2 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 hover:-translate-y-0.5"
              >
                <UserPlus className="h-4 w-4" /> Sign up
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg p-2 text-ink-500 hover:bg-stone-100 hover:text-ink-100 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t hairline bg-white px-5 pb-4 pt-2 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = iconFor(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? "bg-electric/10 text-electric font-semibold"
                      : "text-ink-500 hover:text-ink-100 hover:bg-stone-100"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />} {item.label}
                </Link>
              );
            })}

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-500 hover:bg-red-50 hover:text-coral"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            ) : (
              <>
                <Link
                  to="/signin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-500 hover:bg-stone-100 hover:text-ink-100"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-electric hover:brightness-105"
                >
                  <UserPlus className="h-4 w-4" /> Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
