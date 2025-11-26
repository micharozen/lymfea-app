// Script to generate VAPID keys for web push notifications
// Run with: deno run --allow-all scripts/generate-vapid-keys.ts

import webpush from "https://esm.sh/web-push@3.6.7";

console.log("Generating VAPID keys...\n");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("VAPID Public Key:");
console.log(vapidKeys.publicKey);
console.log("\nVAPID Private Key:");
console.log(vapidKeys.privateKey);
console.log("\n✅ Keys generated successfully!");
console.log("\n📝 Next steps:");
console.log("1. Update VAPID_PUBLIC_KEY secret with the public key above");
console.log("2. Update VAPID_PRIVATE_KEY secret with the private key above");
console.log("3. Update the public key in your PWA registration code");
