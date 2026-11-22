'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sha256, normalizarEmail, normalizarTelefone, normalizarNome, urlDeOrigem, montarEventoLead, enviarEvento } = require('./meta');

test('telefone brasileiro vira dígitos com DDI 55; outro formato é descartado', () => {
  assert.equal(normalizarTelefone('(11) 98367-9797'), '5511983679797');
  assert.equal(normalizarTelefone('+55 11 98367-9797'), '5511983679797');
  assert.equal(normalizarTelefone('011 3456-7890'), '551134567890');
  assert.equal(normalizarTelefone('12345'), null);
  assert.equal(normalizarTelefone('+1 415 555 0100'), null);
  assert.equal(normalizarTelefone(''), null);
});

test('e-mail em minúsculas e sem espaço; inválido é descartado', () => {
  assert.equal(normalizarEmail('  Maria@Exemplo.com '), 'maria@exemplo.com');
  assert.equal(normalizarEmail('sem-arroba'), null);
});

test('nome: primeiro e último em minúsculas, sem pontuação, acento mantido', () => {
  assert.deepEqual(normalizarNome("  José  D'Ávila  Silva "), { primeiro: 'josé', ultimo: 'silva' });
  assert.deepEqual(normalizarNome('Maria'), { primeiro: 'maria', ultimo: null });
  assert.deepEqual(normalizarNome(''), { primeiro: null, ultimo: null });
});

test('url de origem só vale https do próprio site, sem query', () => {
  const padrao = 'https://editorarevolute.com.br/';
  assert.equal(urlDeOrigem('https://editorarevolute.com.br/?utm_source=meta&fbclid=x', padrao), 'https://editorarevolute.com.br/');
  assert.equal(urlDeOrigem('http://editorarevolute.com.br/', padrao), padrao);
  assert.equal(urlDeOrigem('https://outro-site.com/', padrao), padrao);
  assert.equal(urlDeOrigem('lixo', padrao), padrao);
});

const base = {
  eventId: 'b3f2c1d4-aaaa-4bbb-8ccc-123456789abc',
  agora: new Date('2026-11-21T15:00:00.000Z'),
  urlPadrao: 'https://editorarevolute.com.br/',
  sourceUrl: 'https://editorarevolute.com.br/',
  nome: 'Maria Souza',
  email: 'Maria@Exemplo.com',
  telefone: '(11) 98367-9797',
  fbp: 'fb.1.1795273200000.1234567890',
  fbc: 'fb.1.1795273200000.IwAR0AbC_dEf',
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
};

test('evento Lead: mesmo event_id do Pixel, dados do contato só em SHA-256 e sem dado cru', () => {
  const evento = montarEventoLead(base);
  assert.equal(evento.event_name, 'Lead');
  assert.equal(evento.event_id, base.eventId);
  assert.equal(evento.event_time, 1795273200);
  assert.equal(evento.action_source, 'website');
  assert.deepEqual(evento.user_data.em, ['905231986a8c247271f571ca09ae3b15edcd8ec2fd5de9931ac02bda02a22e37']);
  assert.deepEqual(evento.user_data.ph, ['52a92b44dd240d047b94cf2fe8eec91197f3a5a80a8e6deb4fd5fa0c5e2a70b3']);
  assert.deepEqual(evento.user_data.fn, [sha256('maria')]);
  assert.deepEqual(evento.user_data.ln, [sha256('souza')]);
  assert.equal(evento.user_data.fbp, base.fbp);
  assert.equal(evento.user_data.fbc, base.fbc);
  assert.equal(evento.user_data.client_ip_address, '203.0.113.7');
  const serializado = JSON.stringify(evento);
  for (const cru of ['Maria', 'exemplo.com', '98367', 'Souza']) assert.ok(!serializado.includes(cru), `vazou "${cru}"`);
});

test('id de evento inválido ou ausente vira um id do servidor; fbp/fbc mal formados são omitidos', () => {
  const evento = montarEventoLead({ ...base, eventId: 'x', fbp: 'lixo', fbc: '<script>' });
  assert.match(evento.event_id, /^srv-/);
  assert.equal(evento.user_data.fbp, undefined);
  assert.equal(evento.user_data.fbc, undefined);
});

test('sem telefone válido manda o resto, sem ph', () => {
  const evento = montarEventoLead({ ...base, telefone: '123' });
  assert.equal(evento.user_data.ph, undefined);
  assert.ok(evento.user_data.em);
});

const config = { pixelId: '1424051009717284', token: 'token-de-teste' };
const resposta = (status, corpo) => async () => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

test('envio aceito: ok, com o token só no cabeçalho e o test_event_code quando configurado', async () => {
  let chamada;
  const retorno = await enviarEvento({ ...config, testEventCode: 'TEST42' }, montarEventoLead(base), async (url, init) => {
    chamada = { url, init };
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  });
  assert.deepEqual(retorno, { ok: true, status: 200, erro: null, passageira: false });
  assert.equal(chamada.url, 'https://graph.facebook.com/v25.0/1424051009717284/events');
  assert.equal(chamada.init.headers.Authorization, 'Bearer token-de-teste');
  assert.ok(!chamada.init.body.includes('token-de-teste'));
  assert.equal(JSON.parse(chamada.init.body).test_event_code, 'TEST42');
});

test('400 é recusa (não repete); 429, 5xx e rede caída são passageiras; nada lança', async () => {
  const evento = montarEventoLead(base);
  const recusa = await enviarEvento(config, evento, resposta(400, { error: { message: 'Invalid parameter' } }));
  assert.deepEqual([recusa.ok, recusa.passageira, recusa.erro], [false, false, 'Invalid parameter']);
  for (const status of [429, 500, 503]) {
    assert.equal((await enviarEvento(config, evento, resposta(status, {}))).passageira, true);
  }
  const semRede = await enviarEvento(config, evento, async () => { throw new Error('ECONNRESET'); });
  assert.deepEqual([semRede.ok, semRede.status, semRede.passageira], [false, null, true]);
  const semEvento = await enviarEvento(config, evento, resposta(200, { events_received: 0 }));
  assert.equal(semEvento.ok, false);
});
