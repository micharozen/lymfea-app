import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useUser } from "@/contexts/UserContext";
import { TicketTable } from "@/components/admin/support/TicketTable";
import { CreateTicketDialog } from "@/components/admin/support/CreateTicketDialog";
import type { Ticket } from "@/components/admin/support/TicketTable";

export default function SupportTickets() {
  const { t } = useTranslation("admin");
  const { isAdmin } = useUser();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const { headerRef, itemsPerPage } = useLayoutCalculation();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(t("support.toast.loadError"));
      setLoading(false);
      return;
    }

    setTickets((data as Ticket[]) || []);
    setLoading(false);
  };

  const openTickets = useMemo(
    () => tickets.filter((t) => t.status === "open" || t.status === "in_progress"),
    [tickets]
  );

  const closedTickets = useMemo(
    () => tickets.filter((t) => t.status === "resolved" || t.status === "closed"),
    [tickets]
  );

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus })
      .eq("id", ticketId);

    if (error) {
      toast.error(t("support.toast.statusError"));
      return;
    }

    toast.success(t("support.toast.statusUpdated"));
    fetchTickets();
  };

  const sectionItemsPerPage = Math.max(5, Math.floor(itemsPerPage / 2));

  return (
    <div className="bg-background min-h-0">
      <div className="px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-gold-600" />
              {t("support.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("support.description")}
            </p>
          </div>
          <Button className="flex-shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("support.createTicket")}
          </Button>
        </div>
      </div>

      <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-6">
        {/* Open Tickets */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {t("support.openTickets")}
              <span className="text-xs font-normal text-muted-foreground">
                ({openTickets.length})
              </span>
            </h2>
          </div>
          <TicketTable
            tickets={openTickets}
            loading={loading}
            isAdmin={isAdmin}
            onStatusChange={handleStatusChange}
            onCreateClick={() => setCreateOpen(true)}
            emptyMessage={t("support.emptyOpen")}
            emptyActionLabel={t("support.createTicket")}
            itemsPerPage={sectionItemsPerPage}
          />
        </div>

        {/* Closed Tickets */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {t("support.closedTickets")}
              <span className="text-xs font-normal text-muted-foreground">
                ({closedTickets.length})
              </span>
            </h2>
          </div>
          <TicketTable
            tickets={closedTickets}
            loading={loading}
            isAdmin={isAdmin}
            showClosedAt
            onStatusChange={handleStatusChange}
            onCreateClick={() => setCreateOpen(true)}
            emptyMessage={t("support.emptyClosed")}
            emptyActionLabel={t("support.createTicket")}
            itemsPerPage={sectionItemsPerPage}
          />
        </div>
      </div>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchTickets}
      />
    </div>
  );
}
