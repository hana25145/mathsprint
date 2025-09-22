import * as React from "react";


const cn = (...c: Array<string | undefined>) => c.filter(Boolean).join(" ");


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
variant?: "default" | "outline" | "ghost";
size?: "sm" | "md" | "lg" | "icon";
}


export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
({ className = "", variant = "default", size = "md", ...props }, ref) => {
const base =
"inline-flex items-center justify-center rounded-xl font-medium shadow-sm transition active:scale-[.98] disabled:opacity-50";
const variants: Record<string, string> = {
default: "bg-slate-900 text-white hover:bg-slate-800",
outline: "border border-slate-300 hover:bg-slate-50",
ghost: "hover:bg-slate-100",
};
const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
sm: "h-8 px-3 text-xs",
md: "h-10 px-4 text-sm",
lg: "h-12 px-5 text-base",
icon: "h-10 w-10 p-0 text-sm",
};
return (
<button
ref={ref}
className={cn(base, variants[variant], sizes[size], className)}
{...props}
/>
);
}
);
Button.displayName = "Button";