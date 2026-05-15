export type CancellationFeeType = "none" | "fixed" | "percentage";

export interface ComputeCancellationAmountsInput {
  totalPrice: number;
  depositAmount: number;
  feeType?: CancellationFeeType | string | null;
  feeAmount?: number | null;
  chargeLateFee: boolean;
}

export interface CancellationAmounts {
  rawFee: number;
  feeApplied: number;
  refundAmount: number;
}

/** Preview amounts for cancel dialog — backend recalculates on submit. */
export function computeCancellationAmounts(
  input: ComputeCancellationAmountsInput,
): CancellationAmounts {
  const { totalPrice, depositAmount, feeType, feeAmount, chargeLateFee } = input;

  let rawFee = 0;
  if (chargeLateFee && feeType && feeType !== "none" && Number(feeAmount) > 0) {
    if (feeType === "fixed") {
      rawFee = Number(feeAmount) || 0;
    } else if (feeType === "percentage") {
      rawFee = Math.round(totalPrice * (Number(feeAmount) / 100) * 100) / 100;
    }
  }

  const feeApplied = Math.min(rawFee, depositAmount);
  const refundAmount = Math.max(0, depositAmount - feeApplied);

  return { rawFee, feeApplied, refundAmount };
}
