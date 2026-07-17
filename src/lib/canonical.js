// index.html ships a static <link rel="canonical"> pointing at the homepage,
// and the SPA fallback serves that same document for every route. Left alone
// it tells search engines that every page (e.g. /privacy) is a duplicate of
// the homepage. Correct it to the route actually being viewed before render;
// room URLs are join credentials (and crawl-blocked in robots.txt), so the
// tag is removed there rather than advertising them.
const ORIGIN = "https://pointtaken.team";
const INDEXABLE_PATHS = ["/", "/privacy"];

export function syncCanonicalTag() {
  const tag = document.querySelector('link[rel="canonical"]');
  if (!tag) return;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (INDEXABLE_PATHS.includes(path)) {
    tag.href = path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`;
  } else {
    tag.remove();
  }
}
