import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PwaHeader from "@/components/pwa/Header";
import PwaPageLoader from "@/components/pwa/PageLoader";

// A test older than this is considered stale: the therapist is not answering
// the notification they just received, so we don't offer the buttons anymore.
const MAX_TEST_AGE_MS = 24 * 60 * 60 * 1000;

const PwaNotificationTest = () => {
  const { t } = useTranslation("pwa");
  const [answer, setAnswer] = useState<"ok" | "nok" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: test, isLoading } = useQuery({
    queryKey: ["notification-test"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;

      const { data, error } = await supabase
        .from("therapists")
        .select("id, notification_test_sent_at, notification_test_status")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const respond = async (status: "ok" | "nok") => {
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    // Filtering on 'pending' makes the answer idempotent: a reload cannot
    // overwrite an answer already given, nor reopen a closed test.
    const { error } = await supabase
      .from("therapists")
      .update({ notification_test_status: status })
      .eq("user_id", userId ?? "")
      .eq("notification_test_status", "pending");

    setSubmitting(false);

    if (error) {
      toast.error(t("notificationTest.error"));
      return;
    }
    setAnswer(status);
  };

  if (isLoading) {
    return (
      <PwaPageLoader
        title={t("notificationTest.title")}
        showBack
        backPath="/pwa/dashboard"
      />
    );
  }

  const sentAt = test?.notification_test_sent_at
    ? new Date(test.notification_test_sent_at)
    : null;
  const isStale = sentAt ? Date.now() - sentAt.getTime() > MAX_TEST_AGE_MS : true;
  const isPending =
    !answer && test?.notification_test_status === "pending" && !isStale;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <PwaHeader
        title={t("notificationTest.title")}
        showBack
        backPath="/pwa/dashboard"
      />

      <div className="flex flex-1 flex-col justify-center px-6 pb-6">
        <div className="w-full max-w-sm mx-auto space-y-6 text-center">
          {isPending ? (
            <>
              <p className="text-lg">{t("notificationTest.question")}</p>
              <div className="space-y-3">
                <Button
                  className="w-full h-14 text-base"
                  disabled={submitting}
                  onClick={() => respond("ok")}
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  {t("notificationTest.ok")}
                </Button>
                <Button
                  variant="destructive"
                  className="w-full h-14 text-base"
                  disabled={submitting}
                  onClick={() => respond("nok")}
                >
                  <XCircle className="mr-2 h-5 w-5" />
                  {t("notificationTest.nok")}
                </Button>
              </div>
            </>
          ) : (
            <>
              {answer === "ok" && (
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              )}
              {answer === "nok" && (
                <XCircle className="mx-auto h-12 w-12 text-destructive" />
              )}
              <p className="text-muted-foreground">
                {answer === "ok"
                  ? t("notificationTest.thanksOk")
                  : answer === "nok"
                    ? t("notificationTest.thanksNok")
                    : t("notificationTest.noPendingTest")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PwaNotificationTest;
