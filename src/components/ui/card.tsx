import * as React from "react";
const cnCard = (...c: Array<string | undefined>) => c.filter(Boolean).join(" ");


export const Card = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cnCard("rounded-2xl border border-slate-200 bg-white shadow-sm", className)} {...props} />
);
export const CardHeader = (props: React.HTMLAttributes<HTMLDivElement>) => <div className="border-b border-slate-100 p-4" {...props} />;
export const CardTitle = (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-lg font-semibold" {...props} />;
export const CardContent = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cnCard("p-4", className)} {...props} />
);