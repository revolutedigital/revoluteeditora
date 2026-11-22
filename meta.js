'use strict';

/**
 * Conversions API da Meta para o Lead da LP. O navegador dispara o Pixel com um `eventID` e manda o mesmo id ao
 * servidor; o servidor envia o mesmo evento pela API com dados do contato em SHA-256. A Meta junta os dois pelo
 * `event_id` (só conta um) e usa os dados do servidor para atribuir o lead mesmo com bloqueador ou navegador do
 * Instagram. Nenhum dado pessoal sai daqui sem hash.
 */
const crypto = require('crypto');

const GRAPH_VERSION = 'v25.0';
const TIMEOUT_MS = 8000;
const SITE_HOSTS = new Set(['editorarevolute.com.br', 'www.editorarevolute.com.br']);

const sha256 = (valor) => crypto.createHash('sha256').update(valor, 'utf8').digest('hex');

function normalizarEmail(bruto) {
  const email = String(bruto || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Telefone brasileiro em dígitos com DDI 55 (celular 11 dígitos, fixo 10); outro formato não é enviado. */
function normalizarTelefone(bruto) {
  const digitos = String(bruto || '').replace(/\D/g, '').replace(/^0+/, '');
  if (/^[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digitos)) return `55${digitos}`;
  if (/^55[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digitos)) return digitos;
  return null;
}

/** Minúsculas, sem espaço nem pontuação ASCII, acento mantido (regra da Meta). */
function normalizarNome(bruto) {
  const limpo = (parte) => parte.toLowerCase().replace(/[\s!-/:-@[-`{-~]/g, '');
  const partes = String(bruto || '').trim().split(/\s+/).map(limpo).filter(Boolean);
  return { primeiro: partes[0] || null, ultimo: partes.length > 1 ? partes[partes.length - 1] : null };
}

const FBP = /^fb\.\d\.\d{10,13}\.\d{1,20}$/;
const FBC = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,300}$/;
const ID_DO_EVENTO = /^[A-Za-z0-9_-]{8,64}$/;

/** Só vale URL https do próprio site (o campo vem do navegador); qualquer outra coisa cai na home. */
function urlDeOrigem(bruta, padrao) {
  try {
    const url = new URL(String(bruta));
    if (url.protocol === 'https:' && (SITE_HOSTS.has(url.hostname) || url.hostname.endsWith('.railway.app'))) {
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    // cai no padrão
  }
  return padrao;
}

function montarEventoLead({ eventId, agora, urlPadrao, sourceUrl, nome, email, telefone, fbp, fbc, ip, userAgent }) {
  const { primeiro, ultimo } = normalizarNome(nome);
  const emailNormalizado = normalizarEmail(email);
  const telefoneNormalizado = normalizarTelefone(telefone);
  const usuario = {
    ...(emailNormalizado ? { em: [sha256(emailNormalizado)] } : {}),
    ...(telefoneNormalizado ? { ph: [sha256(telefoneNormalizado)] } : {}),
    ...(primeiro ? { fn: [sha256(primeiro)] } : {}),
    ...(ultimo ? { ln: [sha256(ultimo)] } : {}),
    country: [sha256('br')],
    ...(ip ? { client_ip_address: ip } : {}),
    ...(userAgent ? { client_user_agent: userAgent } : {}),
    ...(FBP.test(String(fbp || '')) ? { fbp } : {}),
    ...(FBC.test(String(fbc || '')) ? { fbc } : {}),
  };
  return {
    event_name: 'Lead',
    event_time: Math.floor(agora.getTime() / 1000),
    event_id: ID_DO_EVENTO.test(String(eventId || '')) ? eventId : `srv-${crypto.randomUUID()}`,
    action_source: 'website',
    event_source_url: urlDeOrigem(sourceUrl, urlPadrao),
    user_data: usuario,
    custom_data: { content_name: 'Livro sob medida' },
  };
}

/**
 * Envia um evento. Nunca lança: devolve `{ ok, status, erro }` para quem chama registrar sem dado pessoal.
 * Falha de rede, timeout, 5xx e 429 são passageiras (`passageira: true`); 4xx é pedido inválido.
 */
async function enviarEvento({ pixelId, token, testEventCode }, evento, buscar = fetch) {
  try {
    const resposta = await buscar(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: [evento], ...(testEventCode ? { test_event_code: testEventCode } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (resposta.ok && Number(corpo.events_received) >= 1) return { ok: true, status: resposta.status, erro: null, passageira: false };
    const mensagem = String(corpo?.error?.message || `HTTP ${resposta.status}`).slice(0, 200);
    return { ok: false, status: resposta.status, erro: mensagem, passageira: resposta.status === 429 || resposta.status >= 500 };
  } catch (erro) {
    return { ok: false, status: null, erro: String(erro?.message || 'falha de rede').slice(0, 200), passageira: true };
  }
}

module.exports = { sha256, normalizarEmail, normalizarTelefone, normalizarNome, urlDeOrigem, montarEventoLead, enviarEvento };
