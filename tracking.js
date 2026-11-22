(() => {
  'use strict';

  /**
   * Guarda de onde o visitante veio (UTMs e ids de clique) e entrega, no envio do formulário, o contexto que o servidor
   * precisa para o Lead na Conversions API: _fbp, _fbc, UTMs do primeiro e do último toque e a URL da página.
   * O Pixel já grava o cookie _fbc quando a URL traz fbclid; se ele ainda não rodou, o _fbc é montado aqui.
   */
  const CHAVE = 'rev_atribuicao';
  const VALIDADE_MS = 90 * 24 * 60 * 60 * 1000;
  const PARAMETROS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];

  function ler() {
    try {
      const guardado = JSON.parse(window.localStorage.getItem(CHAVE) || 'null');
      if (guardado && typeof guardado === 'object' && Date.now() - Number(guardado.em || 0) < VALIDADE_MS) return guardado;
    } catch {
      // armazenamento bloqueado ou corrompido: segue sem histórico
    }
    return null;
  }

  function gravar(valor) {
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(valor));
    } catch {
      // modo privado: o último toque ainda vale nesta visita
    }
  }

  function dosParametrosDaUrl() {
    const consulta = new URLSearchParams(window.location.search);
    const achados = {};
    PARAMETROS.forEach((nome) => {
      const valor = (consulta.get(nome) || '').trim().slice(0, 200);
      if (valor) achados[nome] = valor;
    });
    return achados;
  }

  let atual = ler();
  const naUrl = dosParametrosDaUrl();
  if (Object.keys(naUrl).length) {
    const agora = Date.now();
    atual = { primeiro: atual?.primeiro || { ...naUrl, em: agora }, ultimo: { ...naUrl, em: agora }, em: agora };
    gravar(atual);
  }

  function cookie(nome) {
    const par = document.cookie.split('; ').find((item) => item.startsWith(`${nome}=`));
    return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
  }

  function semData(parametros) {
    if (!parametros) return {};
    const { em, ...resto } = parametros;
    return resto;
  }

  function contexto() {
    const ultimo = semData(atual?.ultimo);
    const fbc = cookie('_fbc') || (ultimo.fbclid ? `fb.1.${atual.ultimo.em}.${ultimo.fbclid}` : null);
    return {
      fbp: cookie('_fbp'),
      fbc,
      utm: ultimo,
      utmFirst: semData(atual?.primeiro),
      referrer: document.referrer ? document.referrer.slice(0, 300) : '',
      sourceUrl: `${window.location.origin}${window.location.pathname}`,
    };
  }

  /** Um id por envio de formulário: o mesmo vai ao Pixel e ao servidor, e é isso que evita contar o lead em dobro. */
  function novoEventId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  window.RevTrack = { contexto, novoEventId };
})();
