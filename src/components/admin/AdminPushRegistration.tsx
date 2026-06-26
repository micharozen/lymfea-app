import { useEffect } from "react";
import { useUser } from "@/contexts/UserContext";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";

/**
 * Registers the current admin user with OneSignal (external_id = Supabase
 * user_id) and shows the push-permission prompt. Mount once in the desktop
 * admin layout so admins receive system web-push notifications for booking
 * events. Mirrors the pattern used in the admin PWA dashboard.
 */
export default function AdminPushRegistration() {
  const { userId } = useUser();

  useEffect(() => {
    if (userId) {
      setOneSignalExternalUserId(userId);
    }
  }, [userId]);

  return <PushNotificationPrompt />;
}
