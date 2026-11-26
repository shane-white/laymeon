import { Archivo, Michroma } from "next/font/google";

const display = Michroma({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const text = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-text",
});

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${display.variable} ${text.variable}`}>{children}</div>
  );
}
