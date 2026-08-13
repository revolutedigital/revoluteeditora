(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5515981828332';
  const WEB3FORMS_ACCESS_KEY = 'b753e3a9-0941-4180-b358-277db7dc6221';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Loading screen ---------- */
  const loader = document.querySelector('[data-loader]');
  if (loader) {
    if (prefersReducedMotion) {
      loader.classList.add('loader-hidden');
    } else {
      document.body.style.overflow = 'hidden';
      const wordEl = loader.querySelector('[data-loader-word]');
      const fillEl = loader.querySelector('[data-loader-fill]');
      const words = ['Escrever', 'Editar', 'Publicar'];

      let wordIndex = 0;
      const wordTimer = window.setInterval(() => {
        wordIndex = (wordIndex + 1) % words.length;
        wordEl.style.opacity = '0';
        window.setTimeout(() => {
          wordEl.textContent = words[wordIndex];
          wordEl.style.opacity = '1';
        }, 150);
      }, 900);

      const DURATION = 2700;
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / DURATION, 1);
        fillEl.style.transform = `scaleX(${progress})`;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          window.clearInterval(wordTimer);
          window.setTimeout(() => {
            loader.classList.add('loader-hidden');
            document.body.style.overflow = '';
          }, 400);
        }
      }
      requestAnimationFrame(tick);
    }
  }

  /* ---------- Scroll reveal ---------- */
  const revealTargets = document.querySelectorAll('.reveal');
  if (revealTargets.length) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry, index) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = prefersReducedMotion ? 0 : index * 60;
          window.setTimeout(() => el.classList.add('visible'), delay);
          observer.unobserve(el);
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  /* ---------- Galeria de capas (autoplay + drag) ---------- */
  const galleryWrap = document.querySelector('[data-gallery]');
  const galleryTrack = document.querySelector('[data-gallery-track]');
  if (galleryWrap && galleryTrack) {
    const originalCovers = Array.from(galleryTrack.children);
    originalCovers.forEach((img) => {
      const clone = img.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      galleryTrack.appendChild(clone);
    });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let autoplayPaused = false;
    const AUTOPLAY_SPEED = 0.55;

    function step() {
      if (!isDragging && !autoplayPaused && !prefersReducedMotion) {
        const halfWidth = galleryTrack.scrollWidth / 2;
        if (halfWidth > 0) {
          galleryWrap.scrollLeft = (galleryWrap.scrollLeft + AUTOPLAY_SPEED) % halfWidth;
        }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (supportsHover) {
      galleryWrap.addEventListener('mouseenter', () => { autoplayPaused = true; });
      galleryWrap.addEventListener('mouseleave', () => { autoplayPaused = false; isDragging = false; });
    }

    galleryWrap.addEventListener('pointerdown', (event) => {
      isDragging = true;
      dragStartX = event.clientX;
      dragStartScroll = galleryWrap.scrollLeft;
      galleryWrap.setPointerCapture(event.pointerId);
    });
    galleryWrap.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      const delta = event.clientX - dragStartX;
      galleryWrap.scrollLeft = dragStartScroll - delta;
    });
    ['pointerup', 'pointercancel'].forEach((eventName) => {
      galleryWrap.addEventListener(eventName, () => { isDragging = false; });
    });
  }

  /* ---------- Modal + formulário ---------- */
  const overlay = document.querySelector('[data-modal-overlay]');
  const openTriggers = document.querySelectorAll('[data-open-modal]');
  const closeTrigger = document.querySelector('[data-close-modal]');
  const leadForm = document.querySelector('[data-lead-form]');
  const formError = document.querySelector('[data-form-error]');
  let lastFocusedElement = null;

  function openModal(event) {
    if (event) event.preventDefault();
    lastFocusedElement = document.activeElement;
    overlay.removeAttribute('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const firstField = leadForm.querySelector('input');
    if (firstField) firstField.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
    window.setTimeout(() => overlay.setAttribute('hidden', ''), 150);
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  openTriggers.forEach((trigger) => trigger.addEventListener('click', openModal));
  if (closeTrigger) closeTrigger.addEventListener('click', closeModal);
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay && overlay.classList.contains('visible')) closeModal();
  });

  if (leadForm) {
    leadForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(leadForm);
      const nome = String(formData.get('nome') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const telefone = String(formData.get('telefone') || '').trim();

      if (!nome || !email || !telefone) {
        formError.removeAttribute('hidden');
        return;
      }
      formError.setAttribute('hidden', '');

      const mensagem = [
        'Olá! Quero conversar sobre publicar meu livro com a Revolute.',
        `Nome: ${nome}`,
        `E-mail: ${email}`,
        `Telefone: ${telefone}`,
      ].join('\n');

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: 'Novo contato — LP Editora Revolute',
          from_name: 'LP Editora Revolute',
          nome,
          email,
          telefone,
        }),
      }).catch(() => {
        // Envio por e-mail é best-effort; o WhatsApp continua sendo o canal principal.
      });

      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;
      window.open(whatsappUrl, '_blank', 'noopener');
      leadForm.reset();
      closeModal();
    });
  }
})();
