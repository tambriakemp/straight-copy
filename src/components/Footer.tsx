import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-charcoal px-8 md:px-[52px] py-10 flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="font-serif text-sm font-light tracking-[0.25em] uppercase text-stone">
        Cre8 Visions
      </div>
      <div className="text-[11px] tracking-[0.1em] text-taupe">
        © 2026 Cre8 Visions. All rights reserved.
      </div>
      <ul className="flex gap-8 list-none">
        <li>
          <a href="#" className="text-[11px] tracking-[0.15em] uppercase text-taupe no-underline hover:text-stone transition-colors duration-300">
            Instagram
          </a>
        </li>
        <li>
          <a href="#" className="text-[11px] tracking-[0.15em] uppercase text-taupe no-underline hover:text-stone transition-colors duration-300">
            LinkedIn
          </a>
        </li>
        <li>
          <Link to="/privacy" className="text-[11px] tracking-[0.15em] uppercase text-taupe no-underline hover:text-stone transition-colors duration-300">
            Privacy
          </Link>
        </li>
      </ul>
    </footer>
  );
};

export default Footer;
