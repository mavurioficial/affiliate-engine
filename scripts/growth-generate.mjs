// Uso: node scripts/growth-generate.mjs <ofertas.json> <diretorio-de-saida>
// Somente gera rascunhos. Não publica, não lê credenciais e não acessa APIs externas.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateDrafts } from "../growth/content.mjs";

async function main() {
  const [inputFile, outputDir] = process.argv.slice(2);
  if (!inputFile || !outputDir) {
    throw new Error("Uso: npm run growth:generate -- <ofertas.json> <diretorio-de-saida>");
  }
  const offers = JSON.parse(await readFile(inputFile, "utf8"));
  const drafts = generateDrafts(offers);
  await mkdir(outputDir, { recursive: true });

  const manifest = [];
  for (const draft of drafts) {
    const { card_svg, ...metadata } = draft;
    const cardFile = draft.id + ".svg";
    await writeFile(join(outputDir, cardFile), card_svg, "utf8");
    manifest.push({ ...metadata, card_file: cardFile });
  }

  await writeFile(
    join(outputDir, "drafts.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), drafts: manifest }, null, 2) + "\n",
    "utf8"
  );
  console.log("Mavuri Growth: " + drafts.length + " rascunhos gerados para revisão.");
}

main().catch((error) => {
  console.error("Growth Engine:", error.message);
  process.exitCode = 1;
});
