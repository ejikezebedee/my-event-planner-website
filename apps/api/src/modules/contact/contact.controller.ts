import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { contactSchema } from "@mep/validation";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueService } from "../../queue/queue.service";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { env } from "../../config/env";

@ApiTags("contact")
@Controller({ path: "contact", version: "1" })
export class ContactController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @Throttle({ default: { limit: env.CONTACT_RATE_LIMIT, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async submit(@Body(new ZodValidationPipe(contactSchema)) body: unknown) {
    const input = body as {
      name: string;
      email: string;
      subject: string;
      message: string;
      consent: boolean;
      website?: string;
    };
    // Honeypot: a filled hidden field means a bot. Pretend success so the
    // sender learns nothing, but persist and deliver nothing.
    if (input.website) {
      return { ok: true, message: "Thank you — we will get back to you shortly." };
    }
    await this.prisma.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        consent: input.consent,
      },
    });
    await this.queue.enqueueEmail({
      to: env.CONTACT_EMAIL,
      subject: `Contact form: ${input.subject}`,
      text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    });
    return { ok: true, message: "Thank you — we will get back to you shortly." };
  }
}
