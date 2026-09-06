import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Les erreurs PostgREST ne sont pas des `Error` : sans ce déballage, un conflit
 * d'unicité (customers.phone) remontait au client en « Unknown error ».
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; code?: unknown };
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.details === 'string' && e.details) return e.details;
    if (typeof e.code === 'string' && e.code) return `Database error ${e.code}`;
  }
  return "Unknown error";
}

/**
 * Résout la fiche client à rattacher au compte portail, sans jamais insérer en
 * doublon : `find_or_create_customer` dédoublonne sur le téléphone puis l'email,
 * exactement comme l'achat de la carte cadeau (purchase-bundle).
 */
async function resolveCustomerId(opts: {
  authUserId: string;
  email: string;
  phone: string;
  firstName: string | null;
}): Promise<string> {
  const { data: linked } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('auth_user_id', opts.authUserId)
    .maybeSingle();

  if (linked) {
    await supabaseAdmin
      .from('customers')
      .update({ profile_completed: true })
      .eq('id', linked.id);
    return linked.id;
  }

  const { data: customerId, error: rpcError } = await supabaseAdmin.rpc(
    'find_or_create_customer',
    {
      _phone: opts.phone,
      _first_name: opts.firstName,
      _last_name: null,
      _email: opts.email,
    },
  );

  if (rpcError) throw new Error(getErrorMessage(rpcError));
  if (!customerId) throw new Error("Failed to create customer record");

  const { data: customer, error: readError } = await supabaseAdmin
    .from('customers')
    .select('id, auth_user_id, first_name, email, phone')
    .eq('id', customerId)
    .single();

  if (readError) throw new Error(getErrorMessage(readError));

  if (customer.auth_user_id && customer.auth_user_id !== opts.authUserId) {
    throw new Error("This phone number is already linked to another account");
  }

  const { error: updateError } = await supabaseAdmin
    .from('customers')
    .update({
      auth_user_id: opts.authUserId,
      profile_completed: true,
      email: customer.email || opts.email,
      phone: customer.phone || opts.phone,
      first_name: customer.first_name || opts.firstName,
    })
    .eq('id', customer.id);

  if (updateError) throw new Error(getErrorMessage(updateError));

  return customer.id;
}

/**
 * Creates a customer portal account from a gift card claim.
 *
 * 1. Validates the redemption code
 * 2. Creates an auth.users account (email + password)
 * 3. Assigns the 'user' role in user_roles
 * 4. Links the customer record via auth_user_id
 * 5. Claims the gift card (sets beneficiary_customer_id + claimed_at)
 * 6. Returns customer info for auto-login
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, email, password, firstName, phone } = await req.json();

    if (!code || !email || !password) {
      throw new Error("Missing required fields: code, email, password");
    }
    if (!phone || !phone.trim()) {
      throw new Error("Phone number is required");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const cleanCode = code.toUpperCase().replace(/\s/g, '');
    const cleanEmail = email.trim().toLowerCase();

    // Normalize phone: strip spaces, then convert French local format (0XXXXXXXXX) to E.164
    const rawPhone = phone.trim().replace(/\s/g, '');
    const cleanPhone = /^0[1-9]\d{8}$/.test(rawPhone)
      ? '+33' + rawPhone.slice(1)
      : rawPhone;

    // Basic validation: at least 6 digits after stripping non-digit chars
    if (cleanPhone.replace(/\D/g, '').length < 6) {
      throw new Error("Invalid phone number");
    }

    const cleanFirstName = typeof firstName === 'string' && firstName.trim()
      ? firstName.trim()
      : null;

    // 1. Validate the redemption code
    const { data: bundle, error: bundleError } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id, hotel_id, customer_id, beneficiary_customer_id, claimed_at, expires_at, redemption_code')
      .eq('redemption_code', cleanCode)
      .maybeSingle();

    if (bundleError) throw new Error(getErrorMessage(bundleError));
    if (!bundle) throw new Error("Gift code not found");
    if (bundle.claimed_at) throw new Error("Gift code already claimed");
    if (new Date(bundle.expires_at) < new Date()) throw new Error("Gift card has expired");

    // 2. Check if auth account already exists for this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    const isNewAccount = !existingUser;
    let authUserId: string;

    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { first_name: cleanFirstName || '' },
      });

      if (authError) throw new Error(getErrorMessage(authError));
      if (!authData.user) throw new Error("Failed to create auth user");
      authUserId = authData.user.id;
    }

    // 3. Assign the 'user' role (idempotent)
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', authUserId)
      .eq('role', 'user')
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: authUserId, role: 'user' });
      if (roleError) throw new Error(getErrorMessage(roleError));
    }

    // 4. Find or create the customer record and link it to the auth account
    const customerId = await resolveCustomerId({
      authUserId,
      email: cleanEmail,
      phone: cleanPhone,
      firstName: cleanFirstName,
    });

    // 5. Claim the bundle
    const { error: claimError } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .update({
        beneficiary_customer_id: customerId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bundle.id);
    if (claimError) throw new Error(getErrorMessage(claimError));

    return new Response(
      JSON.stringify({
        success: true,
        existingAccount: !isNewAccount,
        customerId,
        authUserId,
        ...(isNewAccount ? {} : { message: "Account already exists. Please log in." }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    const message = getErrorMessage(error);
    console.error("[create-portal-account]", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
