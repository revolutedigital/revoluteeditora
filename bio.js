(() => {
  'use strict';

  const emailLink = document.querySelector('[data-email-link]');
  if (!emailLink) return;

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const subject = `Interesse nos serviços da Editora | ${day}/${month}/${year}`;

  emailLink.href = `mailto:contato@editorarevolute.com.br?subject=${encodeURIComponent(subject)}`;
})();
