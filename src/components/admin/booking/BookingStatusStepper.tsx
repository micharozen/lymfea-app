import { Check, X, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingStatusStepperProps {
  status: string;
  paymentStatus: string;
}

interface Step {
  key: string;
  label: string;
  sublabel: string;
}

function buildSteps(status: string, paymentStatus: string): { steps: Step[]; currentIndex: number } {
  const isPartnerBilled = paymentStatus === "pending_partner_billing";
  const isConfirmed = status === "confirmed" || status === "completed";

  // Partner-billed flow has its own path: the partner settles at month-end,
  // so "Paiement partenaire en attente" is an extra step *after* "Terminé".
  if (isPartnerBilled) {
    const steps: Step[] = [
      { key: "pending", label: "En attente", sublabel: "" },
      { key: "confirmed", label: "Confirmé", sublabel: "" },
      { key: "completed", label: "Terminé", sublabel: "" },
      { key: "partner_pending", label: "Paiement partenaire", sublabel: "En attente" },
    ];
    let currentKey: string;
    if (status === "completed") currentKey = "partner_pending";
    else if (isConfirmed) currentKey = "confirmed";
    else currentKey = "pending";
    return { steps, currentIndex: steps.findIndex((s) => s.key === currentKey) };
  }

  const isPaid = paymentStatus === "paid" || paymentStatus === "charged_to_room";
  const isPending = status === "pending" || status === "waiting_approval" || status === "awaiting_hairdresser_selection";
  const paidSublabel = "Payé";

  // Two possible paths:
  // A) Payment first:  en attente/pending → en attente/payé → confirmé/payé → terminé
  // B) Confirm first:  en attente/pending → confirmé/pending → confirmé/payé → terminé
  // When at initial step or both done (confirmed+paid, completed), show whichever path was taken.

  const confirmFirst = isConfirmed && !isPaid;
  const paymentFirst = isPending && isPaid;

  const steps: Step[] = [
    { key: "pending_pending", label: "En attente", sublabel: "Paiement en attente" },
  ];

  if (!confirmFirst) {
    // Path A: payment arrived while still pending
    steps.push({ key: "pending_paid", label: "En attente", sublabel: paidSublabel });
  }

  if (!paymentFirst) {
    // Path B: confirmed while payment still pending
    steps.push({ key: "confirmed_pending", label: "Confirmé", sublabel: "Paiement en attente" });
  }

  steps.push({ key: "confirmed_paid", label: "Confirmé", sublabel: paidSublabel });
  steps.push({ key: "completed", label: "Terminé", sublabel: "" });

  // Determine current step key
  let currentKey: string;
  if (status === "completed") {
    currentKey = "completed";
  } else if (isConfirmed && isPaid) {
    currentKey = "confirmed_paid";
  } else if (isConfirmed) {
    currentKey = "confirmed_pending";
  } else if (isPaid) {
    currentKey = "pending_paid";
  } else {
    currentKey = "pending_pending";
  }

  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return { steps, currentIndex };
}

export function BookingStatusStepper({ status, paymentStatus }: BookingStatusStepperProps) {
  const isCancelled = status === "cancelled";
  const isNoshow = status === "noshow";

  if (isCancelled || isNoshow) {
    const Icon = isCancelled ? X : UserX;
    const label = isCancelled ? "Annulé" : "No-show";
    const colorClasses = isCancelled
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-rose-50 border-rose-200 text-rose-700";

    return (
      <div className={cn("rounded-xl border p-4 flex items-center justify-center gap-2", colorClasses)}>
        <Icon className="h-5 w-5" />
        <span className="font-medium text-sm">{label}</span>
      </div>
    );
  }

  const { steps, currentIndex } = buildSteps(status, paymentStatus);

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors shrink-0",
                    isCompleted && "border-emerald-500 bg-emerald-500 text-white",
                    isCurrent && "border-primary bg-primary/10 text-primary",
                    !isCompleted && !isCurrent && "border-gray-200 bg-gray-50 text-gray-400"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isCurrent && "text-gray-900",
                      isCompleted && "text-emerald-600",
                      !isCompleted && !isCurrent && "text-gray-400"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.sublabel && (
                    <p
                      className={cn(
                        "text-[10px] leading-tight mt-0.5 hidden sm:block",
                        isCurrent && "text-gray-500",
                        isCompleted && "text-emerald-500",
                        !isCompleted && !isCurrent && "text-gray-300"
                      )}
                    >
                      {step.sublabel}
                    </p>
                  )}
                </div>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 mt-[-20px] transition-colors",
                    isCompleted ? "bg-emerald-500" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
