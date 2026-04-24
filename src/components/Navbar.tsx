import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

interface NavbarProps {
  variant?: "light" | "dark";
}

const navItems = [
  { name: "Services", path: "/services" },
  { name: "How It Works", path: "/work" },
  { name: "Philosophy", path: "/philosophy" },
  { name: "Contact", path: "/contact" },
];

const Navbar = ({ variant = "light" }: NavbarProps) => {
  const isDark = variant === "dark";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className={`absolute top-0 left-0 right-0 ${isDark ? "" : "md:right-1/2"} z-50 flex justify-between items-center px-8 md:px-[52px] py-7 ${
        isDark ? "bg-ink/[0.92] backdrop-blur-[12px] border-b border-warm-white/5" : ""
      }`}
    >
      <Link
        to="/"
        className={`font-serif text-lg font-light tracking-[0.25em] uppercase no-underline ${
          isDark ? "text-warm-white" : "text-ink"
        }`}
      >
        Cre8 Visions
      </Link>

      {/* Desktop nav */}
      <ul className="hidden md:flex gap-10 list-none">
        {navItems.map((item) => (
          <li key={item.name}>
            <Link
              to={item.path}
              className={`font-sans text-[11px] font-normal tracking-[0.2em] uppercase no-underline transition-colors duration-300 ${
                isDark ? "text-stone hover:text-accent" : "text-ink hover:text-accent"
              }`}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>

      {/* Mobile hamburger */}
      <button
        className={`md:hidden p-1 ${isDark ? "text-warm-white" : "text-ink"}`}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className={`absolute top-full left-0 right-0 flex flex-col items-center gap-6 py-8 md:hidden ${
          isDark ? "bg-ink/95 backdrop-blur-md" : "bg-warm-white/95 backdrop-blur-md"
        }`}>
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`font-sans text-[12px] font-normal tracking-[0.2em] uppercase no-underline transition-colors duration-300 ${
                isDark ? "text-stone hover:text-accent" : "text-ink hover:text-accent"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
