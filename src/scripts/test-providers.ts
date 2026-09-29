/**
 * Test probe script to verify each API provider independently with actual live requests.
 */
import { PROVIDERS } from "../engine/config.js";
import { createGeminiProvider } from "../engine/providers/gemini.js";
import { createGroqProvider } from "../engine/providers/groq.js";
import { createOpenRouterProvider } from "../engine/providers/openrouter.js";
import { createHuggingFaceProvider } from "../engine/providers/huggingface.js";

async function probeSingle(name: string, provider: any) {
  console.log(`\n========================================`);
  console.log(`🔍 Probing provider: [${name.toUpperCase()}]`);
  console.log(`Configured: ${provider.isConfigured}`);

  if (!provider.isConfigured) {
    console.log(`❌ Skipped: No API key found.`);
    return;
  }

  const prompt = [{ role: "user" as const, content: "Reply with exactly one word: 'READY'" }];

  try {
    const start = Date.now();
    const result = await provider.call(prompt, { temperature: 0 });
    const elapsed = Date.now() - start;
    if (result.usedModel) {
      console.log(`✅ SUCCESS (${elapsed}ms)`);
      console.log(`Response: "${result.text}"`);
    } else {
      console.log(`❌ FAILED: ${result.text || "No response"}`);
    }
  } catch (err: any) {
    console.log(`❌ ERROR: ${err.message || err}`);
  }
}

async function main() {
  const gemini = createGeminiProvider(PROVIDERS.gemini);
  const groq = createGroqProvider(PROVIDERS.groq);
  const openrouter = createOpenRouterProvider(PROVIDERS.openrouter);
  const huggingface = createHuggingFaceProvider(PROVIDERS.huggingface);

  await probeSingle("Gemini", gemini);
  await probeSingle("Groq", groq);
  await probeSingle("OpenRouter", openrouter);
  await probeSingle("HuggingFace", huggingface);
}

main().catch(console.error);
