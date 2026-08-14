'use strict';

const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

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
      from: `"LP Editora Revolute" <${SMTP_USER}>`,
      to: MAIL_TO,
      cc: MAIL_CC.length ? MAIL_CC : undefined,
      replyTo: email,
      subject: 'Novo contato — LP Editora Revolute',
      text: [
        'Novo contato recebido pelo formulário da LP da Editora Revolute.',
        '',
        `Nome: ${nome}`,
        `E-mail: ${email}`,
        `Telefone: ${telefone}`,
      ].join('\n'),
      html: `
        <p>Novo contato recebido pelo formulário da LP da Editora Revolute.</p>
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
