export function GET() {
	const base = process.env.SITE_URL || "http://localhost:3000";
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc></url>
  <url><loc>${base}/about</loc></url>
</urlset>`;
	return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}

