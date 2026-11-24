(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5515981828332';
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

  const el = {
    grade: $('[data-grade]'), chips: $('[data-chips]'), busca: $('[data-busca]'), contagem: $('[data-contagem]'), vazio: $('[data-vazio]'),
    barraTotal: $('[data-barra-total]'), barraItens: $('[data-barra-itens]'), progresso: $('[data-progresso]'), progressoBarra: $('[data-progresso-barra]'),
    pedido: $('[data-pedido]'), lista: $('[data-pedido-lista]'), pedidoVazio: $('[data-pedido-vazio]'), totais: $('[data-totais]'), nota: $('[data-pedido-nota]'),
    contato: $('[data-contato]'), erro: $('[data-erro]'), cliente: $('[data-cliente]'), avisoMeta: $('[data-aviso-meta]'), qtdMinima: $('[data-qtd-minima]'),
    btnSugerido: $('[data-sugerido]'),
  };

  const semAcento = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- Código de barras EAN-13 (SVG) ---------- */
  const LADO_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const LADO_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const LADO_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function digitoVerificadorEan13(doze) {
    const soma = doze.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (soma % 10)) % 10;
  }

  /** SVG do EAN-13, ou null quando o código não é um EAN-13 válido (aí a tela mostra só os números). */
  function svgEan13(ean) {
    if (!/^\d{13}$/.test(ean) || digitoVerificadorEan13(ean.slice(0, 12)) !== Number(ean[12])) return null;
    const paridade = PARIDADE[Number(ean[0])];
    let bits = '101';
    for (let i = 0; i < 6; i += 1) bits += (paridade[i] === 'L' ? LADO_L : LADO_G)[Number(ean[i + 1])];
    bits += '01010';
    for (let i = 0; i < 6; i += 1) bits += LADO_R[Number(ean[i + 7])];
    bits += '101';

    const margem = 9;
    const guardas = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
    let barras = '';
    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i] !== '1') continue;
      let fim = i;
      while (bits[fim + 1] === '1') fim += 1;
      const guarda = guardas.has(i);
      barras += `<rect x="${margem + i}" y="0" width="${fim - i + 1}" height="${guarda ? 58 : 52}"/>`;
      i = fim;
    }
    const largura = 95 + margem * 2;
    const texto = (inicio, digitos) => `<text x="${inicio}" y="66" font-size="9" font-family="monospace" textLength="${digitos.length * 7}" lengthAdjust="spacingAndGlyphs">${digitos}</text>`;
    return `<svg viewBox="0 0 ${largura} 70" role="img" aria-label="Código de barras ${ean}" fill="#000">${barras}${texto(1, ean[0])}${texto(margem + 4, ean.slice(1, 7))}${texto(margem + 51, ean.slice(7))}</svg>`;
  }

  /* ---------- Estado ---------- */
  const caminho = window.location.pathname.replace(/\/+$/, '').split('/');
  const slugCliente = caminho[1] === 'catalogo' && caminho[2] ? caminho[2].toLowerCase() : new URLSearchParams(window.location.search).get('cliente');
  let dados = null;
  let cliente = null;
  const itensPorId = new Map();
  const pedido = new Map();
  let categoriaAtiva = 'todas';
  let textoBusca = '';
  let chaveArmazenamento = 'catalogo:geral';

  const salvar = () => {
    try { window.localStorage.setItem(chaveArmazenamento, JSON.stringify([...pedido])); } catch { /* navegação privada: o pedido só vale nesta aba */ }
  };
  const restaurar = () => {
    try {
      const salvo = JSON.parse(window.localStorage.getItem(chaveArmazenamento) || '[]');
      salvo.forEach(([id, qtd]) => { if (itensPorId.has(id) && Number.isInteger(qtd) && qtd >= dados.regras.qtdMinima) pedido.set(id, qtd); });
    } catch { /* sem pedido anterior */ }
  };

  const qtdMinima = () => dados.regras.qtdMinima;
  const qtdMaxima = () => dados.regras.qtdMaxima;
  const margemDaLoja = (item) => 1 - item.repasse / item.venda;

  /* ---------- Quantidades ---------- */
  function definirQuantidade(id, valor) {
    let qtd = Math.floor(Number(valor));
    if (!Number.isFinite(qtd) || qtd <= 0) qtd = 0;
    else if (qtd < qtdMinima()) qtd = qtdMinima();
    else if (qtd > qtdMaxima()) qtd = qtdMaxima();
    if (qtd === 0) pedido.delete(id); else pedido.set(id, qtd);
    salvar();
    atualizarItem(id);
    atualizarResumo();
  }

  function passo(id, sentido) {
    const atual = pedido.get(id) || 0;
    const passoQtd = qtdMinima();
    if (sentido > 0) definirQuantidade(id, atual === 0 ? qtdMinima() : atual + passoQtd);
    else definirQuantidade(id, atual - passoQtd < qtdMinima() ? 0 : atual - passoQtd);
  }

  /* ---------- Grade ---------- */
  function htmlDoCard(item) {
    const barras = svgEan13(item.ean);
    const cfop = item.cfop || dados.regras.cfop;
    const selo = item.tipo === 'brinquedo' ? 'Brinquedo · Inmetro' : 'Livro';
    return `
      <li class="cat-card" data-id="${escapar(item.id)}">
        <div class="cat-foto">
          <span class="cat-selo">${selo}</span>
          <img src="${escapar(item.imagem)}" alt="${escapar(item.nome)}" loading="lazy" width="240" height="240">
        </div>
        <div class="cat-corpo">
          <h3 class="cat-nome">${escapar(item.nome)}</h3>
          <div class="cat-preco">${brl.format(item.repasse)}<small>repasse por unidade</small></div>
          <div class="cat-venda">Venda sugerida ${brl.format(item.venda)} · margem <b>${pct.format(margemDaLoja(item))}</b></div>
          <div class="cat-qtd" role="group" aria-label="Quantidade de ${escapar(item.nome)}">
            <button type="button" data-menos aria-label="Diminuir ${qtdMinima()} unidades">−</button>
            <input type="number" inputmode="numeric" min="0" max="${qtdMaxima()}" step="1" value="0" data-qtd aria-label="Unidades">
            <button type="button" data-mais aria-label="Aumentar ${qtdMinima()} unidades">+</button>
          </div>
          <button type="button" class="cat-mais" data-detalhes aria-expanded="false">Código de barras e dados fiscais</button>
          <div class="cat-fiscal" data-fiscal hidden>
            ${barras ? `<div class="cat-barras">${barras}</div>` : `<p>EAN ${escapar(item.ean)}</p>`}
            <dl>
              <dt>EAN</dt><dd>${escapar(item.ean)}</dd>
              <dt>NCM</dt><dd>${escapar(formatarNcm(item.ncm))}</dd>
              <dt>CFOP</dt><dd>${escapar(cfop)}</dd>
            </dl>
          </div>
        </div>
      </li>`;
  }

  const formatarNcm = (ncm) => (/^\d{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm || 'a confirmar');

  function itensFiltrados() {
    const termo = semAcento(textoBusca).trim();
    return dados.itens.filter((item) => {
      if (categoriaAtiva !== 'todas' && item.cat !== categoriaAtiva) return false;
      if (!termo) return true;
      return semAcento(`${item.nome} ${item.ean}`).includes(termo);
    });
  }

  function desenharGrade() {
    const itens = itensFiltrados();
    el.grade.innerHTML = itens.map(htmlDoCard).join('');
    el.vazio.hidden = itens.length > 0;
    el.contagem.textContent = `${itens.length} ${itens.length === 1 ? 'título' : 'títulos'}`;
    itens.forEach((item) => atualizarItem(item.id));
  }

  function atualizarItem(id) {
    const card = el.grade.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const qtd = pedido.get(id) || 0;
    card.classList.toggle('no-pedido', qtd > 0);
    const campo = $('[data-qtd]', card);
    if (document.activeElement !== campo) campo.value = qtd;
    $('[data-menos]', card).disabled = qtd === 0;
  }

  function desenharChips() {
    const contagem = new Map();
    dados.itens.forEach((item) => contagem.set(item.cat, (contagem.get(item.cat) || 0) + 1));
    const abas = [{ id: 'todas', nome: 'Todas', total: dados.itens.length }, ...dados.categorias.filter((c) => contagem.has(c.id)).map((c) => ({ ...c, total: contagem.get(c.id) }))];
    el.chips.innerHTML = abas.map((aba) => `<button type="button" role="tab" class="cat-chip" data-cat="${escapar(aba.id)}" aria-selected="${aba.id === categoriaAtiva}">${escapar(aba.nome)}<small>${aba.total}</small></button>`).join('');
  }

  /* ---------- Resumo e pedido ---------- */
  function totais() {
    let unidades = 0; let repasse = 0; let venda = 0;
    pedido.forEach((qtd, id) => {
      const item = itensPorId.get(id);
      unidades += qtd; repasse += qtd * item.repasse; venda += qtd * item.venda;
    });
    return { unidades, repasse: Math.round(repasse * 100) / 100, venda: Math.round(venda * 100) / 100, titulos: pedido.size };
  }

  function atualizarResumo() {
    const t = totais();
    el.barraTotal.textContent = brl.format(t.repasse);
    el.barraItens.textContent = t.titulos ? `${t.titulos} ${t.titulos === 1 ? 'título' : 'títulos'} · ${t.unidades} un.` : 'Nenhum item';
    if (cliente && cliente.metaSugerida) {
      el.progresso.hidden = false;
      el.progressoBarra.style.width = `${Math.min(100, (t.repasse / cliente.metaSugerida) * 100)}%`;
      el.barraItens.textContent += ` · ${Math.round((t.repasse / cliente.metaSugerida) * 100)}% do sugerido`;
    }
    if (el.pedido.open) desenharPedido();
  }

  function desenharPedido() {
    const t = totais();
    el.pedidoVazio.hidden = t.titulos > 0;
    el.totais.hidden = el.nota.hidden = t.titulos === 0;
    el.lista.innerHTML = [...pedido].map(([id, qtd]) => {
      const item = itensPorId.get(id);
      return `
        <li class="cat-linha" data-linha="${escapar(id)}">
          <img src="${escapar(item.imagem)}" alt="" width="56" height="56">
          <div>
            <p class="cat-linha-nome">${escapar(item.nome)}</p>
            <div class="cat-linha-info">
              <span><b>${qtd}</b> × ${brl.format(item.repasse)} = <b>${brl.format(qtd * item.repasse)}</b></span>
              <div class="cat-qtd" role="group" aria-label="Quantidade">
                <button type="button" data-menos aria-label="Diminuir">−</button>
                <input type="number" inputmode="numeric" min="0" step="1" value="${qtd}" data-qtd aria-label="Unidades">
                <button type="button" data-mais aria-label="Aumentar">+</button>
              </div>
            </div>
          </div>
        </li>`;
    }).join('');
    $('[data-total-unidades]').textContent = t.unidades.toLocaleString('pt-BR');
    $('[data-total-repasse]').textContent = brl.format(t.repasse);
    $('[data-total-venda]').textContent = brl.format(t.venda);
    $('[data-total-margem]').textContent = t.venda ? pct.format(1 - t.repasse / t.venda) : '—';
  }

  /** Pedido sugerido: reparte a meta do cliente entre as categorias (mix da proposta) usando os títulos em destaque. */
  function montarPedidoSugerido() {
    const meta = cliente?.metaSugerida;
    if (!meta) return;
    pedido.clear();
    const mix = dados.mixSugerido;
    Object.entries(mix).forEach(([cat, parte]) => {
      const destaques = dados.itens.filter((item) => item.cat === cat && item.destaque);
      if (!destaques.length) return;
      const verbaPorItem = (meta * parte) / destaques.length;
      destaques.forEach((item) => {
        const qtd = Math.max(qtdMinima(), Math.round(verbaPorItem / item.repasse / qtdMinima()) * qtdMinima());
        pedido.set(item.id, Math.min(qtd, qtdMaxima()));
      });
    });
    salvar();
    desenharGrade();
    atualizarResumo();
  }

  /* ---------- Envio ---------- */
  function textoDoPedido(contato) {
    const t = totais();
    return [
      `Olá! Quero fazer este pedido do catálogo de torres de livros${cliente ? ` (${cliente.nome})` : ''}.`,
      '',
      ...[...pedido].map(([id, qtd]) => {
        const item = itensPorId.get(id);
        return `• ${qtd} × ${item.nome} (EAN ${item.ean}) — ${brl.format(item.repasse)} = ${brl.format(qtd * item.repasse)}`;
      }),
      '',
      `${t.unidades} unidades · Total ${brl.format(t.repasse)}`,
      '',
      `Nome: ${contato.nome}`,
      ...(contato.loja ? [`Loja: ${contato.loja}`] : []),
      `Telefone: ${contato.telefone}`,
      ...(contato.email ? [`E-mail: ${contato.email}`] : []),
    ].join('\n');
  }

  function mostrarErro(mensagem) {
    el.erro.textContent = mensagem;
    el.erro.hidden = !mensagem;
  }

  el.contato.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const form = new FormData(el.contato);
    const contato = Object.fromEntries(['nome', 'loja', 'telefone', 'email'].map((campo) => [campo, String(form.get(campo) || '').trim()]));
    if (pedido.size === 0) { mostrarErro('Escolha pelo menos um título.'); return; }
    if (!contato.nome || !contato.telefone) { mostrarErro('Informe seu nome e telefone.'); return; }
    mostrarErro('');

    // Cópia por e-mail e conferência de valores no servidor; o WhatsApp é o canal principal e não espera a resposta.
    fetch('/api/pedido-catalogo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ...contato, cliente: slugCliente || null, itens: [...pedido].map(([id, qtd]) => ({ id, qtd })) }),
    }).catch(() => { /* e-mail é best-effort */ });

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(textoDoPedido(contato))}`, '_blank', 'noopener');
  });

  /* ---------- Eventos ---------- */
  el.chips.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-cat]');
    if (!botao) return;
    categoriaAtiva = botao.dataset.cat;
    desenharChips();
    desenharGrade();
  });

  let esperaBusca = 0;
  el.busca.addEventListener('input', () => {
    window.clearTimeout(esperaBusca);
    esperaBusca = window.setTimeout(() => { textoBusca = el.busca.value; desenharGrade(); }, 120);
  });

  function tratarControleDeQuantidade(evento, raiz, idDe) {
    const botao = evento.target.closest('[data-mais], [data-menos]');
    if (botao) passo(idDe(botao), botao.hasAttribute('data-mais') ? 1 : -1);
  }
  el.grade.addEventListener('click', (evento) => {
    tratarControleDeQuantidade(evento, el.grade, (botao) => botao.closest('[data-id]').dataset.id);
    const detalhes = evento.target.closest('[data-detalhes]');
    if (detalhes) {
      const fiscal = $('[data-fiscal]', detalhes.closest('.cat-card'));
      fiscal.hidden = !fiscal.hidden;
      detalhes.setAttribute('aria-expanded', String(!fiscal.hidden));
    }
  });
  el.grade.addEventListener('change', (evento) => {
    const campo = evento.target.closest('[data-qtd]');
    if (campo) { definirQuantidade(campo.closest('[data-id]').dataset.id, campo.value); campo.value = pedido.get(campo.closest('[data-id]').dataset.id) || 0; }
  });
  el.lista.addEventListener('click', (evento) => tratarControleDeQuantidade(evento, el.lista, (botao) => botao.closest('[data-linha]').dataset.linha));
  el.lista.addEventListener('change', (evento) => {
    const campo = evento.target.closest('[data-qtd]');
    if (campo) definirQuantidade(campo.closest('[data-linha]').dataset.linha, campo.value);
  });

  $('[data-abrir-pedido]').addEventListener('click', () => { desenharPedido(); el.pedido.showModal(); });
  $('[data-imprimir]').addEventListener('click', () => { desenharPedido(); window.print(); });
  $('[data-limpar]').addEventListener('click', () => { pedido.clear(); salvar(); desenharGrade(); atualizarResumo(); desenharPedido(); });
  el.btnSugerido.addEventListener('click', () => { montarPedidoSugerido(); desenharPedido(); });
  el.pedido.addEventListener('click', (evento) => { if (evento.target === el.pedido) el.pedido.close(); });

  /* ---------- Início ---------- */
  async function iniciar() {
    const versao = new URL(document.currentScript?.src || window.location.href, window.location.href).searchParams.get('v') || '';
    const [respDados, respClientes] = await Promise.all([fetch(`/catalogo-dados.json?v=${versao}`), fetch(`/catalogo-clientes.json?v=${versao}`)]);
    if (!respDados.ok) throw new Error('catálogo indisponível');
    dados = await respDados.json();
    const clientes = respClientes.ok ? await respClientes.json() : {};
    dados.itens.forEach((item) => itensPorId.set(item.id, item));
    cliente = slugCliente && clientes[slugCliente] ? clientes[slugCliente] : null;
    chaveArmazenamento = `catalogo:${cliente ? slugCliente : 'geral'}`;

    el.qtdMinima.textContent = qtdMinima();
    if (cliente) {
      el.cliente.textContent = cliente.nome;
      el.cliente.hidden = false;
      if (cliente.metaSugerida) {
        el.avisoMeta.textContent = `Pedido sugerido: ${brl.format(cliente.metaSugerida)}. Em "Ver pedido" há um mix pronto para começar.`;
        el.avisoMeta.hidden = false;
        el.btnSugerido.hidden = false;
      }
    }
    restaurar();
    desenharChips();
    desenharGrade();
    atualizarResumo();
  }

  iniciar().catch(() => {
    el.contagem.textContent = 'Não foi possível carregar o catálogo. Atualize a página.';
  });
})();
