'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

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

function renderIndex(req) {
  const siteUrl = `${req.protocol}://${req.get('host')}`;
  const indexable = !isTemporaryHost(req.hostname);
  const robotsContent = indexable ? 'index, follow' : 'noindex, nofollow';
  return indexTemplate
    .replace(/{{SITE_URL}}/g, siteUrl)
    .replace(/{{ROBOTS_CONTENT}}/g, robotsContent);
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
  res.type('html').send(renderIndex(req));
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

app.post('/api/contato', async (req, res) => {
  if (!mailerReady) {
    res.status(503).json({ ok: false, error: 'Envio de e-mail não configurado no servidor.' });
    return;
  }

  const nome = String(req.body?.nome || '').trim();
  const email = String(req.body?.email || '').trim();
  const telefone = String(req.body?.telefone || '').trim();

  if (!nome || !email || !telefone) {
    res.status(400).json({ ok: false, error: 'Preencha nome, e-mail e telefone.' });
    return;
  }

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
      ].join('\n'),
      html: `
        <p>Novo contato recebido pelo formulário "Sua história vira livro" da Editora Revolute.</p>
        <ul>
          <li><strong>Nome:</strong> ${escapeHtml(nome)}</li>
          <li><strong>E-mail:</strong> ${escapeHtml(email)}</li>
          <li><strong>Telefone:</strong> ${escapeHtml(telefone)}</li>
        </ul>
      `,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('[contato] falha ao enviar e-mail:', error);
    res.status(502).json({ ok: false, error: 'Falha ao enviar e-mail.' });
  }
});

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
