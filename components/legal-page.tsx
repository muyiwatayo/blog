import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type LegalSection = {
  title: string;
  paragraphs: string[];
};

export function LegalPage({
  title,
  introduction,
  sections,
}: {
  title: string;
  introduction: string;
  sections: LegalSection[];
}) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="legal-page">
        <Link className="back-link" href="/">
          ← Back to Fieldnotes
        </Link>
        <header className="legal-heading">
          <p className="eyebrow">Fieldnotes policies</p>
          <h1>{title}</h1>
          <p>{introduction}</p>
          <small>Last updated November 2, 2026</small>
        </header>
        <div className="legal-sections">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
