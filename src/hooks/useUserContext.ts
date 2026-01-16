import { useUser } from "@/contexts/UserContext";

interface UserContext {
  userId: string | null;
  role: "admin" | "concierge" | null;
  hotelIds: string[];
  isAdmin: boolean;
  isConcierge: boolean;
  loading: boolean;
}

/**
 * @deprecated Use useUser() from @/contexts/UserContext instead.
 * This hook is kept for backward compatibility.
 */
export function useUserContext(): UserContext {
  return useUser();
}
