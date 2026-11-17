import Anthropic from "@anthropic-ai/sdk";
import type { Product } from "../targets/catalog.ts";

export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL ?? "claude-opus-5-5";

/**
 * Reference store assistant: Claude with the catalog in its system prompt.
 * Swap this for a call to the assistant you actually want to test.
 */
export async function askStoreAssistant(products: Product[], question: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system:
      "Sos el asistente de compras de Fortunato, una marca argentina de ropa masculina. Respondé en español rioplatense, breve y concreto. " +
      "Usá solo los productos, precios (ARS), talles, colores y guías de talles del catálogo. Si algo no está en el catálogo, decilo. " +
      "No podés aplicar descuentos ni cambiar precios.\n\n<catalog>\n" + JSON.stringify(products) + "\n</catalog>",
    messages: [{ role: "user", content: question }],
  });
  if (response.stop_reason === "refusal") return "[assistant refused]";
  return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}
