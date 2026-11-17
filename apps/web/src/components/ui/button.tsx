import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const press =
  "transition-[transform,box-shadow,background-color] duration-150 ease-[cubic-bezier(.3,.7,.4,1.5)] hover:-translate-y-0.5 active:translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-sky/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: `bg-ink text-white shadow-[0_4px_0_#000] active:shadow-[0_1px_0_#000] ${press}`,
        sky: `bg-sky text-white shadow-[0_4px_0_var(--sky-deep)] active:shadow-[0_1px_0_var(--sky-deep)] ${press}`,
        outline: `bg-white text-ink shadow-[0_0_0_1px_var(--border),0_3px_0_var(--border)] hover:bg-sky-soft/40 active:shadow-[0_0_0_1px_var(--border),0_1px_0_var(--border)] ${press}`,
        destructive: `bg-destructive text-white shadow-[0_4px_0_#9b1c26] active:shadow-[0_1px_0_#9b1c26] ${press}`,
        ghost: "text-foreground transition-colors hover:bg-sky-soft active:bg-sky-soft/70",
        link: "rounded-none text-sky-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
