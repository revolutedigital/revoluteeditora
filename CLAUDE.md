# Editora Revolute — LP "Sua história vira livro"

Site da Editora Revolute em produção em **https://editorarevolute.com.br** (versão oficial sem `www`; `www` redireciona 301). Repo: `revolutedigital/revoluteeditora`.

## Produto e público
- **Oferta:** quem tem uma história mas não tem manuscrito nem tempo pra escrever. A Editora faz entrevista guiada → redação completa → leitura crítica → design de capa → registro da obra → impressão → lançamento → marketing pós-lançamento. Prazo comunicado: ~4 meses.
- **Público:** especialistas, profissionais liberais e empresários que querem o livro como ativo de autoridade (o CTA final trata o livro como "ativo começando a trabalhar").
- **Preço:** não aparece na página. A seção `#investimento` vende "sob medida" e leva ao orçamento. Não inventar valor.
- **Prova real usada na LP:** a coleção Coragi (14 volumes didáticos, do zero ao impresso), com capas em `Assets/Capas - Coragi/`, e a seção `#marcas` com nomes reais de clientes. Essa é a vitrine da própria Editora, então nomes autorizados podem aparecer. Não acrescentar nome, número ou depoimento sem confirmação do Igor.
- **Tom:** informal e próximo, sempre na 2ª pessoa ("Você tem a história. A gente escreve o livro.").

## Conversão
CTA único: **"Quero contar minha história"** (e variações) abre um modal com nome, e-mail e telefone (`[data-open-modal]`). No submit, [script.js](script.js):
1. dispara `POST /api/contato` sem esperar resposta (`keepalive`), que manda e-mail via SMTP;
2. abre o WhatsApp `5515981828332` com os dados preenchidos. **O WhatsApp é o canal principal**; o e-mail é só cópia.

`/bio` ([bio.html](bio.html)) é o cartão de visita digital (link do Instagram `@revolute_editora`), com WhatsApp, telefone, site, e-mail e Instagram. Fica fora do sitemap de propósito.

## Stack
- Node ≥18 + Express 4 ([server.js](server.js)) e Nodemailer. Sem banco, sem build, sem framework front: HTML, CSS e JS puros.
- `index.html` e `bio.html` são **templates** lidos na subida do servidor. Placeholders: `{{SITE_URL}}`, `{{ROBOTS_CONTENT}}`, `{{ASSET_VERSION}}`. Abrir o HTML direto no navegador quebra canonical/OG/cache-busting, então sempre rode pelo servidor.
- CSS e JS vão com `?v={{ASSET_VERSION}}` (timestamp do boot), o que invalida o cache da Cloudflare e do navegador a cada deploy. Arquivo novo de CSS/JS precisa do mesmo sufixo.
- Cache: `/Assets` com 7 dias + `immutable` (arquivo trocado precisa de **nome novo**); o restante com 1h.
- Fonte Hellix self-hosted (`Assets/Fonts`). Paleta em tokens no `:root` de [styles.css](styles.css) (âmbar `#FFC72C`, laranja `#C45500`, fundo creme `#FFFCF6`). Um CSS só, compartilhado entre `/` e `/bio`. Cuidado com seletor global (`nav` já causou colisão na /bio, ver `fca40b2`).
- SEO: `robots.txt` e `sitemap.xml` são gerados no server. Host `*.railway.app` recebe `noindex` automaticamente. JSON-LD `Organization` + `Service` no `<head>` da home.

## Rastreio (Meta)
- **Pixel** no `<head>` de `/` e `/bio` (placeholder `{{META_PIXEL}}`, preenchido pelo server): `PageView`. **Lead** dispara em [script.js](script.js) no submit do modal, depois da validação (nunca no clique que abre o modal), com `eventID`.
- **Conversions API**: o mesmo `eventId` vai no `POST /api/contato`; [meta.js](meta.js) monta o `Lead` com e-mail, telefone (DDI 55), nome em SHA-256, `fbp`, `fbc`, IP (`cf-connecting-ip`) e user agent, e envia ao Graph. A Meta junta Pixel e API pelo `event_id` e conta um lead só. E-mail e Meta são independentes: um fora do ar não derruba o outro.
- [tracking.js](tracking.js) guarda UTMs e ids de clique (primeiro e último toque, 90 dias, `localStorage`) e monta o `fbc` quando o Pixel ainda não gravou o cookie. As UTMs seguem no e-mail do lead ("Origem do clique"); o texto do WhatsApp não leva UTM.
- Teste: `npm test` (lógica da Meta). Validar de verdade: `META_TEST_EVENT_CODE` + aba "Eventos de teste" do dataset, conferindo que Pixel e servidor aparecem com o mesmo event_id e "Desduplicado".
- UTM dos anúncios: `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` (minúsculas, sem espaço nem acento).

- **Privacidade:** `/privacidade` ([privacidade.html](privacidade.html), template como a home) é a política que o modal, o rodapé e o formulário de anúncios da Meta apontam. O modal tem uma linha de ciência acima do botão; não é caixa de marcar de propósito (atrito no mobile).

## Rodar local
```bash
npm install
npm start        # http://localhost:3000
```
Sem as variáveis SMTP, `/api/contato` responde 503 e o resto funciona normalmente.

## Deploy e variáveis
Railway, com deploy pelo push no GitHub (`npm start`). Variáveis: `SMTP_USER`, `SMTP_PASS`, `MAIL_TO` (obrigatórias pro e-mail), `MAIL_CC` (lista separada por vírgula), `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` (padrão Gmail 465). Rastreio da Meta: `META_PIXEL_ID` (id do dataset/pixel "Revolute Editora", público) e `META_CAPI_TOKEN` (token do dataset gerado no Gerenciador de Eventos; segredo, só no Railway), opcional `META_TEST_EVENT_CODE` (aba "Eventos de teste": manda o Lead como teste). Sem `META_PIXEL_ID` a página sai sem pixel; sem `META_CAPI_TOKEN` o Lead vai só pelo Pixel. `trust proxy` está ligado porque o Railway termina o SSL na borda. Não remover.

## Regras do projeto
- Mobile-first (390px). A maior parte do tráfego vem de Instagram e WhatsApp.
- Não trocar logo nem identidade visual (`Assets/Marca`). Mexer só em layout, CSS e UX.
- Toda mudança visual ou de fluxo é validada **em produção** com Playwright (home + modal + /bio, mobile e desktop) antes de dizer "pronto".
- Antes de editar, rode `git fetch && git status`. O repo é pequeno, mas pode ter push de outra máquina.
- Commits em português, no imperativo, descrevendo o efeito ("Reduz distância do topo na /bio…").
