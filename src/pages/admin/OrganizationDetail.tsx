import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Pencil, Trash2, UserPlus } from "lucide-react";
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
import { EditOrganizationDialog } from "@/components/admin/EditOrganizationDialog";
import { AddAdminDialog } from "@/components/admin/AddAdminDialog";
import { useDialogState } from "@/hooks/useDialogState";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  created_at: string;
}

interface Hotel {
  id: string;
  name: string;
  city: string | null;
  image: string | null;
}

interface AdminRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  is_super_admin: boolean;
  user_id: string | null;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    isSuperAdmin,
    isAdmin,
    organizationId,
    userId,
    loading: userLoading,
  } = useUser();

  const [org, setOrg] = useState<Organization | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const { deleteId: deleteAdminId, openDelete: openDeleteAdmin, closeDelete: closeDeleteAdmin } =
    useDialogState<string>();

  const canAccess = !userLoading && isAdmin && (isSuperAdmin || organizationId === id);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [orgRes, hotelsRes, adminsRes] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("hotels")
        .select("id, name, city, image")
        .eq("organization_id", id)
        .order("name"),
      supabase
        .from("admins")
        .select("id, first_name, last_name, email, status, is_super_admin, user_id")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (orgRes.error) {
      toast.error("Organisation introuvable");
      console.error(orgRes.error);
      setLoading(false);
      return;
    }

    setOrg(orgRes.data as Organization | null);
    setHotels((hotelsRes.data as Hotel[]) ?? []);
    setAdmins((adminsRes.data as AdminRow[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (canAccess) fetchAll();
  }, [canAccess, fetchAll]);

  if (userLoading) return null;
  if (!isAdmin) return <Navigate to="/admin" replace />;
  if (!isSuperAdmin && organizationId !== id) return <Navigate to="/admin" replace />;
  if (!id) return <Navigate to="/admin" replace />;

  const deletingAdmin = deleteAdminId ? admins.find((a) => a.id === deleteAdminId) ?? null : null;

  const handleDeleteAdmin = async () => {
    if (!deletingAdmin) return;
    if (deletingAdmin.user_id === userId) {
      toast.error("Vous ne pouvez pas supprimer votre propre compte");
      closeDeleteAdmin();
      return;
    }
    const { error } = await supabase.from("admins").delete().eq("id", deletingAdmin.id);
    if (error) {
      toast.error(
        error.message.includes("row-level security")
          ? "Action non autorisée"
          : "Suppression impossible",
      );
      console.error(error);
      return;
    }
    toast.success("Administrateur supprimé");
    closeDeleteAdmin();
    fetchAll();
  };

  return (
    <div className="bg-background flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          onClick={() => navigate(isSuperAdmin ? "/admin/organizations" : "/admin")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>

        {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

        {!loading && org && (
          <div className="flex items-start gap-4 mb-6">
            <div className="h-16 w-16 rounded-md overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-medium text-foreground">{org.name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {org.slug}
                {org.contact_email ? ` · ${org.contact_email}` : ""}
              </p>
            </div>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Modifier
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 md:px-6 pb-6 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">Hôtels rattachés</h2>
            <span className="text-xs text-muted-foreground">{hotels.length}</span>
          </div>
          <div className="bg-card rounded-lg border border-border">
            {hotels.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucun hôtel rattaché.{" "}
                {isSuperAdmin && (
                  <>
                    Rattachez-en un depuis{" "}
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => navigate("/admin/places")}
                    >
                      la page Lieux
                    </button>
                    .
                  </>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {hotels.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/admin/places/${h.id}`)}
                  >
                    <div className="h-8 w-8 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {h.image ? (
                        <img src={h.image} alt={h.name} className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{h.name}</div>
                      {h.city && <div className="text-xs text-muted-foreground">{h.city}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">Administrateurs</h2>
            <Button size="sm" onClick={() => setIsAddAdminOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-2" />
              Ajouter un admin
            </Button>
          </div>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Aucun administrateur dans cette organisation.
                    </TableCell>
                  </TableRow>
                )}
                {admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.first_name} {a.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.email}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "Actif" ? "default" : "secondary"}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.is_super_admin ? (
                        <Badge variant="outline">Super-admin</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Admin</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteAdmin(a.id)}
                        disabled={!isSuperAdmin && a.is_super_admin}
                        title={
                          !isSuperAdmin && a.is_super_admin
                            ? "Seul un super-admin peut supprimer cet admin"
                            : "Supprimer"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <EditOrganizationDialog
        open={isEditOpen}
        organization={org}
        onClose={() => setIsEditOpen(false)}
        onSuccess={fetchAll}
      />

      <AddAdminDialog
        open={isAddAdminOpen}
        organizationId={id}
        onClose={() => setIsAddAdminOpen(false)}
        onSuccess={fetchAll}
      />

      <AlertDialog open={!!deletingAdmin} onOpenChange={(o) => !o && closeDeleteAdmin()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet administrateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'administrateur « {deletingAdmin?.first_name} {deletingAdmin?.last_name} » perdra
              l'accès à l'organisation. Cette action ne supprime pas son compte utilisateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAdmin}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
