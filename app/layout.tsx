export const metadata = {
  title: "PCB Hover Viewer",
  description: "Online PCB viewer with hover relation highlighting",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
