import * as React from "react";
const cnInput = (...c: Array<string | undefined>) => c.filter(Boolean).join(" ");


export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", ...props }, ref) => (
<input
ref={ref}
className={cnInput(
"h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-400",
className
)}
{...props}
/>
));
Input.displayName = "Input";