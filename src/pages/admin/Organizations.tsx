import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, Pencil, Search, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { AddOrganizationDialog } from "@/components/admin/AddOrganizationDialog";
import { EditOrganizationDialog } from "@/components/admin/EditOrganizationDialog";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { useDialogState } from "@/hooks/useDialogState";
import { cn } from "@/lib/utils";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  created_at: string;
  hotel_count: number;
  admin_count: number;
}

export default function Organizations() {
  const { isSuperAdmin, loading: userLoading } = useUser();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    isAddOpen,
    openAdd,
    closeAdd,
    editId,
    openEdit,
    closeEdit,
    deleteId,
    openDelete,
    closeDelete,
  } = useDialogState<string>();

  const fetchOrgs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, logo_url, contact_email, created_at, hotels:hotels(count), admins:admins(count)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des organisations");
      console.error(error);
      setLoading(false);
      return;
    }

    type OrgWithCounts = {
      id: string;
      name: string;
      slug: string;
      logo_url: string | null;
      contact_email: string | null;
      created_at: string;
      hotels?: { count: number }[];
      admins?: { count: number }[];
    };

    const mapped: OrganizationRow[] = ((data ?? []) as OrgWithCounts[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      logo_url: row.logo_url,
      contact_email: row.contact_email,
      created_at: row.created_at,
      hotel_count: row.hotels?.[0]?.count ?? 0,
      admin_count: row.admins?.[0]?.count ?? 0,
    }));
    setOrgs(mapped);
    setLoading(false);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchOrgs();
  }, [isSuperAdmin]);

  const filtered = useMemo(() => {
    if (!searchQuery) return orgs;
    const q = searchQuery.toLowerCase();
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q) ||
        (o.contact_email ?? "").toLowerCase().includes(q),
    );
  }, [orgs, searchQuery]);

  const editing = editId ? orgs.find((o) => o.id === editId) ?? null : null;
  const deleting = deleteId ? orgs.find((o) => o.id === deleteId) ?? null : null;

  if (userLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;

  const handleDelete = async () => {
    if (!deleting) return;
    if (deleting.hotel_count > 0) {
      toast.error(`Impossible : ${deleting.hotel_count} hôtel(s) rattaché(s) à cette organisation`);
      closeDelete();
      return;
    }
    const { error } = await supabase.from("organizations").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Suppression impossible");
      console.error(error);
      return;
    }
    toast.success("Organisation supprimée");
    closeDelete();
    fetchOrgs();
  };

  return (
    <div className="bg-background flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            Organisations
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Gérez les groupes hôteliers clients de Lymfea.
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6">
        <div className="bg-card rounded-lg border border-border flex flex-col">
          <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="ml-auto" onClick={openAdd}>
              Nouvelle organisation
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table className="text-sm w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Logo</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Hôtels</TableHead>
                  <TableHead className="text-right">Admins</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {loading && <TableSkeleton columns={7} rows={5} />}
              {!loading && filtered.length === 0 && (
                <TableEmptyState
                  colSpan={7}
                  message={searchQuery ? "Aucun résultat" : "Aucune organisation. Créez-en une pour démarrer."}
                />
              )}
              {!loading && filtered.length > 0 && (
                <TableBody>
                  {filtered.map((org) => (
                    <TableRow
                      key={org.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/organizations/${org.id}`)}
                    >
                      <TableCell>
                        <div className="h-8 w-8 rounded overflow-hidden bg-muted flex items-center justify-center">
                          {org.logo_url ? (
                            <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                      <TableCell className="text-muted-foreground">{org.contact_email ?? "—"}</TableCell>
                      <TableCell className="text-right">{org.hotel_count}</TableCell>
                      <TableCell className="text-right">{org.admin_count}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(org.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("text-destructive hover:text-destructive")}
                            onClick={() => openDelete(org.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </div>
        </div>
      </div>

      <AddOrganizationDialog open={isAddOpen} onClose={closeAdd} onSuccess={fetchOrgs} />
      <EditOrganizationDialog
        open={!!editing}
        organization={editing}
        onClose={closeEdit}
        onSuccess={fetchOrgs}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette organisation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'organisation « {deleting?.name} » sera définitivement
              supprimée. Les hôtels rattachés doivent être retirés au préalable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
