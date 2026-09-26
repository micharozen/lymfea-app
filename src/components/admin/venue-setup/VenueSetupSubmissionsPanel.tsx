import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  setupLink,
  useCreateSubmission,
  useVenueSetupSubmissions,
  type SubmissionRow,
} from "@/hooks/useVenueSetupSubmissions";
import { SubmissionDetailDialog } from "./SubmissionDetailDialog";

interface VenueSetupSubmissionsPanelProps {
  /** Restricts the list to one organization and enables link creation. */
  organizationId?: string;
}

const STATUS_VARIANT: Record<SubmissionRow["status"], "default" | "secondary" | "outline"> = {
  draft: "outline",
  submitted: "default",
  imported: "secondary",
  archived: "outline",
};

async function copyLink(token: string, message: string) {
  await navigator.clipboard.writeText(setupLink(token));
  toast.success(message);
}

export function VenueSetupSubmissionsPanel({ organizationId }: VenueSetupSubmissionsPanelProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { data: rows = [], isLoading } = useVenueSetupSubmissions(organizationId);
  const createMutation = useCreateSubmission();
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [selected, setSelected] = useState<SubmissionRow | null>(null);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB") : "—";

  // launch_date is a calendar day (no time zone): parse it as local midnight.
  const formatDay = (day: string | null) => (day ? formatDate(`${day}T00:00:00`) : "—");

  const canCreate = !!label.trim() && !!launchDate;

  const create = () => {
    if (!organizationId || !canCreate) return;
    createMutation.mutate(
      { organizationId, label: label.trim(), launchDate },
      {
        onSuccess: async (token) => {
          setCreateOpen(false);
          setLabel("");
          setLaunchDate("");
          await copyLink(token, t("venueSetup.linkCreated"));
        },
        onError: () => toast.error(t("venueSetup.createFailed")),
      },
    );
  };

  return (
    <div className="bg-card rounded-lg border border-border">
      {organizationId && (
        <div className="p-3 border-b border-border flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("venueSetup.newLink")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("venueSetup.empty")}</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer"
              onClick={() => setSelected(row)}
            >
              <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{row.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {!organizationId && row.organizations?.name ? `${row.organizations.name} · ` : ""}
                  {row.submitted_at
                    ? t("venueSetup.submittedOn", { date: formatDate(row.submitted_at) })
                    : t("venueSetup.createdOn", { date: formatDate(row.created_at) })}
                  {row.launch_date && ` · ${t("venueSetup.launchOn", { date: formatDay(row.launch_date) })}`}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[row.status]}>{t(`venueSetup.status.${row.status}`)}</Badge>
              {row.status === "draft" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("venueSetup.copyLink")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyLink(row.token, t("venueSetup.linkCopied"));
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-normal">{t("venueSetup.newLink")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="setup-label" className="font-normal">
              {t("venueSetup.label")}
            </Label>
            <Input
              id="setup-label"
              value={label}
              placeholder={t("venueSetup.labelPlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <p className="text-xs text-muted-foreground">{t("venueSetup.labelHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-launch-date" className="font-normal">
              {t("venueSetup.launchDate")}
            </Label>
            <Input
              id="setup-launch-date"
              type="date"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("venueSetup.launchDateHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("common:buttons.cancel")}
            </Button>
            <Button onClick={create} disabled={!canCreate || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("venueSetup.createAndCopy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubmissionDetailDialog submission={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
