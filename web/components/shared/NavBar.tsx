"use client";

import { usePathname } from "next/navigation";
import s from "./shared.module.css";

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className={s.nav}>
      <div className={s.navInner}>
        <a href="/" className={s.navLogo}>
          RootLens
        </a>
        <a
          href="/technology"
          className={`${s.navLink} ${pathname === "/technology" ? s.navLinkActive : ""}`}
        >
          Technology
        </a>
      </div>
    </nav>
  );
}
