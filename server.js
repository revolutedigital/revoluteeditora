'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const { montarEventoLead, enviarEvento } = require('./meta');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway (e a maioria dos PaaS) termina o SSL na borda e repassa pro app
// por HTTP interno — sem isso, req.protocol sempre voltaria "http", errando
// o canonical/OG em produção mesmo com o site servido via HTTPS.
app.set('trust proxy', true);

// Domínios genéricos de hosting (ex: Railway) não devem ser indexados pelo
// Google — evita conteúdo duplicado quando o site migrar pro domínio final.
// A checagem é por host da requisição, então liga/desliga sozinha na migração.
function isTemporaryHost(hostname) {
  return /\.railway\.app$/.test(hostname);
}

// www.editorarevolute.com.br e editorarevolute.com.br respondem os dois,
// então sem isso o Google via as duas versões como páginas duplicadas
// (cada uma se autodeclarando canônica). Domínio sem "www" é a versão
// oficial (decisão do Igor) — "www" só redireciona (301) pra ela.
app.use((req, res, next) => {
  if (req.hostname === 'www.editorarevolute.com.br') {
    res.redirect(301, `${req.protocol}://editorarevolute.com.br${req.originalUrl}`);
    return;
  }
  next();
});

const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const bioTemplate = fs.readFileSync(path.join(__dirname, 'bio.html'), 'utf8');

// Muda a cada deploy (o processo reinicia no Railway), então vira query
// string nos links de CSS/JS (?v=...) — invalida cache da Cloudflare e do
// navegador automaticamente a cada atualização, sem precisar de purge manual.
const ASSET_VERSION = Date.now();

// Pixel da Meta: o id (público) vem do Railway; sem ele a página sai sem pixel, e o envio server-side também fica desligado.
const META_PIXEL_ID = /^\d{10,20}$/.test(process.env.META_PIXEL_ID || '') ? process.env.META_PIXEL_ID : null;
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || null;
const META_TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || null;
const metaPixelSnippet = META_PIXEL_ID
  ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');</script>\n<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1"></noscript>`
  : '';
if (!META_PIXEL_ID) console.warn('[meta] META_PIXEL_ID não configurado — página sem Pixel e sem Conversions API.');
else if (!META_CAPI_TOKEN) console.warn('[meta] META_CAPI_TOKEN não configurado — Lead só pelo Pixel (sem Conversions API).');

function renderTemplate(template, req) {
  const siteUrl = `${req.protocol}://${req.get('host')}`;
  const indexable = !isTemporaryHost(req.hostname);
  const robotsContent = indexable ? 'index, follow' : 'noindex, nofollow';
  return template
    .replace(/{{SITE_URL}}/g, siteUrl)
    .replace(/{{ROBOTS_CONTENT}}/g, robotsContent)
    .replace(/{{META_PIXEL}}/g, metaPixelSnippet)
    .replace(/{{ASSET_VERSION}}/g, ASSET_VERSION);
}

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_TO = process.env.MAIL_TO;
const MAIL_CC = (process.env.MAIL_CC || '')
  .split(',')
  .map((address) => address.trim())
  .filter(Boolean);

const mailerReady = Boolean(SMTP_USER && SMTP_PASS && MAIL_TO);
const transporter = mailerReady
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (!mailerReady) {
  console.warn(
    '[contato] SMTP_USER, SMTP_PASS ou MAIL_TO não configurados — envio de e-mail desativado até as variáveis de ambiente serem definidas no Railway.'
  );
}

app.use(express.json());

app.get(['/', '/index.html'], (req, res) => {
  res.type('html').send(renderTemplate(indexTemplate, req));
});

// Página de links (cartão de visita digital) — não entra no sitemap.xml de
// propósito: é uma página de utilidade, não conteúdo pra competir em busca.
app.get(['/bio', '/bio.html'], (req, res) => {
  res.type('html').send(renderTemplate(bioTemplate, req));
});

app.get('/robots.txt', (req, res) => {
  const siteUrl = `${req.protocol}://${req.get('host')}`;
  const body = isTemporaryHost(req.hostname)
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  res.type('text/plain').send(body);
});

app.get('/sitemap.xml', (req, res) => {
  if (isTemporaryHost(req.hostname)) {
    res.status(404).end();
    return;
  }
  const siteUrl = `${req.protocol}://${req.get('host')}`;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${siteUrl}/</loc>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
  ].join('\n');
  res.type('application/xml').send(body);
});

// Assets/ (capas, fontes, logos) quase nunca muda depois de publicado —
// cache longo direto no navegador ajuda LCP em visitas repetidas.
app.use('/Assets', express.static(path.join(__dirname, 'Assets'), { maxAge: '7d', immutable: true }));

// index:false porque a home já tem rota própria acima (com canonical/robots
// dinâmicos); sem isso o static tentaria servir o index.html cru pra "/".
// maxAge curto aqui (CSS/JS mudam com mais frequência que os Assets acima).
app.use(express.static(path.join(__dirname), { extensions: ['html'], index: false, maxAge: '1h' }));

