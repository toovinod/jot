import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-sky/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-ink text-white [a&]:hover:bg-ink/85",
        secondary: "bg-sky-soft text-sky-deep [a&]:hover:bg-sky [a&]:hover:text-white",
        destructive: "bg-destructive/10 text-destructive [a&]:hover:bg-destructive/15",
        outline:
          "border-border bg-white text-foreground [a&]:hover:bg-sky-soft [a&]:hover:text-foreground",
        ghost: "text-muted-foreground [a&]:hover:bg-sky-soft [a&]:hover:text-foreground",
        link: "text-sky-deep underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
