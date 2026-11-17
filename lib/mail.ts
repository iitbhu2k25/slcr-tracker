import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { headers } from "next/headers";
import { APP_NAME, INSTITUTE, LAB } from "./config";

const G = globalThis as unknown as { _slcrMail?: Transporter };

function transporter(): Transporter | null {
  const user = process.env.MAIL_USERNAME;
  const pass = process.env.MAIL_PASSWORD;
  if (!user || !pass) return null;
  if (!G._slcrMail) {
    G._slcrMail = nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } });
  }
  return G._slcrMail;
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(s);
}

/** Public base URL of the app: APP_URL if set, otherwise the host of the current request. */
async function appUrl(): Promise<string> {
  const fromEnv = process.env.APP_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type MailResult = { sent: true } | { sent: false; error: string };

/** Emails a person their username and one-time password. Never throws. */
export async function sendCredentialsEmail(opts: {
  to: string; name: string; username: string; password: string; role: "admin" | "staff"; reset?: boolean;
}): Promise<MailResult> {
  const t = transporter();
  if (!t) return { sent: false, error: "Email is not configured (MAIL_USERNAME / MAIL_PASSWORD)." };
  try {
    const url = await appUrl();
    const loginUrl = `${url}/login`;
    const roleText = opts.role === "admin" ? "an administrator" : "a staff member";
    const intro = opts.reset
      ? `Your password for the ${APP_NAME} has been reset by the administrator.`
      : `An account has been created for you on the ${APP_NAME} as ${roleText}.`;
    const subject = opts.reset ? `${APP_NAME}: your password has been reset` : `${APP_NAME}: your account details`;

    const text = [
      `Dear ${opts.name},`,
      "",
      intro,
      "",
      `Sign in at: ${loginUrl}`,
      `Username:   ${opts.username}`,
      `One-time password: ${opts.password}`,
      "",
      "This password works only until you sign in for the first time. You will then be asked to choose your own new password.",
      "Please do not share these details with anyone.",
      "",
      `${LAB}`,
      `${INSTITUTE}`,
    ].join("\n");

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2933;line-height:1.5;max-width:560px">
  <p>Dear ${esc(opts.name)},</p>
  <p>${esc(intro)}</p>
  <table style="border-collapse:collapse;margin:16px 0;background:#f4f6f8;border-radius:6px">
    <tr><td style="padding:8px 14px;color:#52606d">Username</td><td style="padding:8px 14px"><code style="font-size:16px">${esc(opts.username)}</code></td></tr>
    <tr><td style="padding:8px 14px;color:#52606d">One-time password</td><td style="padding:8px 14px"><code style="font-size:16px">${esc(opts.password)}</code></td></tr>
  </table>
  <p><a href="${esc(loginUrl)}" style="display:inline-block;background:#0b6e4f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Sign in</a></p>
  <p>When you sign in for the first time you will be asked to choose your own new password. Please do not share these details with anyone.</p>
  <p style="color:#7b8794;font-size:13px">${esc(LAB)}<br>${esc(INSTITUTE)}</p>
</div>`;

    await t.sendMail({
      from: { name: APP_NAME, address: process.env.MAIL_USERNAME! },
      to: { name: opts.name, address: opts.to },
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error("sendCredentialsEmail failed:", e);
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
