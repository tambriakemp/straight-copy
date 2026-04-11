const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 md:px-[52px] py-7 mix-blend-multiply">
      <a href="#" className="font-serif text-lg font-light tracking-[0.25em] uppercase text-ink no-underline">
        Cre8 Visions
      </a>
      <ul className="hidden md:flex gap-10 list-none">
        {["Services", "Work", "Philosophy", "Contact"].map((item) => (
          <li key={item}>
            <a
              href={`#${item.toLowerCase()}`}
              className="font-sans text-[11px] font-normal tracking-[0.2em] uppercase text-charcoal no-underline hover:text-accent transition-colors duration-300"
            >
              {item}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navbar;
