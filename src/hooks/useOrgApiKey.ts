import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeApi } from "@/lib/api";

export interface OrgApiKeyMetadata {
  id: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_min: number | null;
  last_used_at: string | null;
  created_at: string;
}

const QUERY_KEY = ["org-api-key"] as const;

export function useOrgApiKey() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<OrgApiKeyMetadata | null> => {
      const { data, error } = await invokeApi<
        undefined,
        { data: OrgApiKeyMetadata | null }
      >("admin/api-keys/me", { method: "GET" });
      if (error) throw error;
      return data?.data ?? null;
    },
    staleTime: 60_000,
  });
}

/**
 * Reveal the cleartext key for the caller's org. Returns a one-shot value —
 * deliberately NOT cached in React Query so the secret never sticks in memory
 * beyond the immediate UI consumer.
 */
export function useRevealOrgApiKey() {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await invokeApi<
        undefined,
        { data: { api_key: string } }
      >("admin/api-keys/me/reveal", { method: "POST" });
      if (error) throw error;
      if (!data?.data?.api_key) throw new Error("Empty key returned");
      return data.data.api_key;
    },
  });
}

/**
 * Regenerate the org's key. Revokes the active key and returns the new
 * cleartext value once. The metadata query is invalidated on success.
 */
export function useRegenerateOrgApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ id: string; key_prefix: string; api_key: string }> => {
      const { data, error } = await invokeApi<
        undefined,
        { data: { id: string; key_prefix: string; api_key: string } }
      >("admin/api-keys/me/regenerate", { method: "POST" });
      if (error) throw error;
      if (!data?.data) throw new Error("Empty response from regenerate");
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
