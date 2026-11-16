import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavTabs } from "@/components/forms";
import { Avatar, Mark } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { INSTITUTE, LAB, PROJECT } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link className="brand" href="/">
            <span className="mark"><Mark /></span>
            <span>
              <span className="eyebrow">SLCR · IIT (BHU) Varanasi · Daily progress</span>
              <br />
              <span className="proj">{PROJECT}</span>
            </span>
          </Link>
          {me && (
            <div className="who">
              <div className="meta">
                <div className="n">{me.name}</div>
                <span className="role">{me.role === "admin" ? "Admin · PI" : me.designation || "Staff"}</span>
              </div>
              <Avatar user={me} />
              <form action={logoutAction} className="logout">
                <button className="btn sm">Sign out</button>
              </form>
            </div>
          )}
        </div>
      </header>
      {me && !me.must_change_pw && <NavTabs role={me.role} />}
      <main className="wrap">{children}</main>
      <footer className="foot">
        <div className="wrap">
          <span>{LAB} · {INSTITUTE}</span>
          <span>
            {me?.role === "admin"
              ? "Administrator view: all staff records are visible."
              : me
                ? "Your records are visible only to you and the Principal Investigator."
                : ""}
          </span>
        </div>
      </footer>
    </>
  );
}
