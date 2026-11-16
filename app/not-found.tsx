import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingBlock: 48 }}>
      <div className="empty">
        <h3>Page not found</h3>
        <p>The page or record you asked for doesn&apos;t exist, or isn&apos;t yours to view.</p>
        <Link className="btn" href="/">Go to the start page</Link>
      </div>
    </main>
  );
}
