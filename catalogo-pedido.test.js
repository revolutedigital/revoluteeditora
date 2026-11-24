'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validarPedido, textoDoPedido } = require('./catalogo-pedido');

function catalogoDeTeste() {
  const itens = [
    { id: '7898000000014', ean: '7898000000014', nome: 'Livro de Colorir Comfy', ncm: '49030000', repasse: 4.99, venda: 9.9 },
    { id: '7898000000021', ean: '7898000000021', nome: 'Quebra-Cabeça Fazendinha 24 Peças', ncm: null, repasse: 9.99, venda: 19.9 },
  ];
  return {
    dados: { regras: { qtdMinima: 10 }, itens },
    porId: new Map(itens.map((item) => [item.id, item])),
    clientes: { mairinque: { nome: 'Supermercados de Mairinque', metaSugerida: 20000 } },
  };
}

const contato = { nome: 'Ana', loja: 'Mercado Central', telefone: '(15) 99999-0000' };

test('o total vem do preço do catálogo, nunca do que o navegador mandou', () => {
  const pedido = validarPedido({ ...contato, cliente: 'mairinque', itens: [{ id: '7898000000014', qtd: 20, repasse: 0.01 }, { id: '7898000000021', qtd: 10 }] }, catalogoDeTeste());
  assert.equal(pedido.ok, true);
  assert.equal(pedido.total, 199.7);
  assert.equal(pedido.unidades, 30);
  assert.equal(pedido.cliente, 'mairinque');
});

test('quantidade abaixo do mínimo, fracionada ou absurda recusa o pedido inteiro', () => {
  for (const qtd of [9, 0, -10, 10.5, '10', 5001, null]) {
    const pedido = validarPedido({ ...contato, itens: [{ id: '7898000000014', qtd }] }, catalogoDeTeste());
    assert.equal(pedido.ok, qtd === '10' ? true : false, `qtd ${JSON.stringify(qtd)}`);
  }
});

test('item fora do catálogo ou repetido é recusado', () => {
  assert.equal(validarPedido({ ...contato, itens: [{ id: '0000000000000', qtd: 10 }] }, catalogoDeTeste()).ok, false);
  assert.equal(validarPedido({ ...contato, itens: [{ id: '7898000000014', qtd: 10 }, { id: '7898000000014', qtd: 10 }] }, catalogoDeTeste()).ok, false);
});

test('exige nome, telefone e ao menos um item; e-mail precisa ser válido quando informado', () => {
  const itens = [{ id: '7898000000014', qtd: 10 }];
  assert.equal(validarPedido({ nome: '', telefone: '1', itens }, catalogoDeTeste()).ok, false);
  assert.equal(validarPedido({ nome: 'Ana', telefone: '', itens }, catalogoDeTeste()).ok, false);
  assert.equal(validarPedido({ ...contato, itens: [] }, catalogoDeTeste()).ok, false);
  assert.equal(validarPedido({ ...contato, email: 'sem-arroba', itens }, catalogoDeTeste()).ok, false);
  assert.equal(validarPedido({ ...contato, email: 'ana@loja.com', itens }, catalogoDeTeste()).ok, true);
  assert.equal(validarPedido(undefined, catalogoDeTeste()).ok, false);
});

test('cliente desconhecido ou fora do padrão não passa para o pedido', () => {
  const itens = [{ id: '7898000000014', qtd: 10 }];
  assert.equal(validarPedido({ ...contato, cliente: '../etc', itens }, catalogoDeTeste()).cliente, null);
  assert.equal(validarPedido({ ...contato, cliente: 'outro', itens }, catalogoDeTeste()).cliente, null);
});

test('texto do pedido lista título, EAN, quantidade e total em reais', () => {
  const catalogo = catalogoDeTeste();
  const pedido = validarPedido({ ...contato, cliente: 'mairinque', itens: [{ id: '7898000000014', qtd: 10 }] }, catalogo);
  const texto = textoDoPedido(pedido, catalogo);
  assert.match(texto, /Supermercados de Mairinque/);
  assert.match(texto, /10 × Livro de Colorir Comfy \(EAN 7898000000014\)/);
  assert.match(texto, /10 unidades · Total R\$\s?49,90/);
});
