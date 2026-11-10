import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Вакансия голосом — Лаб ПИИ",
  description: "Расскажите о будущей роли — и получите черновик вакансии."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
