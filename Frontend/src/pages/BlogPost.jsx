import { Layout } from "antd";
import { Link, Navigate, useParams } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import BreadcrumbNav from "../components/common/BreadcrumbNav";
import useI18n from "../hooks/useI18n";
import { ContentSection } from "../components/landing/LandingPageSections";
import { blogPosts, getBlogPostBySlug } from "../data/blogPosts";

const { Content } = Layout;

const BlogPost = () => {
    const { slug } = useParams();
    const { currentLanguage } = useI18n();

    const post = getBlogPostBySlug(slug);

    if (!post) {
        return <Navigate to="/blog" replace />;
    }

    const canonicalPath = `/blog/${post.slug}`;

    const articleStructuredData = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.description,
        datePublished: post.publishDate,
        dateModified: post.publishDate,
        author: {
            "@type": "Organization",
            name: "Ohnix",
        },
        publisher: {
            "@type": "Organization",
            name: "Ohnix",
            logo: {
                "@type": "ImageObject",
                url: "https://www.ohnix.co/Ohnix_FullLogo.png",
            },
        },
        mainEntityOfPage: `https://www.ohnix.co${canonicalPath}`,
    };

    return (
        <Layout className="min-h-screen bg-[#050505]">
            <SeoHead
                title={`${post.title} | Ohnix`}
                description={post.description}
                canonicalPath={canonicalPath}
                lang={currentLanguage || "es"}
                structuredData={articleStructuredData}
            />
            <Navbar />
            <Content className="bg-[#050505] pt-20">
                <ContentSection id={`blog-${post.slug}`} shell={false}>
                    <BreadcrumbNav
                        items={[
                            { label: "Inicio", to: "/" },
                            { label: "Blog", to: "/blog" },
                            { label: post.title },
                        ]}
                    />

                    <article className="mx-auto max-w-4xl">
                        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-[#A9B3B8]">
                            <span>{post.category}</span>
                            <span>{post.readTime}</span>
                            <span>{post.publishDate}</span>
                        </div>
                        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">{post.title}</h1>
                        <p className="mt-5 text-base leading-8 text-[#CFE8E8]">{post.description}</p>

                        <div className="mt-10 space-y-10">
                            {post.sections.map((section) => (
                                <section key={section.heading}>
                                    <h2 className="text-2xl font-semibold text-white">{section.heading}</h2>
                                    <div className="mt-4 space-y-4">
                                        {section.paragraphs.map((paragraph, index) => (
                                            <p key={`${section.heading}-${index}`} className="text-sm leading-8 text-[#A9B3B8]">
                                                {paragraph}
                                            </p>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>

                        <div className="mt-12 rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                            <h2 className="text-xl font-semibold text-white">Siguiente paso recomendado</h2>
                            <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                                Si quieres pasar de teoria a accion, revisa como Ohnix ayuda a pymes a controlar inventario, compras y ventas en un flujo operativo integrado.
                            </p>
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <Link
                                    to="/software-inventario-pymes"
                                    className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                                >
                                    Ver solucion para pymes
                                </Link>
                                <Link
                                    to="/precios"
                                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                                >
                                    Revisar precios
                                </Link>
                            </div>
                        </div>
                    </article>

                    <section className="mx-auto mt-12 max-w-4xl">
                        <h2 className="text-2xl font-semibold text-white">Mas articulos del blog</h2>
                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            {blogPosts
                                .filter((candidate) => candidate.slug !== post.slug)
                                .slice(0, 4)
                                .map((candidate) => (
                                    <article
                                        key={candidate.slug}
                                        className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5"
                                    >
                                        <h3 className="text-lg font-semibold text-white">{candidate.title}</h3>
                                        <p className="mt-2 text-sm leading-7 text-[#A9B3B8]">{candidate.description}</p>
                                        <Link
                                            to={`/blog/${candidate.slug}`}
                                            className="mt-4 inline-flex rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white hover:border-[#29D8D5]/35"
                                        >
                                            Leer articulo
                                        </Link>
                                    </article>
                                ))}
                        </div>
                    </section>
                </ContentSection>
            </Content>
            <Footer />
        </Layout>
    );
};

export default BlogPost;
