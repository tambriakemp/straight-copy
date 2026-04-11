import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 md:px-[52px] py-7 mix-blend-multiply">
      <Link to="/" className="font-serif text-lg font-light tracking-[0.25em] uppercase text-ink no-underline">
        Cre8 Visions
      </Link>
      <ul className="hidden md:flex gap-10 list-none">
        <li><Link to="/services" className="font-sans text-[11px] font-normal tracking-[0.2em] uppercase text-charcoal no-underline hover:text-accent transition-colors duration-300">Services</Link></li>
        <li><Link to="/work" className="font-sans text-[11px] font-normal tracking-[0.2em] uppercase text-charcoal no-underline hover:text-accent transition-colors duration-300">Work</Link></li>
        <li><Link to="/philosophy" className="font-sans text-[11px] font-normal tracking-[0.2em] uppercase text-charcoal no-underline hover:text-accent transition-colors duration-300">Philosophy</Link></li>
        <li><Link to="/contact" className="font-sans text-[11px] font-normal tracking-[0.2em] uppercase text-charcoal no-underline hover:text-accent transition-colors duration-300">Contact</Link></li>
      </ul>
    </nav>
  );
};

export default Navbar;