const texto = (valor, max = 200) => String(valor || '').trim().slice(0, max);
const OPCOES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];

function origemDoLead(corpo) {
  const ultimo = corpo?.utm && typeof corpo.utm === 'object' ? corpo.utm : {};
  const primeiro = corpo?.utmFirst && typeof corpo.utmFirst === 'object' ? corpo.utmFirst : {};
  const linhas = (rotulo, valores) => {
    const itens = OPCOES_UTM.filter((chave) => texto(valores[chave])).map((chave) => `${chave}=${texto(valores[chave])}`);
    return itens.length ? `${rotulo}: ${itens.join(' · ')}` : null;
  };
  return [
    linhas('Último toque', ultimo),
    linhas('Primeiro toque', primeiro),
    texto(corpo?.referrer) ? `Referrer: ${texto(corpo.referrer)}` : null,
  ].filter(Boolean);
}

app.post('/api/contato', async (req, res) => {
  const nome = texto(req.body?.nome, 120);
  const email = texto(req.body?.email, 160);
  const telefone = texto(req.body?.telefone, 40);

  if (!nome || !email || !telefone) {
    res.status(400).json({ ok: false, error: 'Preencha nome, e-mail e telefone.' });
    return;
  }
  const capiLigada = Boolean(META_PIXEL_ID && META_CAPI_TOKEN);
  if (!mailerReady && !capiLigada) {
    res.status(503).json({ ok: false, error: 'Envio de e-mail não configurado no servidor.' });
    return;
  }

  // As duas saídas são independentes: e-mail fora do ar não pode perder o evento da Meta, e vice-versa.
  const [email_, meta] = await Promise.all([enviarEmail({ nome, email, telefone, origem: origemDoLead(req.body) }), enviarLeadParaMeta(req, { nome, email, telefone })]);
  if (!email_.ok && !meta.ok) {
    res.status(502).json({ ok: false, error: 'Falha ao registrar o contato.', email: email_.ok, meta: meta.ok });
    return;
  }
  res.json({ ok: true, email: email_.ok, meta: meta.ok });
});

async function enviarEmail({ nome, email, telefone, origem }) {
  if (!mailerReady) return { ok: false };
  try {
    await transporter.sendMail({
      from: `"LP História vira Livro" <${SMTP_USER}>`,
      to: MAIL_TO,
      cc: MAIL_CC.length ? MAIL_CC : undefined,
      replyTo: email,
      subject: 'Novo contato — LP História vira Livro (Editora Revolute)',
      text: [
        'Novo contato recebido pelo formulário "Sua história vira livro" da Editora Revolute.',
        '',
        `Nome: ${nome}`,
        `E-mail: ${email}`,
        `Telefone: ${telefone}`,
        ...(origem.length ? ['', 'Origem do clique:', ...origem] : []),
      ].join('\n'),
      html: `
        <p>Novo contato recebido pelo formulário "Sua história vira livro" da Editora Revolute.</p>
        <ul>
          <li><strong>Nome:</strong> ${escapeHtml(nome)}</li>
          <li><strong>E-mail:</strong> ${escapeHtml(email)}</li>
          <li><strong>Telefone:</strong> ${escapeHtml(telefone)}</li>
        </ul>
        ${origem.length ? `<p><strong>Origem do clique:</strong></p><ul>${origem.map((linha) => `<li>${escapeHtml(linha)}</li>`).join('')}</ul>` : ''}
      `,
    });
    return { ok: true };
  } catch (error) {
    console.error('[contato] falha ao enviar e-mail:', error);
    return { ok: false };
  }
}

// Lead na Conversions API, com o mesmo event_id do Pixel do navegador (a Meta conta um só).
async function enviarLeadParaMeta(req, { nome, email, telefone }) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return { ok: false };
  const siteUrl = `${req.protocol}://${req.get('host')}/`;
  const evento = montarEventoLead({
    eventId: req.body?.eventId,
    agora: new Date(),
    urlPadrao: siteUrl,
    sourceUrl: req.body?.sourceUrl,
    nome,
    email,
    telefone,
    fbp: req.body?.fbp,
    fbc: req.body?.fbc,
    ip: req.get('cf-connecting-ip') || req.ip,
    userAgent: req.get('user-agent'),
  });
  const retorno = await enviarEvento({ pixelId: META_PIXEL_ID, token: META_CAPI_TOKEN, testEventCode: META_TEST_EVENT_CODE }, evento);
  // Sem dado pessoal no log: só o id do evento e o resultado.
  if (retorno.ok) console.log('[meta] Lead enviado', { eventId: evento.event_id, teste: Boolean(META_TEST_EVENT_CODE) });
  else console.error('[meta] Lead não enviado', { eventId: evento.event_id, status: retorno.status, erro: retorno.erro, passageira: retorno.passageira });
  return retorno;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.listen(PORT, () => {
  console.log(`Editora Revolute LP rodando na porta ${PORT}`);
});
