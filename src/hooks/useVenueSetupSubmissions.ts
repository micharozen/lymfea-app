import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { collectFilePaths, isOwnFilePath, type SetupData } from "@shared/venueSetup/spec";

export type SubmissionStatus = "draft" | "submitted" | "imported" | "archived";

export interface SubmissionRow {
  id: string;
  organization_id: string;
  label: string;
  status: SubmissionStatus;
  token: string;
  created_at: string;
  submitted_at: string | null;
  imported_at: string | null;
  expires_at: string;
  hotel_id: string | null;
  organizations: { name: string } | null;
}

export interface ImportResult {
  hotelId: string;
  fileFailures: string[];
  invited: number;
  inviteFailures: string[];
  linked: string[];
  skipped: string[];
}

const LIST_COLUMNS =
  "id, organization_id, label, status, token, created_at, submitted_at, imported_at, expires_at, hotel_id, organizations(name)";

export const venueSetupAdminKeys = {
  all: ["venue-setup-submissions"] as const,
  list: (organizationId?: string) => ["venue-setup-submissions", "list", organizationId ?? "all"] as const,
  data: (id: string) => ["venue-setup-submissions", "data", id] as const,
};

export function setupLink(token: string): string {
  return `${window.location.origin}/setup/${token}`;
}

export function useVenueSetupSubmissions(organizationId?: string) {
  return useQuery({
    queryKey: venueSetupAdminKeys.list(organizationId),
    queryFn: async () => {
      let query = supabase
        .from("venue_setup_submissions")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false });
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });
}

export function useSubmissionData(id: string | null) {
  return useQuery({
    queryKey: venueSetupAdminKeys.data(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_setup_submissions")
        .select("data")
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return (data?.data ?? {}) as SetupData;
    },
  });
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, label }: { organizationId: string; label: string }) => {
      const { data, error } = await supabase
        .from("venue_setup_submissions")
        .insert({ organization_id: organizationId, label })
        .select("token")
        .single();
      if (error) throw error;
      return data.token;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueSetupAdminKeys.all }),
  });
}

export function useSetSubmissionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "archived" }) => {
      const { error } = await supabase
        .from("venue_setup_submissions")
        .update(status === "draft" ? { status, submitted_at: null } : { status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueSetupAdminKeys.all }),
  });
}

type PublicBucket = "avatars" | "venue-fonts";

interface FileTarget {
  path: string;
  bucket: PublicBucket;
  target: string;
}

/**
 * Where each uploaded file goes once imported (public buckets used by the
 * app). Only paths inside the submission's own folder are considered.
 */
function fileTargets(submissionId: string, data: SetupData): FileTarget[] {
  const brand = (data.venue_branding ?? {}) as Record<string, unknown>;
  const fonts = new Set([brand.font_title_path, brand.font_body_path]);
  return collectFilePaths(data)
    .filter((path) => isOwnFilePath(path, submissionId))
    .map((path) => {
      const bucket: PublicBucket = fonts.has(path) ? "venue-fonts" : "avatars";
      return { path, bucket, target: bucket === "avatars" ? `venue-setup/${path}` : path.split("/").join("-") };
    });
}

/** Public URLs are deterministic: computed before the copy so the RPC can store them. */
function publicUrls(targets: FileTarget[]): Record<string, string> {
  return Object.fromEntries(
    targets.map((f) => [f.path, supabase.storage.from(f.bucket).getPublicUrl(f.target).data.publicUrl]),
  );
}

/** Copies private uploads to public buckets. Returns the paths that failed. */
async function copyToPublicBuckets(targets: FileTarget[]): Promise<string[]> {
  const failed: string[] = [];
  for (const f of targets) {
    const { data: blob, error: downloadError } = await supabase.storage.from("venue-setup").download(f.path);
    const { error: uploadError } = blob
      ? await supabase.storage.from(f.bucket).upload(f.target, blob, {
          contentType: blob.type || "application/octet-stream",
          cacheControl: "31536000",
          upsert: true,
        })
      : { error: downloadError };
    if (downloadError || uploadError) failed.push(f.path);
  }
  return failed;
}

interface RpcResult {
  hotel_id: string;
  concierges: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    country_code: string;
  }[];
  linked_concierges: string[];
  skipped_concierges: string[];
}

/**
 * Imports a submitted onboarding into the submission's organization:
 * 1. runs the transactional RPC (organization, subscription, venue, related
 *    tables, concierges) with the future public URLs of uploaded files,
 * 2. copies those files from the private bucket to public buckets,
 * 3. sends the invitations of newly created concierges (a failed email does
 *    not undo the import; it can be resent from the concierge page).
 */
export function useImportSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SetupData }): Promise<ImportResult> => {
      const targets = fileTargets(id, data);

      const { data: rpc, error } = await supabase.rpc("import_venue_setup_submission", {
        p_submission_id: id,
        p_file_urls: publicUrls(targets),
      });
      if (error) throw error;
      const result = rpc as unknown as RpcResult;

      // Only publish files once the import is committed: a failed import must
      // not leave the venue's private uploads in public buckets.
      const fileFailures = await copyToPublicBuckets(targets);

      const inviteFailures: string[] = [];
      for (const c of result.concierges) {
        const { error: inviteError } = await invokeEdgeFunction("invite-concierge", {
          body: {
            conciergeId: c.id,
            email: c.email,
            firstName: c.first_name,
            lastName: c.last_name,
            phone: c.phone,
            countryCode: c.country_code,
            hotelIds: [result.hotel_id],
          },
          logContext: { flow: "venue-setup-import", submission_id: id },
        });
        if (inviteError) inviteFailures.push(c.email);
      }

      return {
        hotelId: result.hotel_id,
        fileFailures,
        invited: result.concierges.length - inviteFailures.length,
        inviteFailures,
        linked: result.linked_concierges,
        skipped: result.skipped_concierges,
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueSetupAdminKeys.all }),
  });
}
