"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import s from "./shared.module.css";

export interface NavItem {
  href: string;
  label: string;
}

export default function NavBar({
  items,
  secondaryItems,
}: {
  items: NavItem[];
  secondaryItems: NavItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className={s.nav}>
      <div className={s.navInner}>
        <Link href="/" className={s.navLogo}>
          <Image
            src="/rootlens-wordmark.png"
            alt="RootLens"
            width={439}
            height={146}
            className={s.navLogoImage}
            priority
          />
        </Link>
        <div className={s.navSpacer} />
        <button
          type="button"
          className={s.navBurger}
          aria-expanded={open}
          aria-controls="site-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? "CLOSE" : "MENU"}
        </button>
      </div>
      {open && (
        <div className={s.navMenu} id="site-navigation">
          <div className={s.navMenuMain}>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={s.navMenuLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className={s.navMenuSecondary}>
            {secondaryItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={s.navMenuSecondaryLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
