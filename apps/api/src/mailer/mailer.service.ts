import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Mailer abstraction. EMAIL_PROVIDER selects the transport:
 * console (dev default), resend (RESEND_API_KEY), or smtp (SMTP_URL).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger("Mailer");
  private smtp: Transporter | null = null;
  private resend: Resend | null = null;

  constructor() {
    if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_URL) {
      this.smtp = nodemailer.createTransport(env.SMTP_URL);
    } else if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY);
    }
  }

  get provider(): string {
    return env.EMAIL_PROVIDER;
  }

  async send(message: MailMessage): Promise<{ delivered: boolean; provider: string }> {
    const provider = env.EMAIL_PROVIDER;
    try {
      if (provider === "resend" && this.resend) {
        const { error } = await this.resend.emails.send({
          from: env.EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        if (error) throw new Error(error.message);
        return { delivered: true, provider };
      }
      if (provider === "smtp" && this.smtp) {
        await this.smtp.sendMail({
          from: env.EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return { delivered: true, provider };
      }
    } catch (err) {
      this.logger.error(`Mail send failed via ${provider}: ${(err as Error).message}`);
      return { delivered: false, provider };
    }
    this.logger.log(`[console mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return { delivered: true, provider: "console" };
  }
}
