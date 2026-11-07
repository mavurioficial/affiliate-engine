# Mavuri Growth Engine V1 — aquisição orgânica com revisão editorial

**Estado:** proposta em branch / Pull Request. Nada é implantado na produção por este documento.

## Escopo

- Melhorar a landing page /entrar/ com WhatsApp como ação principal, sem remover Telegram.
- Registrar três eventos de funil: page_view, join_click e share_click.
- Atribuir origem/campanha/conteúdo por parâmetros de URL sem cookies ou fingerprinting.
- Criar rascunhos de posts e cards SVG a partir de ofertas já aprovadas e verificadas.
- Não enviar mensagens privadas, adicionar membros, postar em grupos ou publicar automaticamente em redes sociais.

## Funil e links rastreáveis

URL base: https://mavurioficial.github.io/affiliate-engine/entrar/

Exemplos (não pressupõem campanhas ativas):

- Instagram: ?origem=instagram&campanha=ofertas_curadas&conteudo=produto_123
- Facebook: ?origem=facebook&campanha=ofertas_curadas&conteudo=produto_123
- Parceria consentida: ?origem=parceiro&campanha=parceria_loja_a&conteudo=post_01
- Compartilhamento pelo botão da landing: ?origem=compartilhamento&campanha=convite_membro

Os parâmetros são normalizados para minúsculas, a-z/0-9/_/- e limitados a 48 caracteres (origem: lista fechada). Não aceitar nome, telefone, e-mail, CPF ou qualquer identificador pessoal como parâmetro de campanha.

A origem do formulário de pedido de ofertas mantém sua lógica anterior para não alterar o contrato do backend existente. A origem do funil de crescimento é independente.

## Eventos

| Evento | Quando | channel | Interpretação |
|---|---|---|---|
| page_view | Landing carregada | site | Carregamentos, não visitantes únicos |
| join_click | Clique no convite oficial | whatsapp / telegram | Intenção de entrar, não confirmação de adesão |
| share_click | Clique no botão Compartilhar | site | Intenção de compartilhar, não compartilhamento confirmado |

Nenhum evento contém IP, user agent, cookie, telefone, e-mail, URL completa ou identificador de sessão. O banco guarda somente event_type, source, campaign, content, channel, page e created_at.

A Edge Function pública valida origem do navegador, tipos, valores e tamanho do corpo. **Origin não é autenticação**: robôs podem falsificá-lo e inflar contagens. Não use estes eventos para faturamento, auditoria de membros ou atribuição exata de conversão. Adicione rate limiting no gateway antes de ampliar o volume. Faça retenção operacional limitada (sugestão: 90 dias).

Falhas de telemetria nunca impedem a abertura dos convites. Antes da implantação do backend, o JavaScript enviará eventos a um endpoint ainda não disponível; isso não altera a experiência do visitante, mas **não gera dados persistidos**.

## Arquivos

- entrar/index.html: copy e compartilhamento sem herdar a origem de campanhas anteriores.
- entrar/growth.js: instrumentação leve de eventos, com sendBeacon e fallback fetch.
- supabase/functions/mavuri-growth-event/index.ts: endpoint público de escrita com validação.
- supabase/migrations/20261104090000_mavuri_growth_events_v1.sql: tabela com RLS, sem SELECT/INSERT públicos.
- supabase/config.toml: verify_jwt=false somente para a nova função.
- growth/content.mjs: normalização, validação e geração de rascunhos de redes sociais.
- scripts/growth-generate.mjs: CLI local de geração de drafts.json e cards SVG.
- scripts/test-growth.mjs: testes de elegibilidade, deduplicação, URLs e escaping.
- .github/workflows/growth-engine-check.yml: validação do pacote em PR.

## Gerador de conteúdo (sem custo de API de IA)

O gerador recebe um **array JSON** de ofertas já curadas pelo motor Mavuri. Não faz scraping, não consulta credenciais, não publica e não cria descontos fictícios.

Campos por oferta:

