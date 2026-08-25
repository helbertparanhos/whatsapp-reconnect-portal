#!/usr/bin/env node
/**
 * Exporta a arvore publicavel do projeto.
 *
 * Por que existe: o repositorio de trabalho carrega o estado do processo de
 * planejamento, que inclui o levantamento do ambiente de origem. O
 * repositorio publico leva apenas o que serve a quem adota o projeto — codigo,
 * `docs/` e a documentacao de entrada.
 *
 * Copiar a mao e a forma classica de esquecer um arquivo. Este script torna a
 * exportacao repetivel e auditavel: ele lista o que copiou, o que excluiu, e
 * FALHA se encontrar um termo proibido.
 *
 * Uso:
 *   node scripts/export-public.mjs ../destino --excluir <pasta-de-planejamento>
 *   node scripts/export-public.mjs ../destino --termos "MinhaEmpresa,cliente-x"
 */

import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const destino = args[0];

if (!destino) {
  console.error("Uso: node scripts/export-public.mjs <destino> [--excluir dir1,dir2] [--termos \"a,b\"]");
  process.exit(1);
}

/**
 * Caminhos sempre excluidos. Nada aqui e util a quem adota o projeto.
 */
const EXCLUIR = [/^\.env$/, /^node_modules\//, /^dist\//];

/**
 * Diretorios adicionais a excluir, passados com --excluir.
 *
 * E aqui que entra a pasta de planejamento interno: ela e util para quem
 * mantem, e inadequada para quem adota — costuma conter levantamento do
 * ambiente, nomes de cliente e detalhe de infraestrutura.
 *
 *   node scripts/export-public.mjs ../destino --excluir .planejamento,notas
 */

/**
 * Termos que reprovam a exportacao. Os genericos ficam sempre; passe os seus
 * com --termos. Falhar aqui e barato; descobrir depois do push, nao.
 */
const idxExcluir = args.indexOf("--excluir");
const EXCLUIR_PREFIXOS =
  idxExcluir !== -1 && args[idxExcluir + 1]
    ? args[idxExcluir + 1].split(",").map((d) => d.trim().replace(/\/+$/, "")).filter(Boolean)
    : [];

const idx = args.indexOf("--termos");
const TERMOS = [
  ...(idx !== -1 && args[idx + 1] ? args[idx + 1].split(",").map((t) => t.trim()) : []),
].filter(Boolean);

const PADROES_SEGREDO = [
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { nome: "chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/**
 * Verifica TUDO, exceto binario conhecido.
 *
 * A versao anterior listava extensoes permitidas — e deixava passar arquivo sem
 * extensao (.gitignore, .dockerignore, Dockerfile, LICENSE). Lista de permitidos
 * e onde vazamento se esconde: o que voce esqueceu de listar nao e verificado.
 */
const BINARIO = /\.(png|jpe?g|gif|ico|svg|webp|avif|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|lockb)$/i;

// ---------------------------------------------------------------------------

const rastreados = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const excluido = (f) =>
  EXCLUIR.some((re) => re.test(f)) ||
  EXCLUIR_PREFIXOS.some((p) => f === p || f.startsWith(`${p}/`));

const copiar = rastreados.filter((f) => !excluido(f));
const excluidos = rastreados.length - copiar.length;

console.log(`Arquivos rastreados: ${rastreados.length}`);
console.log(`Excluidos:           ${excluidos}`);
console.log(`A copiar:            ${copiar.length}\n`);

const ARQUIVOS_DE_IGNORE = [".gitignore", ".dockerignore", ".npmignore", ".eslintignore"];
let linhasRemovidas = 0;

/**
 * Conteudo final de um arquivo — ja transformado, como sera escrito.
 *
 * Excluir um diretorio e deixar o nome dele no `.gitignore` anula o proposito da
 * exclusao: o nome viaja junto assim mesmo.
 */
function conteudoFinal(arquivo) {
  const bruto = readFileSync(arquivo, "utf8");

  if (EXCLUIR_PREFIXOS.length === 0 || !ARQUIVOS_DE_IGNORE.includes(arquivo)) {
    return bruto;
  }

  const linhas = bruto.split(/\r?\n/);
  const filtrado = linhas.filter((linha) => {
    const l = linha.trim().replace(/^!/, "").replace(/\/+$/, "");
    return !EXCLUIR_PREFIXOS.some((p) => l === p || l.startsWith(`${p}/`));
  });
  linhasRemovidas += linhas.length - filtrado.length;
  return filtrado.join("\n");
}

// ---- verificacao ANTES de copiar ------------------------------------------
//
// Verifica o conteudo FINAL, nao o original. Verificar o original reprovaria um
// arquivo cuja unica ocorrencia sera removida na transformacao — e, pior,
// aprovaria o inverso se a transformacao introduzisse algo.

let problemas = 0;

for (const arquivo of copiar) {
  if (BINARIO.test(arquivo)) continue;

  let conteudo;
  try {
    conteudo = conteudoFinal(arquivo);
  } catch {
    continue;
  }

  for (const termo of TERMOS) {
    if (conteudo.toLowerCase().includes(termo.toLowerCase())) {
      console.error(`✗ ${arquivo}: termo proibido "${termo}"`);
      problemas++;
    }
  }
  for (const { nome, re } of PADROES_SEGREDO) {
    if (re.test(conteudo)) {
      console.error(`✗ ${arquivo}: ${nome} (valor omitido)`);
      problemas++;
    }
  }
}

if (problemas > 0) {
  console.error(`\n${problemas} problema(s). Exportacao abortada — nada foi escrito.`);
  process.exit(1);
}

console.log("✓ Verificacao passou: nenhum termo proibido, nenhum segredo.\n");

// ---- copia -----------------------------------------------------------------

if (existsSync(destino)) {
  rmSync(destino, { recursive: true, force: true });
}

for (const arquivo of copiar) {
  const alvo = join(destino, arquivo);
  mkdirSync(dirname(alvo), { recursive: true });

  if (EXCLUIR_PREFIXOS.length > 0 && ARQUIVOS_DE_IGNORE.includes(arquivo)) {
    writeFileSync(alvo, conteudoFinal(arquivo));
    continue;
  }

  copyFileSync(arquivo, alvo);
}

if (linhasRemovidas > 0) {
  console.log(`  (${linhasRemovidas} linha(s) removidas de arquivos de ignore)`);
}

console.log(`✓ ${copiar.length} arquivo(s) exportados para ${destino}\n`);
console.log("Proximos passos:");
console.log(`  cd ${destino}`);
console.log("  git init && git add -A");
console.log("  git commit -m 'feat: portal de reconexao de WhatsApp multi-provider'");
console.log("  gh repo create <nome> --public --source=. --push");
console.log("\nO historico comeca aqui: nenhum commit anterior viaja junto.");
