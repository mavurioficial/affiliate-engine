# Mavuri — coleta e publicação Amazon no Telegram, ciclo automático

Configurado em 04/11/2026.

## O que está agendado
- GitHub Actions: [Mavuri — Uma oferta Amazon do Telegram](../.github/workflows/mavuri-telegram-amazon-onepost.yml)
- `on.schedule`: dois crons em UTC (`17,47 11-23 * * *` e `17,47 0 * * *`), equivalentes a 08h17–21h47 em Brasília (UTC-3). A mudança remove o campo `timezone` como variável de diagnóstico.
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
- **Nova agenda:** workflow e Edge atualizados e código de testes aprovou `Mavuri Check` no GitHub run 41833593392 (04/11/2026). Essa aprovação confirma sintaxe/testes do código e implantação, **não** uma execução agendada em produção. Até a investigação da manhã de 04/11, não havia nenhuma execução `event=schedule` do workflow; somente o teste manual anterior, que enviou a mensagem 3441. É necessário confirmar o primeiro ciclo `event=schedule`.
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

## Investigação de ausência de envio — 04/11/2026, 09h51 BRT

- Usuário relatou que a última execução não gerou mensagem Amazon no Telegram.
- GitHub: 0 execuções `event=schedule` do fluxo `mavuri-telegram-amazon-onepost.yml` até o momento da verificação. A única execução `workflow_dispatch` do fluxo é o teste manual `41823873443`, conclusão `success`, publicação 3441.
- Supabase: `public.mavuri_telegram_onepost_audit` não registrou novo envio além da msg 3441. A tabela ML de candidatos continua vazia (nenhuma nova captura por ciclo agendado).
- API GitHub autenticada: workflow existe e está `state=active`. O problema observado é de disparo do GitHub, **não um erro demonstrado de envio do bot**.
- Foi feita uma alteração diagnóstica de cron para horários UTC explícitos, com a mesma janela de Brasília, para reduzir variáveis. O GitHub suporta `timezone` oficialmente; sua presença não foi comprovada como causa. `Mavuri Check` continuou verde (run `41833593392`). Ainda não há comprovação de disparo automático após a mudança.
- Tentei testar um acionador alternativo usando agendador Supabase e credencial GitHub já existente, mas a operação de disparo foi bloqueada pelas configurações de segurança. **Nenhum disparador alternativo foi ativado**.
- Se ocorrer uma execução `schedule` sem publicação, conferir os logs: pode não existir ASIN novo elegível (mensagens dentro de 75 minutos e até 100 mensagens), ou todos os ASINs podem ter sido publicados anteriormente.
