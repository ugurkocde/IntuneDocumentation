import nodemailer from "nodemailer";
import { EnterpriseError } from "./domain";
export function appOrigin() {
  const url = new URL(
    process.env.APP_SITE_ORIGIN ??
      process.env.ENTERPRISE_APP_ORIGIN ??
      "http://localhost:3000",
  );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new EnterpriseError(
      503,
      "Secure application origin is not configured.",
    );
  return url.origin;
}
export async function sendEmail(
  to: string[],
  subject: string,
  text: string,
  id: string,
) {
  if (!process.env.ENTERPRISE_SMTP_HOST || !process.env.ENTERPRISE_EMAIL_FROM)
    throw new EnterpriseError(
      503,
      "Email delivery is not configured. Contact support@ugurlabs.com.",
    );
  const transport = nodemailer.createTransport({
    host: process.env.ENTERPRISE_SMTP_HOST,
    port: Number(process.env.ENTERPRISE_SMTP_PORT ?? 465),
    secure: process.env.ENTERPRISE_SMTP_PORT !== "587",
    requireTLS: true,
    auth: {
      user: process.env.ENTERPRISE_SMTP_USER,
      pass: process.env.ENTERPRISE_SMTP_PASSWORD,
    },
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  await transport.sendMail({
    from: process.env.ENTERPRISE_EMAIL_FROM,
    to,
    replyTo: "support@ugurlabs.com",
    subject,
    text,
    messageId: `<${id}@${new URL(appOrigin()).hostname}>`,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
