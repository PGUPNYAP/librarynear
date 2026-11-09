import {
  buildBlogEntries,
  buildLibraryEntries,
  buildPagesEntries,
  buildPlacesEntries,
  renderUrlset,
  xmlResponse,
} from "@/lib/sitemap-data";

export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ part: string }> }) {
  const { part: rawPart } = await params;
  const part = rawPart.replace(/\.xml$/, "");

  if (part === "pages") return xmlResponse(renderUrlset(await buildPagesEntries()));
  if (part === "places") return xmlResponse(renderUrlset(await buildPlacesEntries()));
  if (part === "blog") return xmlResponse(renderUrlset(await buildBlogEntries()));

  const match = /^libraries-(\d{1,3})$/.exec(part);
  if (match) {
    const entries = await buildLibraryEntries(Number(match[1]));
    if (entries.length > 0) return xmlResponse(renderUrlset(entries));
  }

  return new Response("Not found", { status: 404 });
}
