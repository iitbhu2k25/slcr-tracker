import { Mark } from "@/components/ui";
import { APP_NAME, INSTITUTE, LAB, PROJECT } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth wrap">
      <div className="panel">
        <div className="brand">
          <span className="mark"><Mark /></span>
          <span>
            <span className="eyebrow">{LAB}</span>
            <br />
            <span className="proj">{APP_NAME}</span>
          </span>
        </div>
        <p className="muted small">{PROJECT} · {INSTITUTE}</p>
        {children}
      </div>
    </div>
  );
}
