import Stripe from "https://esm.sh/stripe@18.5.0";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  // On remet la version d'API exacte que tu avais avant
  apiVersion: "2025-08-27.basil", 
});