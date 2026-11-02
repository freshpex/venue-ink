import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const routes = {
  "/": "More ink. Less admin.",
  "/for-tattoo-artists": "Make your own mark.",
  "/studios": "One happy studio.",
  "/features": "A little less everything else.",
  "/booking": "Booking, on your terms.",
  "/flash": "Made to be inked.",
  "/artist-websites": "Your link. Your world.",
  "/payments": "A smooth finish to great work.",
  "/pricing": "Good art. Clear pricing.",
  "/info/mobile-app": "Your studio, to go.",
  "/services": "A studio isn’t just one thing.",
  "/about": "Art deserves a little more space.",
  "/journal": "Notes from the studio.",
  "/help": "A little clarity.",
  "/contact": "Talk to a human.",
  "/get-started": "Find your Venue.",
  "/demo": "Take the artist’s seat.",
  "/credits": "Real work. Real credit.",
};
const html = readFileSync("dist/index.html", "utf8");
const base =
  process.env.SITE_URL ||
  "https://venue-ink-art-over-admin.epeksenoch.chatgpt.site";
for (const [route, title] of Object.entries(routes)) {
  const description = `${title} Explore tattoo booking and studio tools in this independent Venue redesign preview.`;
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${title} | Venue Ink`,
    description,
    url: `${base}${route}`,
  }).replace(/</g, "\\u003c");
  const meta = `<link rel="canonical" href="${base}${route}"/><meta property="og:title" content="${title} | Venue Ink"/><meta property="og:description" content="${description}"/><meta property="og:type" content="website"/><meta property="og:url" content="${base}${route}"/><meta property="og:image" content="${base}/images/hero-tattoo-session.webp"/><meta name="twitter:card" content="summary_large_image"/><script type="application/ld+json">${structured}</script>`;
  // Static, readable fallback is available before the React application loads.
  const fallback = `<div id="root"><main style="font-family:sans-serif;max-width:900px;margin:80px auto;padding:30px"><h1>${title}</h1><p>${description}</p><p>Bookings, flash collections, studio calendars and client conversations. Interactive examples are not real appointments or payments.</p><nav>${Object.entries(
    routes,
  )
    .map(
      ([url, text]) =>
        `<a href="${url}" style="display:inline-block;margin:10px">${text}</a>`,
    )
    .join(
      "",
    )}</nav><p><a href="https://www.venue.ink/">Visit the official Venue website</a></p></main></div>`;
  const output = html
    .replace(/<title>.*?<\/title>/, `<title>${title} | Venue Ink</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${description}"/>`,
    )
    .replace("</head>", `${meta}</head>`)
    .replace('<div id="root"></div>', fallback);
  if (route === "/") writeFileSync("dist/index.html", output);
  else {
    mkdirSync(`dist${route}`, { recursive: true });
    writeFileSync(`dist${route}/index.html`, output);
  }
}
writeFileSync(
  "dist/robots.txt",
  `User-agent: *\nDisallow: /\n# Independent private concept. Do not index as the official Venue.\n`,
);
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(
    routes,
  )
    .map((r) => `<url><loc>${base}${r}</loc></url>`)
    .join("")}</urlset>`,
);
writeFileSync("dist/_redirects", "/* /index.html 200\n");
console.log(
  `Generated metadata and static HTML fallbacks for ${Object.keys(routes).length} routes. Preview remains noindex.`,
);
