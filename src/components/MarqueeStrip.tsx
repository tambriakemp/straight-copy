const items = [
  "AI Brand Campaigns", "Editorial Imagery", "Lifestyle Content",
  "Short-Form Video", "Product Visualization", "Brand Strategy",
];

const MarqueeStrip = () => {
  return (
    <div className="bg-ink py-[18px] overflow-hidden whitespace-nowrap">
      <div className="inline-flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="font-serif text-sm font-light italic tracking-[0.1em] text-stone px-12">
              {item}
            </span>
            <span className="text-accent px-1">·</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default MarqueeStrip;