| Campo | Tipo | Regra |
|---|---|---|
| id | string | ID estável, sem dados pessoais |
| title | string | Título real do produto |
| marketplace | string | mercadolivre, shopee, amazon ou magalu |
| price | number | Preço real positivo em BRL |
| affiliate_url | string | Link HTTPS já aprovado; não é incluído na legenda |
| verified_at | string ISO 8601 | Consulta de preço feita nas últimas 24h |
| approved | boolean | Precisa ser true após curadoria |

Ofertas não aprovadas, vencidas, duplicadas, sem preço, sem link HTTPS ou com marketplace desconhecido são ignoradas. Os rascunhos sempre têm status needs_review. **O preço deve ser revalidado antes da publicação**, mesmo se o rascunho foi gerado há poucos minutos.

Comandos:

    npm run check
    npm run growth:test
    npm run build
    npm run growth:generate -- ./caminho/ofertas-reais-aprovadas.json ./growth/output

Saída: growth/output/drafts.json com legendas para Instagram/Facebook e URLs de campanha, além de cards SVG 1080x1350. Nenhum arquivo de saída é publicado automaticamente.

Para Instagram, configure previamente o link da bio/perfil apontando para a URL rastreada. Links em legendas de posts comuns não são clicáveis. Para Facebook, revise a política da página/grupo e publique somente em espaços próprios ou com permissão. O conteúdo deve informar que preços podem mudar e que há links de afiliados.

## Sequência de ativação após aprovação

**Não executar estes passos enquanto o PR estiver em revisão.**

1. Revisar o diff, os testes de CI e o texto da landing em desktop e mobile.
2. Confirmar o projeto Supabase correto e criar/aplicar a migration de tabela usando o fluxo de migrations do projeto. Verificar RLS, GRANTs e índices.
3. Implantar a função mavuri-growth-event com verify_jwt=false, conforme supabase/config.toml. Garantir que a chave secreta permaneça apenas no backend.
4. Testar um POST real para a função com Origin: https://mavurioficial.github.io, Content-Type: text/plain e JSON de exemplo abaixo. Esperado: HTTP 204. Testar payload inválido (HTTP 400) e origem externa (HTTP 403).
5. Só depois publicar a landing atualizada. Verificar cliques WhatsApp, Telegram, botão Compartilhar e formulário de pedidos.
6. Consultar o banco via SQL Editor com privilégios administrativos para conferir os eventos, sem expor tabela à API pública.

Exemplo de payload de teste:

    {"event":"page_view","source":"direto","campaign":"","content":"","channel":"site","page":"entrar"}

Consulta agregada sugerida (SQL Editor, não disponibilizar ao público):

    SELECT date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo') AS dia,
           source, campaign, event_type, channel, count(*) AS eventos
    FROM public.mavuri_growth_events
    WHERE created_at >= now() - interval '30 days'
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1 DESC, 2, 3, 4, 5;

Para retenção, definir um job administrativo que exclua eventos com mais de 90 dias, caso este prazo seja aprovado pela política de dados do projeto. O V1 não agenda a limpeza automaticamente.

## Checklist de aceite

- [ ] Landing preserva links oficiais existentes e formulário de pedidos.
- [ ] Compartilhar cria URL com origem=compartilhamento, sem copiar parâmetros recebidos.
- [ ] Testes Node e build passam no PR.
- [ ] Endpoint retorna 204/400/403 nos cenários documentados.
- [ ] RLS ativo; anon/authenticated não conseguem ler nem inserir diretamente.
- [ ] Eventos aparecem apenas depois do deploy do backend.
- [ ] Aumento real de membros é aferido separadamente pelo administrador do WhatsApp.
- [ ] Postagens exigem revisão e autorização das contas; nenhuma automação de spam.

## Próximas fases, fora do V1

Integração autorizada com Metricool/Meta para agendamento, dashboard de métricas agregadas com autenticação, ingestão de ofertas aprovadas diretamente do Flow, testes A/B e atribuição de vendas com limitações explícitas. Não prometer entradas ou comissões com base em cliques.
