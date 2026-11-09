import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { IntentLink } from "@/components/intent-link";
import { client } from "@/sanity/lib/client";
import { urlForImage } from "@/sanity/lib/image";
import { HomeSearchShell } from "@/components/home-search-shell";

export const revalidate = 60; // Revalidate every minute

async function getPosts() {
  const query = `*[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
    _id,
    title,
    slug,
    mainImage,
    publishedAt,
    seoDescription,
    "readingTime": round(length(pt::text(body)) / 5 / 200)
  }`;
  return client.fetch(query);
}

export const metadata = {
  alternates: { canonical: `${getSiteUrl()}/blog` },
  title: "Blog",
  description: "Read the latest tips, guides, and reviews about finding the best study spaces and libraries in Delhi.",
};

export default async function BlogIndexPage() {
  const posts = await getPosts();

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Suspense fallback={null}>
        <HomeSearchShell />
      </Suspense>

      <section className="container mx-auto px-6 py-10 md:px-10 md:py-16 max-w-[680px]">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-black mb-4 font-sans">
          LibraryNear Blog
        </h1>
        <p className="text-lg leading-7 text-gray-500 mb-12 font-sans border-b border-gray-200 pb-12">
          Guides, tips, and insights on finding the perfect study space in Delhi.
        </p>

        {posts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No blog posts found.</p>
            <p className="text-sm mt-2">Check back soon for new content!</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {posts.map((post: any) => {
              const readTime = Math.max(1, post.readingTime || 3);
              return (
                <IntentLink
                  key={post._id}
                  href={`/blog/${post.slug.current}`}
                  className="group flex items-center justify-between gap-6 py-8 border-b border-gray-100 last:border-0"
                >
                  <div className="flex flex-col flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 shrink-0">
                        <Image src="/logo-icon.webp" alt="LibraryNear" width={20} height={20} className="object-cover w-full h-full" />
                      </div>
                      <span className="text-xs font-medium text-gray-900 font-sans">LibraryNear Team</span>
                    </div>
                    
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 font-sans leading-snug group-hover:underline decoration-gray-300 underline-offset-4 line-clamp-2">
                      {post.title}
                    </h2>
                    
                    {post.seoDescription && (
                      <p className="text-base text-gray-600 mb-3 font-serif line-clamp-2 hidden md:block">
                        {post.seoDescription}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 text-[13px] text-gray-500 font-sans mt-1">
                      {post.publishedAt && (
                        <span>
                          {new Date(post.publishedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      <span>·</span>
                      <span>{readTime} min read</span>
                    </div>
                  </div>
                  
                  {post.mainImage && (
                    <div className="relative w-[100px] h-[100px] md:w-[150px] md:h-[100px] shrink-0 overflow-hidden bg-gray-50">
                      <Image
                        src={urlForImage(post.mainImage)?.width(300).height(200).url() || ""}
                        alt={post.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                </IntentLink>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
