import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { code, email, password, firstName } = await req.json();

    if (!code || !email || !password) {
      throw new Error("Missing required fields: code, email, password");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const cleanCode = code.toUpperCase().replace(/\s/g, '');
    const cleanEmail = email.trim().toLowerCase();

    // 1. Validate the redemption code
    const { data: bundle, error: bundleError } = await supabaseAdmin
      .from('customer_treatment_bundles')
      .select('id, hotel_id, customer_id, beneficiary_customer_id, claimed_at, expires_at, redemption_code')
      .eq('redemption_code', cleanCode)
      .maybeSingle();

    if (bundleError) throw bundleError;
    if (!bundle) throw new Error("Gift code not found");
    if (bundle.claimed_at) throw new Error("Gift code already claimed");
    if (new Date(bundle.expires_at) < new Date()) throw new Error("Gift card has expired");

    // 2. Check if auth account already exists for this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (existingUser) {
      // User already has an auth account — check if they have customer role
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .eq('role', 'user')
        .maybeSingle();

      if (!existingRole) {
        // Add the 'user' role
        await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: existingUser.id, role: 'user' });
      }

      // Find or create customer, link auth_user_id
      let customerId: string | null = null;
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('auth_user_id', existingUser.id)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // Check by email
        const { data: emailCustomer } = await supabaseAdmin
          .from('customers')
          .select('id')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (emailCustomer) {
          customerId = emailCustomer.id;
          await supabaseAdmin
            .from('customers')
            .update({ auth_user_id: existingUser.id, profile_completed: true })
            .eq('id', customerId);
        } else {
          const { data: newCustomer, error: createErr } = await supabaseAdmin
            .from('customers')
            .insert({
              email: cleanEmail,
              first_name: firstName || null,
              auth_user_id: existingUser.id,
              profile_completed: true,
            })
            .select('id')
            .single();
          if (createErr) throw createErr;
          customerId = newCustomer.id;
        }
      }

      // Claim the bundle
      await supabaseAdmin
        .from('customer_treatment_bundles')
        .update({
          beneficiary_customer_id: customerId,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bundle.id);

      return new Response(
        JSON.stringify({
          success: true,
          existingAccount: true,
          message: "Account already exists. Please log in.",
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 3. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName || '' },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create auth user");

    const authUserId = authData.user.id;

    // 4. Assign 'user' role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: authUserId, role: 'user' });

    if (roleError) throw roleError;

    // 5. Find or create customer, link auth_user_id
    let customerId: string | null = null;

    const { data: existingCustomerByEmail } = await supabaseAdmin
      .from('customers')
      .select('id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingCustomerByEmail) {
      customerId = existingCustomerByEmail.id;
      await supabaseAdmin
        .from('customers')
        .update({
          auth_user_id: authUserId,
          first_name: firstName || undefined,
          profile_completed: true,
        })
        .eq('id', customerId);
    } else {
      const { data: newCustomer, error: createErr } = await supabaseAdmin
        .from('customers')
        .insert({
          email: cleanEmail,
          first_name: firstName || null,
          auth_user_id: authUserId,
          profile_completed: true,
        })
        .select('id')
        .single();
      if (createErr) throw createErr;
      customerId = newCustomer.id;
    }

    // 6. Claim the bundle
    await supabaseAdmin
      .from('customer_treatment_bundles')
      .update({
        beneficiary_customer_id: customerId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bundle.id);

    return new Response(
      JSON.stringify({
        success: true,
        existingAccount: false,
        customerId,
        authUserId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-portal-account]", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
