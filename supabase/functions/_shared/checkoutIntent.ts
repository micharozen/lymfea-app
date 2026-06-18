type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, string>,
  ) => Promise<{ error: unknown }>;
};

export async function tryMarkCheckoutIntentConverted(
  supabase: RpcClient,
  checkoutIntentId: string | undefined,
  bookingId: string,
  logPrefix = "[checkout-intent]",
): Promise<void> {
  if (!checkoutIntentId) return;
  const { error } = await supabase.rpc("mark_checkout_intent_converted", {
    _intent_id: checkoutIntentId,
    _booking_id: bookingId,
  });
  if (error) {
    console.error(`${logPrefix} mark_checkout_intent_converted:`, error);
  }
}
