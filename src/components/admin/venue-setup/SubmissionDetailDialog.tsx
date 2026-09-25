import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Archive, Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  useImportSubmission,
  useSetSubmissionStatus,
  useSubmissionData,
  type SubmissionRow,
} from "@/hooks/useVenueSetupSubmissions";
import { collectFilePaths, type SetupData } from "@shared/venueSetup/spec";

interface SubmissionDetailDialogProps {
  submission: SubmissionRow | null;
  onOpenChange: (open: boolean) => void;
}

function count(data: SetupData, key: keyof SetupData): number {
  const v = data[key];
  return Array.isArray(v) ? v.length : 0;
}

export function SubmissionDetailDialog({ submission, onOpenChange }: SubmissionDetailDialogProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const [confirmImport, setConfirmImport] = useState(false);
  const { data, isLoading } = useSubmissionData(submission?.id ?? null);
  const importMutation = useImportSubmission();
  const statusMutation = useSetSubmissionStatus();

  const paths = data ? collectFilePaths(data) : [];
  const { data: signedFiles } = useQuery({
    queryKey: ["venue-setup-files", submission?.id, paths.join("|")],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data: signed, error } = await supabase.storage.from("venue-setup").createSignedUrls(paths, 3600);
      if (error) throw error;
      return signed ?? [];
    },
  });

  if (!submission) return null;
  const hotel = (data?.hotel ?? {}) as Record<string, unknown>;
  const canImport = submission.status === "submitted" || submission.status === "draft";
  const hasVenueName = typeof hotel.name === "string" && hotel.name.trim().length > 0;
  const isDraft = submission.status === "draft";

  const runImport = () => {
    if (!data) return;
    importMutation.mutate(
      { id: submission.id, data },
      {
        onSuccess: (res) => {
          toast.success(t("venueSetup.importDone", { invited: res.invited }));
          if (res.inviteFailures.length > 0) {
            toast.warning(t("venueSetup.inviteFailed", { emails: res.inviteFailures.join(", ") }));
          }
          if (res.fileFailures.length > 0) {
            toast.warning(t("venueSetup.filesFailed", { count: res.fileFailures.length }));
          }
          if (res.skipped.length > 0) {
            toast.warning(t("venueSetup.conciergesSkipped", { emails: res.skipped.join(", ") }));
          }
          onOpenChange(false);
          navigate(`/admin/places/${res.hotelId}`);
        },
        onError: (error) => toast.error(t("venueSetup.importFailed", { message: (error as Error).message })),
      },
    );
  };

  const setStatus = (status: "draft" | "archived") =>
    statusMutation.mutate(
      { id: submission.id, status },
      {
        onSuccess: () => {
          toast.success(t(status === "draft" ? "venueSetup.reopened" : "venueSetup.archived"));
          onOpenChange(false);
        },
        onError: () => toast.error(t("venueSetup.statusFailed")),
      },
    );

  return (
    <>
      <Dialog open={!!submission} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-normal flex items-center gap-2">
              {submission.label}
              <Badge variant="outline">{t(`venueSetup.status.${submission.status}`)}</Badge>
            </DialogTitle>
          </DialogHeader>

          {isLoading || !data ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{t("venueSetup.venue")}</p>
                  <p className="truncate">{String(hotel.name ?? "—")}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{t("venueSetup.rooms")}</p>
                  <p>{count(data, "treatment_rooms")}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{t("venueSetup.amenities")}</p>
                  <p>{count(data, "venue_amenities")}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{t("venueSetup.team")}</p>
                  <p>{count(data, "concierges")}</p>
                </div>
              </div>

              {(signedFiles ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(signedFiles ?? []).map((f) =>
                    f.signedUrl ? (
                      <a
                        key={f.path}
                        href={f.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        {f.path?.split("/").pop()}
                      </a>
                    ) : null,
                  )}
                </div>
              )}

              <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}

          {canImport && data && !hasVenueName && (
            <p className="text-xs text-muted-foreground text-right">{t("venueSetup.importNeedsName")}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
            {submission.status !== "archived" && submission.status !== "imported" && (
              <Button variant="ghost" size="sm" onClick={() => setStatus("archived")} disabled={statusMutation.isPending}>
                <Archive className="h-4 w-4 mr-2" />
                {t("venueSetup.archive")}
              </Button>
            )}
            {(submission.status === "submitted" || submission.status === "archived") && (
              <Button variant="outline" size="sm" onClick={() => setStatus("draft")} disabled={statusMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("venueSetup.reopen")}
              </Button>
            )}
            {canImport && (
              <Button
                size="sm"
                onClick={() => setConfirmImport(true)}
                disabled={!data || !hasVenueName || importMutation.isPending}
                title={!hasVenueName ? t("venueSetup.importNeedsName") : undefined}
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("venueSetup.import")}
              </Button>
            )}
            {submission.status === "imported" && submission.hotel_id && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/places/${submission.hotel_id}`)}>
                {t("venueSetup.openVenue")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmImport} onOpenChange={setConfirmImport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">{t("venueSetup.importConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("venueSetup.importConfirmText", {
                venue: String(hotel.name ?? submission.label),
                org: submission.organizations?.name ?? "",
                rooms: data ? count(data, "treatment_rooms") : 0,
                team: data ? count(data, "concierges") : 0,
              })}
              {isDraft && <span className="block mt-2 text-destructive">{t("venueSetup.importDraftWarning")}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runImport}>{t("venueSetup.import")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
