import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { MailerModule } from "./mailer/mailer.module";
import { StorageModule } from "./storage/storage.module";
import { AuditModule } from "./audit/audit.module";
import { QueueModule } from "./queue/queue.module";
import { AccessModule } from "./common/access/access.module";
import { SessionAuthGuard } from "./common/guards/session-auth.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { EventsModule } from "./modules/events/events.module";
import { BudgetModule } from "./modules/budget/budget.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { VendorsModule } from "./modules/vendors/vendors.module";
import { GuestsModule } from "./modules/guests/guests.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { TimelineModule } from "./modules/timeline/timeline.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ContactModule } from "./modules/contact/contact.module";
import { HealthModule } from "./modules/health/health.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { RetentionModule } from "./retention/retention.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    MailerModule,
    StorageModule,
    AuditModule,
    QueueModule,
    AccessModule,
    AuthModule,
    WorkspacesModule,
    EventsModule,
    BudgetModule,
    ExpensesModule,
    PaymentsModule,
    VendorsModule,
    GuestsModule,
    TasksModule,
    TimelineModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
    ContactModule,
    HealthModule,
    DashboardModule,
    CalendarModule,
    RetentionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AppModule {}
