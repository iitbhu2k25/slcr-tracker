import { APP_NAME, INSTITUTE, LAB, PROJECT } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <header className="auth-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-logo" src="/slcr-logo.png" alt="SLCR" width={238} height={65} />
          <h1>{APP_NAME}</h1>
          <p className="muted small">{LAB}</p>
        </header>
        {children}
      </div>
      <footer className="auth-foot muted">
        {PROJECT}
        <br />
        {INSTITUTE}
      </footer>
    </main>
  );
}
