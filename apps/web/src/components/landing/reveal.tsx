"use client";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useSession } from "@/components/providers";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Where "start writing" goes: a new page for writers, signup for everyone else. */
export function useStartHref() {
  const { user } = useSession();
  return user ? "/editor/new" : "/signup";
}
