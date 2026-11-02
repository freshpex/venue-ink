import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, PointerEvent } from "react";
const variants = cva("button", {
  variants: {
    variant: {
      default: "button-lime",
      dark: "button-dark",
      outline: "button-outline",
      ghost: "button-ghost",
    },
    size: { default: "", small: "button-small" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  onPointerMove,
  onPointerLeave,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={twMerge(clsx(variants({ variant, size }), className))}
      onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
        if (
          event.pointerType === "mouse" &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty(
            "--magnet-x",
            `${(event.clientX - rect.left - rect.width / 2) * 0.1}px`,
          );
          event.currentTarget.style.setProperty(
            "--magnet-y",
            `${(event.clientY - rect.top - rect.height / 2) * 0.1}px`,
          );
        }
        onPointerMove?.(event);
      }}
      onPointerLeave={(event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.style.setProperty("--magnet-x", "0px");
        event.currentTarget.style.setProperty("--magnet-y", "0px");
        onPointerLeave?.(event);
      }}
      {...props}
    />
  );
}
