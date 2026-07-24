import { Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceStatus, InvitationStatus, RsvpStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";
import { findColumnIndex, parseCsv, toCsv } from "../../common/utils/csv";

type GuestInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  groupId?: number | null;
  household?: string | null;
  accompanyingCount: number;
  invitationStatus: InvitationStatus;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  tableName?: string | null;
  dietary?: string | null;
  allergies?: string | null;
  accessibility?: string | null;
  notes?: string | null;
};

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: { row: number; message: string }[];
}

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    userId: bigint,
    eventId: bigint,
    filter: { q?: string; rsvpStatus?: string; invitationStatus?: string; groupId?: number } = {},
  ) {
    await this.access.assertEventAccess(userId, eventId);
    const [guests, groups] = await Promise.all([
      this.prisma.guest.findMany({
        where: {
          eventId,
          rsvpStatus: filter.rsvpStatus as never,
          invitationStatus: filter.invitationStatus as never,
          groupId: filter.groupId != null ? BigInt(filter.groupId) : undefined,
          OR: filter.q
            ? [
                { firstName: { contains: filter.q, mode: "insensitive" } },
                { lastName: { contains: filter.q, mode: "insensitive" } },
                { email: { contains: filter.q, mode: "insensitive" } },
                { household: { contains: filter.q, mode: "insensitive" } },
              ]
            : undefined,
        },
        include: { group: { select: { id: true, name: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      this.prisma.guestGroup.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    ]);
    // Stats always describe the whole event, not the filtered view.
    const hasFilter =
      filter.q != null ||
      filter.rsvpStatus != null ||
      filter.invitationStatus != null ||
      filter.groupId != null;
    const statRows = hasFilter
      ? await this.prisma.guest.findMany({
          where: { eventId },
          select: { rsvpStatus: true, accompanyingCount: true },
        })
      : guests;
    const stats = {
      total: statRows.length,
      accepted: statRows.filter((g) => g.rsvpStatus === "accepted").length,
      declined: statRows.filter((g) => g.rsvpStatus === "declined").length,
      pending: statRows.filter((g) => g.rsvpStatus === "pending" || g.rsvpStatus === "no_response")
        .length,
      totalAttending: statRows
        .filter((g) => g.rsvpStatus === "accepted")
        .reduce((sum, g) => sum + 1 + g.accompanyingCount, 0),
    };
    return { guests, groups, stats };
  }

  async create(userId: bigint, eventId: bigint, input: GuestInput) {
    await this.access.assertEventWrite(userId, eventId);
    return this.prisma.guest.create({
      data: {
        eventId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone ?? null,
        groupId: input.groupId != null ? BigInt(input.groupId) : null,
        household: input.household ?? null,
        accompanyingCount: input.accompanyingCount,
        invitationStatus: input.invitationStatus,
        rsvpStatus: input.rsvpStatus,
        attendanceStatus: input.attendanceStatus,
        tableName: input.tableName ?? null,
        dietary: input.dietary ?? null,
        allergies: input.allergies ?? null,
        accessibility: input.accessibility ?? null,
        notes: input.notes ?? null,
        createdById: userId,
      },
    });
  }

  async update(userId: bigint, eventId: bigint, guestId: bigint, input: GuestInput) {
    await this.access.assertEventWrite(userId, eventId);
    const updated = await this.prisma.guest.updateMany({
      where: { id: guestId, eventId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone ?? null,
        groupId: input.groupId != null ? BigInt(input.groupId) : null,
        household: input.household ?? null,
        accompanyingCount: input.accompanyingCount,
        invitationStatus: input.invitationStatus,
        rsvpStatus: input.rsvpStatus,
        attendanceStatus: input.attendanceStatus,
        tableName: input.tableName ?? null,
        dietary: input.dietary ?? null,
        allergies: input.allergies ?? null,
        accessibility: input.accessibility ?? null,
        notes: input.notes ?? null,
      },
    });
    if (updated.count === 0) throw new NotFoundException("Guest not found");
    return { ok: true };
  }

  async remove(userId: bigint, eventId: bigint, guestId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    await this.prisma.guest.deleteMany({ where: { id: guestId, eventId } });
    return { ok: true };
  }

  async createGroup(userId: bigint, eventId: bigint, name: string) {
    await this.access.assertEventWrite(userId, eventId);
    return this.prisma.guestGroup.create({ data: { eventId, name } });
  }

  /**
   * CSV import. Header-based column mapping; duplicates are detected per
   * (lowercased first+last name, email when present); bad rows are reported
   * individually without aborting the import.
   */
  async importCsv(
    userId: bigint,
    eventId: bigint,
    csvText: string,
    dryRun = false,
  ): Promise<ImportResult> {
    const event = await this.access.assertEventWrite(userId, eventId);
    const rows = parseCsv(csvText);
    if (rows.length < 2)
      return { imported: 0, duplicates: 0, errors: [{ row: 1, message: "No data rows found" }] };

    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const colFirst = findColumnIndex(header, ["first name", "firstname", "first_name", "vorname"]);
    const colLast = findColumnIndex(header, [
      "last name",
      "lastname",
      "last_name",
      "nachname",
      "surname",
    ]);
    const colEmail = findColumnIndex(header, ["email", "e-mail", "mail"]);
    const colPhone = findColumnIndex(header, ["phone", "telephone", "tel", "mobile"]);
    const colGroup = findColumnIndex(header, ["group", "gruppe", "category"]);
    const colHousehold = findColumnIndex(header, ["household", "family", "haushalt"]);
    const colAccomp = findColumnIndex(header, [
      "accompanying",
      "accompanyingcount",
      "plus ones",
      "begleitung",
    ]);
    const colDietary = findColumnIndex(header, ["dietary", "diet", "essen"]);
    const colNotes = findColumnIndex(header, ["notes", "note", "notizen"]);

    if (colFirst === -1 || colLast === -1) {
      return {
        imported: 0,
        duplicates: 0,
        errors: [{ row: 1, message: "CSV must contain 'first name' and 'last name' columns" }],
      };
    }

    const existing = await this.prisma.guest.findMany({
      where: { eventId },
      select: { firstName: true, lastName: true, email: true },
    });
    const seen = new Set(
      existing.map(
        (g) =>
          `${g.firstName.toLowerCase()}|${g.lastName.toLowerCase()}|${(g.email ?? "").toLowerCase()}`,
      ),
    );

    const groups = new Map<string, bigint>();
    const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      const firstName = (row[colFirst] ?? "").trim();
      const lastName = (row[colLast] ?? "").trim();
      if (!firstName || !lastName) {
        result.errors.push({ row: r + 1, message: "Missing first or last name" });
        continue;
      }
      const email = (colEmail !== -1 ? row[colEmail] : "")?.trim() ?? "";
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${email.toLowerCase()}`;
      if (seen.has(key)) {
        result.duplicates++;
        continue;
      }
      seen.add(key);

      let groupId: bigint | null = null;
      const groupName = (colGroup !== -1 ? row[colGroup] : "")?.trim() ?? "";
      if (groupName) {
        const cached = groups.get(groupName.toLowerCase());
        if (cached) {
          groupId = cached;
        } else {
          // Dry runs never write — groups are only resolved, not created.
          const found = await this.prisma.guestGroup.findFirst({
            where: { eventId, name: groupName },
          });
          if (found) {
            groups.set(groupName.toLowerCase(), found.id);
            groupId = found.id;
          } else if (!dryRun) {
            const group = await this.prisma.guestGroup.create({
              data: { eventId, name: groupName },
            });
            groups.set(groupName.toLowerCase(), group.id);
            groupId = group.id;
          }
        }
      }

      const accompRaw = (colAccomp !== -1 ? row[colAccomp] : "")?.trim() ?? "";
      const accompanyingCount = accompRaw ? Math.max(0, parseInt(accompRaw, 10) || 0) : 0;

      if (dryRun) {
        result.imported++;
        continue;
      }
      await this.prisma.guest.create({
        data: {
          eventId,
          firstName,
          lastName,
          email: email || null,
          phone: (colPhone !== -1 ? row[colPhone] : "")?.trim() || null,
          groupId,
          household: (colHousehold !== -1 ? row[colHousehold] : "")?.trim() || null,
          accompanyingCount,
          dietary: (colDietary !== -1 ? row[colDietary] : "")?.trim() || null,
          notes: (colNotes !== -1 ? row[colNotes] : "")?.trim() || null,
          createdById: userId,
        },
      });
      result.imported++;
    }

    if (!dryRun) {
      await this.audit.log({
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "guests.import_csv",
        resourceType: "event",
        resourceId: eventId,
        metadata: {
          imported: result.imported,
          duplicates: result.duplicates,
          errors: result.errors.length,
        },
      });
    }
    return result;
  }

  /** Downloadable CSV template matching the import column mapping. */
  async importTemplate(userId: bigint, eventId: bigint): Promise<string> {
    await this.access.assertEventAccess(userId, eventId);
    return toCsv(
      [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Group",
        "Household",
        "Accompanying",
        "Dietary",
        "Notes",
      ],
      [
        [
          "Jane",
          "Doe",
          "jane@example.com",
          "+49 170 1234567",
          "Family",
          "Doe family",
          "1",
          "Vegetarian",
          "Aunt of the bride",
        ],
        ["Max", "Smith", "", "", "Friends", "", "0", "", ""],
      ],
    );
  }

  async exportCsv(userId: bigint, eventId: bigint): Promise<string> {
    await this.access.assertEventAccess(userId, eventId);
    const guests = await this.prisma.guest.findMany({
      where: { eventId },
      include: { group: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return toCsv(
      [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Group",
        "Household",
        "Accompanying",
        "Invitation",
        "RSVP",
        "Attendance",
        "Table",
        "Dietary",
        "Allergies",
        "Notes",
      ],
      guests.map((g) => [
        g.firstName,
        g.lastName,
        g.email,
        g.phone,
        g.group?.name,
        g.household,
        g.accompanyingCount,
        g.invitationStatus,
        g.rsvpStatus,
        g.attendanceStatus,
        g.tableName,
        g.dietary,
        g.allergies,
        g.notes,
      ]),
    );
  }
}
