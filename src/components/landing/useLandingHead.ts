import { useEffect } from "react";

const SAOMA_FAVICON = "/saoma-favicon.svg";
const SAOMA_OG_IMAGE = "/saoma-og-image.svg";
const SAOMA_THEME_COLOR = "#C4B07A";

/**
 * Forces Saoma-branded favicon, theme color, and Open Graph image when the
 * landing pages are rendered through the app's main entry (dev mode or when a
 * deploy serves index.html at /). The standalone landing.html already
 * references these assets statically; this hook ensures parity for the SPA
 * entry without touching the Eïa-branded admin/concierge assets.
 */
export const useLandingHead = () => {
  useEffect(() => {
    const previousIcons: Array<{ el: HTMLLinkElement; href: string }> = [];
    const replaceIcons = (rel: string) => {
      document
        .querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)
        .forEach((link) => {
          previousIcons.push({ el: link, href: link.href });
          link.href = SAOMA_FAVICON;
        });
    };
    replaceIcons("icon");
    replaceIcons("apple-touch-icon");

    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = themeMeta?.content ?? null;
    themeMeta?.setAttribute("content", SAOMA_THEME_COLOR);

    const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    const previousOgImage = ogImage?.content ?? null;
    ogImage?.setAttribute("content", SAOMA_OG_IMAGE);

    const twImage = document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]');
    const previousTwImage = twImage?.content ?? null;
    twImage?.setAttribute("content", SAOMA_OG_IMAGE);

    return () => {
      previousIcons.forEach(({ el, href }) => {
        el.href = href;
      });
      if (previousTheme !== null) themeMeta?.setAttribute("content", previousTheme);
      if (previousOgImage !== null) ogImage?.setAttribute("content", previousOgImage);
      if (previousTwImage !== null) twImage?.setAttribute("content", previousTwImage);
    };
  }, []);
};
