import { Fraunces, Geist_Mono } from "next/font/google";

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  axes: ["SOFT", "opsz"],
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const fontVariables = [serif, mono].map((font) => font.variable).join(" ");
