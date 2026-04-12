import { Link } from "react-router-dom";

interface NavbarProps {
  variant?: "light" | "dark";
}

const Navbar = ({ variant = "light" }: NavbarProps) => {
  const isDark = variant === "dark";

  return (
    <nav
      className={`absolute top-0 left-0 right-0 z-50 flex justify-between items-center px-8 md:px-[52px] py-7 ${
        isDark ? "bg-ink/[0.92] backdrop-blur-[12px] border-b border-warm-white/5" : "mix-blend-multiply"
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
      <ul className="hidden md:flex gap-10 list-none">
        {[
          { name: "Services", path: "/services" },
          { name: "Work", path: "/work" },
          { name: "Philosophy", path: "/philosophy" },
          { name: "Contact", path: "/contact" },
        ].map((item) => (
          <li key={item.name}>
            <Link
              to={item.path}
              className={`font-sans text-[11px] font-normal tracking-[0.2em] uppercase no-underline transition-colors duration-300 ${
                isDark ? "text-stone hover:text-accent" : "text-charcoal hover:text-accent"
              }`}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navbar;
