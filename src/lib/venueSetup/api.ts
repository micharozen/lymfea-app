import { invokeEdgeFunction, EdgeFunctionError } from "@/lib/supabaseEdgeFunctions";
import { supabase } from "@/integrations/supabase/client";
import type { SetupData, StepId, UploadKind } from "@shared/venueSetup/spec";

export interface SetupOrganizationPrefill {
  name: string;
  commercial_name: string | null;
  legal_name: string | null;
  legal_form: string | null;
  legal_capital: string | null;
  siren: string | null;
  siret: string | null;
  rcs: string | null;
  vat_number: string | null;
  legal_address: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string | null;
  contact_email: string | null;
}

export interface SetupState {
  label: string;
  status: "draft" | "submitted" | "imported" | "archived";
  submitted_at: string | null;
  data: SetupData;
  organization: SetupOrganizationPrefill | null;
  /** Signed read URLs of uploaded files, keyed by storage path. */
  files: Record<string, string>;
}

export interface CompanyLookupResult {
  commercial_name: string | null;
  legal_name: string | null;
  legal_form: string | null;
  siren: string;
  siret: string | null;
  rcs: string | null;
  vat_number: string;
  legal_address: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string;
}

/** Error code returned by the venue-setup function (invalid_token, expired, locked…). */
export function setupErrorCode(error: unknown): string | null {
  if (error instanceof EdgeFunctionError) {
    const body = error.body as { error?: string } | undefined;
    return body?.error ?? null;
  }
  return null;
}

async function call<T>(token: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await invokeEdgeFunction<Record<string, unknown>, T>("venue-setup", {
    body: { action, token, ...payload },
    skipAuth: true,
    logContext: { flow: "venue-setup", action },
  });
  if (error) throw error;
  return data as T;
}

export const venueSetupApi = {
  get: (token: string) => call<SetupState>(token, "get"),

  saveStep: (token: string, step: StepId, sections: Record<string, unknown>) =>
    call<{ success: true; data: SetupData }>(token, "saveStep", { step, sections }),

  lookupCompany: (token: string, siren: string) =>
    call<{ success: true; company: CompanyLookupResult }>(token, "lookupCompany", { siren }),

  submit: (token: string) => call<{ success: true }>(token, "submit"),

  /** Reads the venue website with the AI and fills empty answers. */
  prefillFromWebsite: (token: string, url: string) =>
    call<{ success: true; filled: string[]; data: SetupData }>(token, "prefillFromWebsite", { url }),

  /** Uploads a file to the private bucket and returns its storage path. */
  async upload(token: string, kind: UploadKind, file: File): Promise<string> {
    const target = await call<{ path: string; token: string }>(token, "createUploadUrl", {
      kind,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    });
    const { error } = await supabase.storage
      .from("venue-setup")
      .uploadToSignedUrl(target.path, target.token, file, {
        contentType: file.type || "application/octet-stream",
      });
    if (error) throw error;
    return target.path;
  },
};

export const venueSetupKeys = {
  state: (token: string) => ["venue-setup", token] as const,
};
