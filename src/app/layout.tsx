import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import SessionGuard from "@/components/SessionGuard";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import InstallPrompt from "@/components/InstallPrompt";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Effutu Dream Election Monitoring Portal | Conadu Solutions",
  description: "Real-time election monitoring and polling station analytics for Effutu Constituency, Central Region, Ghana",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ElecMonitor",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full flex flex-col font-sans" suppressHydrationWarning>
        <SessionProvider refetchInterval={60} refetchOnWindowFocus={true}>
          <SessionGuard />
          {children}
        </SessionProvider>
        <ServiceWorkerRegistration />
        <InstallPrompt />
        <Toaster position="top-right" richColors closeButton duration={4000} />
      </body>
    </html>
  );
}
