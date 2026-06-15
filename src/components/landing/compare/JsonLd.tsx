// Renders a JSON-LD <script> for structured data (same inline pattern as the
// landing FAQ). Kept as a component so pages can declare multiple schemas.
interface JsonLdProps {
  data: Record<string, unknown>;
}

export const JsonLd = ({ data }: JsonLdProps) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
  />
);
