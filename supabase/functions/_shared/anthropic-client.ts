// Thin wrapper around Anthropic's Messages API used by `llm-agent` actions
// (parse-email, generate-inquiry-reply). Centralises auth + JSON-extraction
// so every action shares the same retry/error semantics.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface AnthropicCallInput {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  model?: string;
}

export interface AnthropicCallResult {
  text: string | null;
  error: string | null;
}

export async function callAnthropic(input: AnthropicCallInput): Promise<AnthropicCallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { text: null, error: "ANTHROPIC_API_KEY not configured" };
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model ?? DEFAULT_MODEL,
        max_tokens: input.maxTokens ?? 1024,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        text: null,
        error: `Anthropic API ${response.status}: ${errBody.slice(0, 500)}`,
      };
    }

    const json = await response.json();
    const text = json?.content?.[0]?.text ?? "";
    return { text, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: null, error: `LLM call failed: ${message}` };
  }
}

// Tolerates accidental markdown code fences and stray prose around a JSON object.
export function safeParseJsonObject<T>(text: string | null): T | null {
  if (!text) return null;

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
