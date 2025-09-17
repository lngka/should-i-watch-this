export function GET() {
	return new Response(`User-agent: *\nAllow: /\nSitemap: ${process.env.SITE_URL || "http://localhost:3000"}/sitemap.xml`);
}

