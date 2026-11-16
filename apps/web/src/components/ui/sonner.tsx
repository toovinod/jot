"use client";

import { CheckCircle, CircleNotch, Info, Warning, WarningOctagon } from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CheckCircle weight="fill" className="size-4 text-grass-3" />,
        info: <Info weight="fill" className="size-4 text-sky-deep" />,
        warning: <Warning weight="fill" className="size-4 text-amber-500" />,
        error: <WarningOctagon weight="fill" className="size-4 text-destructive" />,
        loading: <CircleNotch weight="bold" className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
