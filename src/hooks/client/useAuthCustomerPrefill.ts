import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthBundles, AuthCustomerInfo } from '@/components/client/GiftCardLoginModal';

interface UseAuthCustomerPrefillOptions {
  hotelId: string | null;
  treatmentIds: string[];
  /** Désactivé quand le client s'est déjà identifié dans le parcours. */
  enabled: boolean;
  onDetected: (bundles: AuthBundles, customer: AuthCustomerInfo) => void;
}

/**
 * Un client arrivant depuis son espace (/portal) garde sa session Supabase :
 * le parcours de réservation la détecte ici pour pré-remplir ses coordonnées et
 * rattacher ses cartes cadeaux, sans lui redemander de se connecter.
 *
 * Ne fait rien pour une session qui n'est pas un compte client (staff en train
 * de tester le parcours), ni si le client s'est déjà identifié via la modale.
 */
export function useAuthCustomerPrefill({
  hotelId,
  treatmentIds,
  enabled,
  onDetected,
}: UseAuthCustomerPrefillOptions): void {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!enabled || !hotelId || hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;

    const detect = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'user')
        .maybeSingle();

      if (!roleData) return;

      const [portalRes, bundlesRes] = await Promise.all([
        supabase.rpc('get_customer_portal_data'),
        supabase.rpc('detect_bundles_for_auth_customer', {
          _hotel_id: hotelId,
          _treatment_ids: treatmentIds,
        }),
      ]);

      if (cancelled || portalRes.error || bundlesRes.error) return;

      const portal = portalRes.data as { customer?: Record<string, string | null> } | null;
      onDetected(bundlesRes.data as unknown as AuthBundles, {
        firstName: portal?.customer?.first_name ?? '',
        lastName: portal?.customer?.last_name ?? '',
        email: portal?.customer?.email ?? '',
        phone: portal?.customer?.phone ?? '',
      });
    };

    detect().catch(() => {
      // Détection silencieuse : le client remplit le formulaire normalement.
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, hotelId, treatmentIds, onDetected]);
}
