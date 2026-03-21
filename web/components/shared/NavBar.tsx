"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";
import s from "./shared.module.css";

const DEMO_URL = "/p/demo";

const NAV_ITEMS = [
  { href: "/technology", labelKey: "technology" },
  { href: "/why", labelKey: "why" },
  { href: "/developers", labelKey: "developers" },
  { href: "/about", labelKey: "about" },
] as const;

export default function NavBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className={s.nav}>
      <div className={s.navInner}>
        <a href="/" className={s.navLogo}>
          RootLens
        </a>

        {/* Desktop nav */}
        <div className={s.navLinks}>
          {NAV_ITEMS.map(({ href, labelKey }) => (
            <a
              key={href}
              href={href}
              className={`${s.navLink} ${pathname === href ? s.navLinkActive : ""}`}
            >
              {t(labelKey)}
            </a>
          ))}
        </div>

        <div className={s.navActions}>
          <a href={DEMO_URL} className={s.navCta}>
            {t("demo")}
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className={s.navHamburger}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={s.hamburgerLine} />
          <span className={s.hamburgerLine} />
          <span className={s.hamburgerLine} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={s.mobileMenu}>
          {NAV_ITEMS.map(({ href, labelKey }) => (
            <a key={href} href={href} className={s.mobileMenuLink}>
              {t(labelKey)}
            </a>
          ))}
          <a href={DEMO_URL} className={s.mobileMenuCta}>
            {t("demo")}
          </a>
        </div>
      )}
    </nav>
  );
}
