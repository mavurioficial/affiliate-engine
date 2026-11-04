# Mavuri — coleta e publicação Amazon no Telegram, ciclo automático

Configurado em 04/11/2026.

## O que está agendado
- GitHub Actions: [Mavuri — Uma oferta Amazon do Telegram](../.github/workflows/mavuri-telegram-amazon-onepost.yml)
- `on.schedule`: cron `17,47 8-21 * * *` e `timezone: America/Sao_Paulo`.
- Horários nominais: 08h17, 08h47, ..., 21h17 e 21h47, diariamente. GitHub pode atrasar ou excepcionalmente perder execuções sob alta carga.
- Ambiente: GitHub-hosted runner, Node.js 22, cliente MTProto Teleproto 1.232.1 e segredos do próprio GitHub Actions. O computador local não participa.
- Fonte: @GRUPOTABUGADO, usando a sessão Telegram pessoal existente; **não** adiciona bot à origem.
- Seleção atual: até 100 mensagens recentes de 75 minutos, até 8 ASINs candidatos Amazon, publica no máximo **1 produto novo por execução** no canal `Mavuri Ofertas`, desde que consiga identificar seu ASIN.
- Link: `https://www.amazon.com.br/dp/{ASIN}/ref=nosim?tag=mavuri0a-20`; o título é usado quando o extrator encontra um texto conciso (caso contrário `Produto Amazon`).
- Publicação via bot existente no Supabase Edge `mavuri-telegram-amazon-cloud-onepost` (versão 4). Não divulga preço nem desconto não verificados.
- Supabase audita cada execução que tenta enviar em `public.mavuri_telegram_onepost_audit`. Evita republicar produtos com ASIN já enviado ou reclamado.
- Credenciais Telegram apenas em GitHub Actions secrets; GitHub autentica-se perante Supabase com JWT de curta duração (OIDC). O Supabase verifica assinatura, audiência, branch, workflow, identidade imutável do repositório e tipo de evento (`schedule`/`workflow_dispatch`).
- `workflow_dispatch` manual continua disponível: `preview` (não envia) ou `send` (até uma oferta). A execução programada usa `send`.
- Concurrency serializa os ciclos deste workflow, sem cron, segredos ou alterações nos processos Shopee e Magalu.

## Validação e limites
- **Teste completo anterior:** 04/11/2026 08h48 BRT, GitHub run 41823873443; uma oferta Amazon originada da mensagem 541131, ASIN B0DCKBMVH9, publicada no Mavuri Ofertas sob Telegram message ID 3441. Atribuição de comissão ainda não demonstrada.
- **Nova agenda:** workflow e Edge atualizados e código de testes aprovou `Mavuri Check` no GitHub run 41827056419 (04/11/2026). Essa aprovação confirma sintaxe/testes do código e implantação, **não** uma execução agendada em produção. Ainda é necessário conferir o primeiro ciclo `event=schedule`.
- Capacidade deliberadamente modesta: 1 publicação por ciclo; os demais itens descobertos não são guardados em uma fila permanente, podendo ser perdidos se saírem da janela de 75 minutos ou do limite de 100 mensagens.
- Nome extraído de postagem não é garantia de correspondência com o ASIN; o fallback genérico impede alegação de nome em casos incertos. A revisão de título, preço, estoque, comissão, categorias e níveis de filtragem será uma etapa posterior.
- Esta automação depende da disponibilidade do GitHub Actions, da sessão Telegram e da permissão de acesso/reutilização da fonte; revise as regras do grupo e do programa Amazon.
- Se o login/conta de Associados Amazon mudar, preservar a tag `mavuri0a-20` até confirmar nova tag e compatibilidade; não fazer alterações de contas sem revisão da integração.

## Como pausar
GitHub → Actions → **Mavuri - Uma oferta Amazon do Telegram** → menu `...` → **Disable workflow**. Para retornar, **Enable workflow**. Isso não desativa os demais ciclos de Shopee/Magalu.

## Evidências
- GitHub: https://github.com/mavurioficial/affiliate-engine/actions/workflows/mavuri-telegram-amazon-onepost.yml
- Edge: `mavuri-telegram-amazon-cloud-onepost` v4, `ACTIVE` (mas aguardando primeiro evento cron).
- GitHub CI: https://github.com/mavurioficial/affiliate-engine/actions/runs/41827056419
