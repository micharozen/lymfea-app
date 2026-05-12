interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
}

interface SendSmsResult {
  sid?: string;
  error?: string;
}

/**
 * Send an SMS via the Twilio REST API.
 * Uses TWILIO_MESSAGING_SERVICE_SID when available, otherwise TWILIO_FROM_NUMBER.
 * When IS_LOCAL=true, SMS are redirected to TWILIO_LOCAL_TEST_NUMBER for dev testing.
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  const fromNumber = options.from ?? Deno.env.get("TWILIO_FROM_NUMBER");

  console.log("[send-sms] env check", {
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    hasMessagingServiceSid: !!messagingServiceSid,
    hasFromNumber: !!fromNumber,
    isLocal: Deno.env.get("IS_LOCAL"),
  });

  if (!accountSid || !authToken) {
    console.error("[send-sms] Missing Twilio credentials");
    return { error: "Twilio credentials are not configured" };
  }

  if (!messagingServiceSid && !fromNumber) {
    console.error("[send-sms] Missing sender config");
    return { error: "Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER is configured" };
  }

  const isLocal = Deno.env.get("IS_LOCAL") === "true";
  const localTestNumber = Deno.env.get("TWILIO_LOCAL_TEST_NUMBER");
  const to = isLocal && localTestNumber ? localTestNumber : options.to;
  console.log("[send-sms] Sending to Twilio", { to, isLocal, usingMessagingService: !!messagingServiceSid });

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", options.body);
  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromNumber) {
    form.set("From", fromNumber);
  }

  const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: form.toString(),
    }
  );

  const data = await response.json();
  console.log("[send-sms] Twilio response", { status: response.status, ok: response.ok, sid: data?.sid, code: data?.code });

  if (!response.ok) {
    const errorMsg = data?.message ?? JSON.stringify(data);
    console.error("[send-sms] Twilio API error:", errorMsg, "full:", data);
    return { error: errorMsg };
  }

  return { sid: data.sid };
}
