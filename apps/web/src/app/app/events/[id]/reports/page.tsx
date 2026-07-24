"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mep/ui";
import { REPORT_TYPES, labelize } from "@mep/types";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

interface ReportResult {
  columns: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  meta: Record<string, unknown>;
}

export default function ReportsPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const [selected, setSelected] = useState<string>(REPORT_TYPES[0]);

  const report = useQuery({
    queryKey: ["report", eventId, selected],
    queryFn: () => api.get<ReportResult>(`/events/${eventId}/reports/${selected}?format=json`),
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Computed live from your data — export as PDF or CSV."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                api.download(`/events/${eventId}/reports/${selected}?format=csv`, `${selected}.csv`)
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                api.download(`/events/${eventId}/reports/${selected}?format=pdf`, `${selected}.pdf`)
              }
            >
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {REPORT_TYPES.map((type) => (
          <Button
            key={type}
            variant={selected === type ? "default" : "outline"}
            size="sm"
            onClick={() => setSelected(type)}
          >
            {labelize(type)}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labelize(selected)}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.isPending || !report.data ? (
            <Skeleton className="h-64" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {report.data.columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={report.data.columns.length}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No data for this report yet.
                    </TableCell>
                  </TableRow>
                )}
                {report.data.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {report.data.totalsRow && (
                  <TableRow className="font-semibold">
                    {report.data.totalsRow.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
