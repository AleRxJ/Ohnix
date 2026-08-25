import { Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import BreadcrumbNav from "../components/common/BreadcrumbNav";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";
import { blogPosts } from "../data/blogPosts";

const Blog = () => {
    const { currentLanguage } = useI18n();

    const description =
        "Blog de Ohnix con guias practicas de inventario, compras y ventas para pymes que buscan mejorar control operativo y rentabilidad.";

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Blog Ohnix",
        description,
        url: "https://ohnix.co/blog",
    };

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Blog de inventario para pymes | Ohnix"
                description={description}
                canonicalPath="/blog"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="blog" shell={false}>
                    <BreadcrumbNav items={[{ label: "Inicio", to: "/" }, { label: "Blog" }]} />
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="BLOG OHNIX"
                        title="Guias para controlar inventario, compras y ventas"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 lg:grid-cols-2">
                        {blogPosts.map((post) => (
                            <article
                                key={post.slug}
                                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
                            >
                                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[#A9B3B8]">
                                    <span>{post.category}</span>
                                    <span>{post.readTime}</span>
                                    <span>{post.publishDate}</span>
                                </div>
                                <h2 className="mt-4 text-2xl font-semibold text-white">{post.title}</h2>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{post.description}</p>
                                <Link
                                    to={`/blog/${post.slug}`}
                                    className="mt-6 inline-flex rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-sm font-semibold text-white hover:border-[#29D8D5]/35"
                                >
                                    Leer articulo
                                </Link>
                            </article>
                        ))}
                    </div>
                </ContentSection>
            </main>
            <Footer />
        </div>
    );
};

export default Blog;
