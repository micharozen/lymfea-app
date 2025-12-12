import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserContext {
  userId: string | null;
  role: "admin" | "concierge" | null;
  hotelIds: string[];
  isAdmin: boolean;
  isConcierge: boolean;
  loading: boolean;
}

export function useUserContext(): UserContext {
  const [context, setContext] = useState<UserContext>({
    userId: null,
    role: null,
    hotelIds: [],
    isAdmin: false,
    isConcierge: false,
    loading: true,
  });

  useEffect(() => {
    const fetchUserContext = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setContext({
            userId: null,
            role: null,
            hotelIds: [],
            isAdmin: false,
            isConcierge: false,
            loading: false,
          });
          return;
        }

        // Get user role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'concierge'])
          .maybeSingle();

        const role = roleData?.role as "admin" | "concierge" | null;
        const isAdmin = role === 'admin';
        const isConcierge = role === 'concierge';

        // Get hotel IDs for concierge
        let hotelIds: string[] = [];
        
        if (isConcierge) {
          // Get concierge record
          const { data: concierge } = await supabase
            .from('concierges')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (concierge) {
            // Get hotels assigned to this concierge
            const { data: conciergeHotels } = await supabase
              .from('concierge_hotels')
              .select('hotel_id')
              .eq('concierge_id', concierge.id);

            hotelIds = conciergeHotels?.map(h => h.hotel_id) || [];
          }
        }

        setContext({
          userId: user.id,
          role,
          hotelIds,
          isAdmin,
          isConcierge,
          loading: false,
        });
      } catch (error) {
        console.error('Error fetching user context:', error);
        setContext(prev => ({ ...prev, loading: false }));
      }
    };

    fetchUserContext();
  }, []);

  return context;
}
