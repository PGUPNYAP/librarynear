import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { PortableText } from "@portabletext/react";
import { Suspense } from "react";
import { HomeSearchShell } from "@/components/home-search-shell";
import { client } from "@/sanity/lib/client";
import { urlForImage } from "@/sanity/lib/image";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60; // Revalidate every minute

function cleanSlug(slug: string) {
  try {
    return decodeURIComponent(slug).trim();
  } catch {
    return slug.trim();
  }
}

async function getPost(rawSlug: string) {
  const slug = cleanSlug(rawSlug);
  // Some CMS slugs were saved with stray whitespace; match those too so the
  // clean URL works.
  const query = `*[_type == "post" && (slug.current == $slug || slug.current == " " + $slug || slug.current == $slug + " ")][0] {
    title,
    _updatedAt,
    mainImage,
    publishedAt,
    seoDescription,
    body,
    "readingTime": round(length(pt::text(body)) / 5 / 200)
  }`;
  return client.fetch(query, { slug });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  const siteUrl = getSiteUrl();
  const imageUrl = post.mainImage ? urlForImage(post.mainImage)?.width(1200).height(630).url() : `${siteUrl}/og-default.png`;

  return {
    title: post.title,
    description: post.seoDescription || `Read ${post.title} on LibraryNear.`,
    openGraph: {
      title: post.title,
      description: post.seoDescription,
      type: "article",
      publishedTime: post.publishedAt,
      url: `${siteUrl}/blog/${cleanSlug(slug)}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.seoDescription,
      images: [imageUrl],
    },
    alternates: {
      canonical: `${siteUrl}/blog/${cleanSlug(slug)}`,
    },
  };
}

const portableTextComponents = {
  types: {
    image: ({ value }: any) => {
      if (!value?.asset?._ref) return null;
      return (
        <figure className="relative w-full md:w-[120%] md:-ml-[10%] aspect-video my-10 md:my-14 overflow-hidden bg-gray-50 border border-gray-100">
          <Image
            src={urlForImage(value)?.url() || ""}
            alt={value.alt || "Blog image"}
            fill
            className="object-contain md:object-cover"
          />
          {value.alt && (
            <figcaption className="absolute bottom-[-32px] w-full text-center text-sm text-gray-500 font-sans mt-2">
              {value.alt}
            </figcaption>
          )}
        </figure>
      );
    },
  },
  block: {
    h1: ({ children }: any) => <h1 className="text-3xl md:text-4xl font-bold mt-12 mb-6 text-gray-900 font-sans tracking-tight">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-2xl md:text-3xl font-bold mt-12 mb-4 text-gray-900 font-sans tracking-tight">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-xl md:text-2xl font-bold mt-8 mb-4 text-gray-900 font-sans tracking-tight">{children}</h3>,
    normal: ({ children }: any) => <p className="text-[20px] md:text-[21px] leading-[32px] md:leading-[34px] mb-8 text-gray-800 font-serif whitespace-pre-wrap">{children}</p>,
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-[3px] border-black pl-5 md:pl-6 my-10 text-[21px] md:text-[24px] leading-relaxed italic text-gray-800 font-serif">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }: any) => <ul className="list-disc pl-6 mb-8 space-y-3 text-[20px] md:text-[21px] leading-[32px] text-gray-800 font-serif">{children}</ul>,
    number: ({ children }: any) => <ol className="list-decimal pl-6 mb-8 space-y-3 text-[20px] md:text-[21px] leading-[32px] text-gray-800 font-serif">{children}</ol>,
  },
  listItem: {
    bullet: ({ children }: any) => <li className="pl-2">{children}</li>,
    number: ({ children }: any) => <li className="pl-2">{children}</li>,
  },
  marks: {
    link: ({ children, value }: any) => {
      const rel = !value.href.startsWith("/") ? "noreferrer noopener" : undefined;
      return (
        <a href={value.href} rel={rel} className="text-black underline underline-offset-4 decoration-gray-300 hover:decoration-black transition-colors">
          {children}
        </a>
      );
    },
    strong: ({ children }: any) => <strong className="font-bold text-gray-900">{children}</strong>,
  },
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canonicalSlug = cleanSlug(slug);
  if (canonicalSlug !== slug && encodeURIComponent(canonicalSlug) !== slug) {
    permanentRedirect(`/blog/${encodeURIComponent(canonicalSlug)}`);
  }
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const postUrl = `${siteUrl}/blog/${canonicalSlug}`;
  const readTime = Math.max(1, post.readingTime || 3);
  
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: post.mainImage ? [urlForImage(post.mainImage)?.url()] : [],
    datePublished: post.publishedAt,
    dateModified: post._updatedAt || post.publishedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl },
    url: postUrl,
    inLanguage: "en-IN",
    author: [{
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "LibraryNear Editorial Team",
      url: `${siteUrl}/about`,
    }],
    publisher: { "@id": `${siteUrl}/#organization` },
    description: post.seoDescription,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: postUrl },
    ],
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbJsonLd]).replace(/</g, "\\u003c") }}
      />
      


      <div className="w-full flex justify-center pb-20">
        <article className="w-full max-w-[680px] px-5 md:px-0 mt-10 md:mt-16">
          <header className="mb-10">
            <h1 className="text-[32px] md:text-[42px] leading-[40px] md:leading-[52px] font-bold tracking-tight text-gray-900 mb-8 font-sans">
              {post.title}
            </h1>
            
            <div className="flex items-center gap-4 mb-8">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0">
                <Image src="/logo-icon.webp" alt="LibraryNear" width={44} height={44} className="object-cover w-full h-full" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[16px] font-medium text-gray-900 font-sans leading-tight">
                  LibraryNear Team
                </span>
                <div className="flex items-center gap-2 text-[14px] text-gray-500 font-sans mt-0.5">
                  {post.publishedAt && (
                    <span>
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </span>
                  )}
                  <span>·</span>
                  <span>{readTime} min read</span>
                </div>
              </div>
            </div>
            
            <div className="w-full h-[1px] bg-gray-100 mb-10" />
          </header>

          {post.mainImage && (
            <figure className="relative w-full aspect-[16/9] md:aspect-[2/1] overflow-hidden bg-gray-50 mb-12">
              <Image
                src={urlForImage(post.mainImage)?.url() || ""}
                alt={post.title}
                fill
                priority
                className="object-cover"
              />
            </figure>
          )}

          <div className="w-full">
            {post.body ? (
              <PortableText value={post.body} components={portableTextComponents} />
            ) : (
              <p className="text-gray-500 italic font-serif text-[20px]">No content available.</p>
            )}
          </div>
          
          <div className="w-full h-[1px] bg-gray-100 mt-16 mb-8" />
          
        </article>
      </div>
      
      <div className="w-full border-t border-border/40 bg-slate-50/30">
        <div className="container mx-auto px-6 py-12 md:px-10 flex flex-col items-center text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-black mb-4">Ready to find your perfect study space?</h2>
          <p className="text-muted-foreground mb-8 max-w-lg">Search libraries near you to compare amenities, fees, and metro connectivity instantly.</p>
          <div className="w-full">
            <Suspense fallback={null}>
              <HomeSearchShell />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
