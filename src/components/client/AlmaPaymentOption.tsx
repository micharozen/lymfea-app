import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useTranslation } from 'react-i18next';
import type { AlmaPlan } from '@/hooks/useAlmaEligibility';

interface AlmaPaymentOptionProps {
  plans: AlmaPlan[];
  selectedPlan: number | null; // installmentsCount
  onSelectPlan: (installmentsCount: number) => void;
  isSelected: boolean; // whether Alma method is selected (vs card/room)
  onSelect: () => void; // select Alma as payment method
  currency?: string;
}

export function AlmaPaymentOption({
  plans,
  selectedPlan,
  onSelectPlan,
  isSelected,
  onSelect,
  currency = 'EUR',
}: AlmaPaymentOptionProps) {
  const { t } = useTranslation('client');

  const handleClick = () => {
    onSelect();
    // Auto-select first plan if none selected
    if (!selectedPlan && plans.length > 0) {
      onSelectPlan(plans[0].installmentsCount);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full p-4 rounded-xl border transition-all duration-200 text-left",
        isSelected
          ? "border-gray-900 bg-gray-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center transition-all text-xs font-bold",
          isSelected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
        )}>
          {selectedPlan ? `${selectedPlan}x` : '3x'}
        </div>
        <div className="flex-1">
          <p className={cn(
            "font-medium text-sm",
            isSelected ? "text-gray-900" : "text-gray-700"
          )}>
            {t('payment.alma.title', 'Payer en plusieurs fois')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('payment.alma.noFees', 'Sans frais. Paiement sécurisé par Alma.')}
          </p>
        </div>
      </div>

      {/* Plan selector — only visible when Alma is selected */}
      {isSelected && plans.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {plans.map((plan) => {
            const isActive = selectedPlan === plan.installmentsCount;
            const firstInstallment = plan.paymentPlan?.[0];
            const monthlyAmount = firstInstallment
              ? firstInstallment.amount / 100
              : 0;

            return (
              <button
                key={plan.installmentsCount}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPlan(plan.installmentsCount);
                }}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-between transition-all",
                  isActive
                    ? "border-gray-900 bg-white shadow-sm"
                    : "border-gray-100 bg-gray-50/50 hover:border-gray-200"
                )}
              >
                <span className={cn(
                  "font-medium",
                  isActive ? "text-gray-900" : "text-gray-600"
                )}>
                  {t('payment.alma.installments', '{{count}}x sans frais', {
                    count: plan.installmentsCount,
                  })}
                </span>
                <span className={cn(
                  "text-xs",
                  isActive ? "text-gray-900 font-medium" : "text-gray-500"
                )}>
                  {monthlyAmount > 0
                    ? `${plan.installmentsCount}x ${formatPrice(monthlyAmount, currency)}`
                    : ''}
                </span>
              </button>
            );
          })}

          {/* Show first payment info */}
          {selectedPlan && (() => {
            const activePlan = plans.find((p) => p.installmentsCount === selectedPlan);
            const firstAmount = activePlan?.paymentPlan?.[0]?.amount;
            if (!firstAmount) return null;
            return (
              <p className="text-xs text-gray-400 text-center pt-1">
                {t('payment.alma.firstPayment', 'dont {{amount}} aujourd\'hui', {
                  amount: formatPrice(firstAmount / 100, currency),
                })}
              </p>
            );
          })()}
        </div>
      )}
    </button>
  );
}
