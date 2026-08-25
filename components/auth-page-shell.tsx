import Image from "next/image";
import type { ReactNode } from "react";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="login-page">
      <section
        className="login-brand"
        aria-label="Eastern International University"
      >
        <Image
          className="login-brand-image"
          src="/login-cover-campus-2.jpg"
          alt="Khuôn viên Trường Đại học Quốc tế Miền Đông"
          fill
          priority
          sizes="100vh"
        />
      </section>
      <Image
        className="login-corner-logo"
        src="/eiu-corner-logo.png"
        alt="Eastern International University"
        width={190}
        height={190}
        sizes="(max-width: 900px) 160px, 1px"
      />
      <section className="login-form-wrap">{children}</section>
    </main>
  );
}
