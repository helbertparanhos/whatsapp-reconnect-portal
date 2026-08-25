#!/usr/bin/env node
/**
 * Varredura de segredo no bundle publicado.
 *
 * Tudo em `dist/` e servido cru para qualquer visitante. Uma variavel com
 * prefixo `VITE_` e embutida em texto no bundle — e a diferenca entre uma chave
 * publicavel e uma chave secreta e apenas quem a colocou ali.
 *
 * Este script falha o build. E a unica barreira automatica entre um segredo e a
 * internet (FR-13, RNF-04).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist";

/**
 * Padroes de segredo. Cada um mira uma forma concreta, nao "parece um segredo":
 * regra vaga produz falso positivo, e barreira que grita sem motivo e a primeira
 * a ser desligada.
 */
const PADROES = [
  { nome: "JWT (chave de servico ou anon)", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { nome: "chave privada PEM", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { nome: "token da AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nome: "chave secreta do Stripe", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { nome: "token do Slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { nome: "token do GitHub", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { nome: "variavel de service role", re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']{20,}["']/ },
  { nome: "segredo de emissao", re: /PORTAL_ISSUE_SECRET\s*[:=]\s*["'][^"']{8,}["']/ },
];

/**
 * Termos que nao podem aparecer no bundle publicado.
 *
 * Vazio por padrao. Preencha com o que identificaria a sua operacao: nome de
 * cliente, dominio interno, host de ferramenta (FR-20).
 */
const TERMOS_PROIBIDOS = [];

const EXTENSOES = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map", ".txt"]);

function* arquivos(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) yield* arquivos(caminho);
    else if (EXTENSOES.has(extname(caminho))) yield caminho;
  }
}

let falhas = 0;
let verificados = 0;

try {
  statSync(DIST);
} catch {
  console.error(`✗ ${DIST}/ nao existe. Rode 'npm run build' antes.`);
  process.exit(1);
}

for (const arquivo of arquivos(DIST)) {
  verificados++;
  const conteudo = readFileSync(arquivo, "utf8");

  for (const { nome, re } of PADROES) {
    const m = conteudo.match(re);
    if (m) {
      // Nunca imprime o valor encontrado: o log do CI costuma ser publico.
      console.error(`✗ ${arquivo}: ${nome} (${m[0].length} caracteres, valor omitido)`);
      falhas++;
    }
  }

  for (const re of TERMOS_PROIBIDOS) {
    if (re.test(conteudo)) {
      console.error(`✗ ${arquivo}: termo da operacao de origem: ${re}`);
      falhas++;
    }
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} problema(s) em ${verificados} arquivo(s). Build bloqueado.`);
  process.exit(1);
}

console.log(`✓ ${verificados} arquivo(s) verificados em ${DIST}/: nenhum segredo, nenhum termo proibido.`);
