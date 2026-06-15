import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const SITE_ORIGIN = "https://saoma.io";

interface CompareSeo {
  title: string;
  description: string;
  /** Absolute path on the site, e.g. "/compare/saoma-vs-mindbody". */
  path: string;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Client-side SEO for the comparison pages. Mirrors the existing landing/Terms
 * approach (document.title + meta in an effect) and additionally manages
 * canonical + Open Graph tags. On unmount, canonical is reset to the site root
 * so it does not leak to pages (like the homepage) that set no canonical.
 */
export function useCompareSeo({ title, description, path }: CompareSeo) {
  const { i18n } = useTranslation();

  useEffect(() => {
    const url = `${SITE_ORIGIN}${path}`;
    document.title = title;
    document.documentElement.lang = i18n.language.startsWith("fr") ? "fr" : "en";

    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    setCanonical(url);

    return () => {
      setCanonical(`${SITE_ORIGIN}/`);
    };
  }, [title, description, path, i18n.language]);
}

export { SITE_ORIGIN };
