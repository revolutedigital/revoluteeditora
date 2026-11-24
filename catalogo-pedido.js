'use strict';

/**
 * Regras do pedido do catálogo de torres de livros. O navegador manda só ids e quantidades; preço, nome e total saem
 * sempre do catálogo guardado no servidor (o cliente nunca define valor).
 */
const fs = require('fs');
const path = require('path');

const ARQUIVO_DADOS = path.join(__dirname, 'catalogo-dados.json');
const ARQUIVO_CLIENTES = path.join(__dirname, 'catalogo-clientes.json');
const QTD_MAXIMA_POR_ITEM = 5000;
const MAX_ITENS_NO_PEDIDO = 200;
const SLUG = /^[a-z0-9-]{1,40}$/;

const moeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const arredondar = (valor) => Math.round(valor * 100) / 100;

function carregarJson(arquivo) {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

function carregarCatalogo() {
  const dados = carregarJson(ARQUIVO_DADOS);
  const porId = new Map(dados.itens.map((item) => [item.id, item]));
  return { dados, porId, clientes: carregarJson(ARQUIVO_CLIENTES) };
}

/**
 * Confere o pedido contra o catálogo. Devolve `{ ok, erro }` ou `{ ok, linhas, total, ... }` com os valores
 * recalculados; qualquer id desconhecido ou quantidade fora da regra recusa o pedido inteiro.
 */
function validarPedido(corpo, catalogo) {
  const texto = (valor, max) => String(valor ?? '').trim().slice(0, max);
  const qtdMinima = catalogo.dados.regras.qtdMinima;

  const contato = { nome: texto(corpo?.nome, 120), loja: texto(corpo?.loja, 120), telefone: texto(corpo?.telefone, 40), email: texto(corpo?.email, 160) };
  if (!contato.nome || !contato.telefone) return { ok: false, erro: 'Informe seu nome e telefone.' };
  if (contato.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email)) return { ok: false, erro: 'E-mail inválido.' };

  const cliente = SLUG.test(String(corpo?.cliente || '')) && catalogo.clientes[corpo.cliente] ? corpo.cliente : null;

  if (!Array.isArray(corpo?.itens) || corpo.itens.length === 0) return { ok: false, erro: 'O pedido está vazio.' };
  if (corpo.itens.length > MAX_ITENS_NO_PEDIDO) return { ok: false, erro: 'Itens demais no pedido.' };

  const vistos = new Set();
  const linhas = [];
  for (const entrada of corpo.itens) {
    const item = catalogo.porId.get(String(entrada?.id));
    const qtd = Number(entrada?.qtd);
    if (!item) return { ok: false, erro: 'Item fora do catálogo.' };
    if (vistos.has(item.id)) return { ok: false, erro: 'Item repetido no pedido.' };
    vistos.add(item.id);
    if (!Number.isInteger(qtd) || qtd < qtdMinima || qtd > QTD_MAXIMA_POR_ITEM) {
      return { ok: false, erro: `"${item.nome}": a quantidade deve ser de ${qtdMinima} a ${QTD_MAXIMA_POR_ITEM} unidades.` };
    }
    linhas.push({ id: item.id, ean: item.ean, nome: item.nome, ncm: item.ncm, qtd, repasse: item.repasse, subtotal: arredondar(item.repasse * qtd) });
  }

  const total = arredondar(linhas.reduce((soma, linha) => soma + linha.subtotal, 0));
  const unidades = linhas.reduce((soma, linha) => soma + linha.qtd, 0);
  return { ok: true, contato, cliente, linhas, total, unidades };
}

/** Texto do pedido (e-mail e WhatsApp): o mesmo que o navegador monta, mas com os valores do servidor. */
function textoDoPedido(pedido, catalogo) {
  const nomeCliente = pedido.cliente ? catalogo.clientes[pedido.cliente].nome : null;
  return [
    `Pedido do catálogo de torres de livros${nomeCliente ? ` — ${nomeCliente}` : ''}`,
    '',
    `Contato: ${pedido.contato.nome}${pedido.contato.loja ? ` (${pedido.contato.loja})` : ''}`,
    `Telefone: ${pedido.contato.telefone}`,
    ...(pedido.contato.email ? [`E-mail: ${pedido.contato.email}`] : []),
    '',
    ...pedido.linhas.map((linha) => `${linha.qtd} × ${linha.nome} (EAN ${linha.ean}) — ${moeda(linha.repasse)} = ${moeda(linha.subtotal)}`),
    '',
    `${pedido.unidades} unidades · Total ${moeda(pedido.total)}`,
  ].join('\n');
}

module.exports = { carregarCatalogo, validarPedido, textoDoPedido, moeda, SLUG };
