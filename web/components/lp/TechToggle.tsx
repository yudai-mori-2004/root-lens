"use client";

import { useState } from "react";
import s from "./lp.module.css";

export default function TechToggle({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={s.techDetails}>
      <button
        className={s.techToggle}
        data-open={open}
        onClick={() => setOpen(!open)}
      >
        {title}
      </button>
      {open && children}
    </div>
  );
}
