import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const styles = cva("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90", secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80", outline: "border border-input bg-background hover:bg-muted", ghost: "hover:bg-muted", destructive: "bg-destructive text-white hover:bg-destructive/90" },
    size: { default: "h-10 px-4", sm: "h-9 rounded-md px-3", lg: "h-12 px-5 text-base", icon: "size-10" },
  }, defaultVariants: { variant: "default", size: "default" },
});
type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles>;
export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(styles({ variant, size }), className)} {...props} />;
}
