# Mavuri V85 — opção gratuita GitHub Actions (prova de capacidade real)

Data da auditoria: 22/10/2026 (horário de Brasília). **NÃO ESTÁ EM PRODUÇÃO.**
Repo: `mavurioficial/affiliate-engine`, público; PR em rascunho #19.

## Por que não usar a VM Oracle básica existente

A Oracle Always Free `VM.Standard.E2.1.Micro` tem apenas **1 GB RAM e 1/8 OCPU**. A VM existente `mavuri-waha-amd` já apresentou instabilidade durante os testes WAHA. O V85 usa um Chrome completo, Node 24, CDP, sessões ML e Telegram MTProto; NÃO colocar esse conjunto na VM de 1 GB.

A instância Oracle Ampere A1 com mais RAM continuou sem capacidade disponível na região do usuário na tentativa anterior. Não depender da liberação Oracle para lançar o Mavuri. Manter a VM atual somente em tarefas leves/independentes quando necessário.

## Alternativa: execuções GitHub Actions a cada 30 minutos

GitHub confirmou que o repo é **público** (`private=false`), e o GitHub oferece execução padrão `ubuntu-24.04` **sem custo de minutos para repositórios públicos**. O GitHub documenta 4 vCPU e 16 GB RAM para runner público Linux. Cada execução ocorre numa VM EFÊMERA diferente; não é um servidor persistente.

**Teste executado DE VERDADE no Actions do usuário, sem credenciais, sem API externa, sem publicação:**

- Workflow: `.github/workflows/mavuri-free-host-probe.yml`, somente evento `pull_request` nas alterações do probe (NÃO possui `schedule` nem secrets).
- Script: `scripts/cloud-runner/probe-github-actions.mjs`. Usa Chrome instalado pelo GitHub, headless, endpoint CDP somente localhost, navega apenas a `about:blank`, mede memória do Chrome e encerra o processo.
- Primeira prova, run [39881078162](https://github.com/mavurioficial/affiliate-engine/actions/runs/39881078162): **SUCCESS**, 4 CPUs, 15.990 MiB RAM, Chrome/CDP pronto em 8,4 s, 13 processos Chrome com ~1.148 MiB de RSS somados. Esses números são do navegador em página vazia, NÃO de um ciclo completo V85.
- Segunda prova, run [39881351691](https://github.com/mavurioficial/affiliate-engine/actions/runs/39881351691): **SUCCESS**, Node 24, Chrome 6,0 s, 13 processos ~1.195 MiB RSS, **Playwright-core 1.55.0 conectou por `chromium.connectOverCDP`**, contexto sem cookies nem autenticação, abertura de `about:blank` comprovada.
- Não há prova de sessão ML, API Shopee autenticada, sessão Telegram, envio, duração de ciclo V85, estabilidade/custos totais. Não chamar de Mavuri 24h pronto.

**Regra de fonte oficial:** GitHub Actions para repositório público: [hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) e [cobrança](https://docs.github.com/en/actions/concepts/billing-and-usage); cron [eventos agendados](https://docs.github.com/en/actions/reference/events-that-trigger-workflows). Cron só executa na **branch padrão**, e pode atrasar ou ser descartado em alta carga; não garante início exato às :00/:30. Em repositório público, workflows agendados são desativados após 60 dias sem atividade.

## Bloqueador restante: identidade e estado entre execuções

Não usar diretamente o `V85` original em GitHub Actions: o código original tem credenciais/sessões e foi intencionalmente mantido fora do repo.

1. **Sessão Mercado Livre + Mavuri**: o V85 espera CDP em `http://127.0.0.1:9222`, um contexto Chrome autenticado no Hub e login Mavuri via localStorage. Cada VM do GitHub começa com perfil vazio. Precisamos testar uma **exportação segura e mínima** de cookies e localStorage pelo Playwright existente, restaurada em um perfil Linux temporário e comprovada funcional. Cookies criptografados do perfil Chrome Windows não são portáveis sem processamento. Mercado Livre pode exigir novo login, desafios anti-bot ou bloquear IPs de data center; NÃO inventar sucesso.
2. **Sessão Telegram MTProto**: o V85 carrega `MAVURI_TELEGRAM_SESSION_FILE` contendo StringSession pessoal. O arquivo deve ser restaurado em RAM/disco privado 0600 antes da rodada; não pode ser publicado num PR, commit ou artifact visível. Pode exigir nova autorização.
3. **Estado/cooldowns**: V85 mantém caches e arquivos JSON locais, perdidos entre jobs. Persistir estado necessário de modo seguro no Supabase, preservando as regras de repetição e deduplicação por canal. Nunca restaurar estado antigo sobre decisão mais recente.
4. **Transporte seguro**: GitHub Actions secrets protegem dados curtos, mas possuem limite de 48 KB por segredo. Para bundles grandes, usar **Supabase Storage privado com cifra autenticada**, chave distinta no ambiente protegido, ou outro cofre; nunca GitHub público, logs, artifacts em claro ou cache público.
5. **Ações públicas e acesso**: workflows de PR **nunca recebem** cookies de produção; execução real deve residir em workflow protegido, sem `pull_request_target`, permissões mínimas `contents:read`, segredos separados por ambiente, acesso restrito a operadores confiáveis e script verificado antes de cada mudança.
6. **Processo**: executores de 30 em 30 minutos geram ~1.440 rodadas/mês. Em repositório público, os minutos padrão são gratuitos, mas o cron pode atrasar e a conta pode estar sujeita a limites/uso aceitável. Implementar `concurrency` e lease persistente Supabase. Limpar sempre o perfil no fim do job.
7. **Exclusividade**: Windows desligado NÃO prova exclusão mútua. O futuro agendador deve consultar um lease transacional comum e checar `discovery_cloud_control`, garantindo que não haja dois escritores. Também atualizar a política local de bloqueio 48h e preço histórico seguro antes de publicar.
8. **Não habilitar `schedule` ainda**. Workflow de probe é somente teste; workflow produtivo só deve ser adicionado à branch `main` quando restauração autenticada, secrets, regras ML/Shopee/Magalu, cupons, monitoramento e rollback passarem.

## Testes seguintes com ordem e critérios de aceite

- [x] Executar Chrome headless + abrir endpoint CDP em GitHub public hosted runner.
- [x] Usar Playwright-core 1.55.0 para controlar esse Chrome, abrir `about:blank` e confirmar sessão vazia.
- [ ] Preparar exportador de auth mínimo com dados **criptografados**, limitado a domínios ML/Mavuri, sem logs nem armazenamento público.
- [ ] Validar autenticação ML em novo runner usando cookies RESTAURADOS (sem envio), inclusive refresh.
- [ ] Validar sessão Telegram MTProto (somente leitura).
- [ ] Preservar todos os caches/cooldowns e executar uma rodada `dry_run` REAL que não chame ingest/publicador para NENHUM marketplace.
- [ ] Validar uma única rodada real com Windows desligado, transações protegidas, 4 canais corretos, links afiliados e cupons.
- [ ] Ativar cron de 30 min na branch padrão, conferir 48h e alertas de falha/reautenticação.

## Alternativas e decisão

- **Primeira opção**: Github Actions público e gratuito; capacidade de Chrome+Playwright COMPROVADA. Requer autenticação portátil e persistência segura de estado (ainda NÃO comprovadas).
- **Segunda opção**: Google Cloud Run Jobs tem free tier de CPU/RAM, mas é efêmero da mesma forma e exige container, conta GCP e monitoramento de cobrança. O problema de login persiste. Não escolher antes de tentar GitHub.
- **Terceira opção**: VPS Linux paga com 4 GB RAM e Chrome persistente, caso Mercado Livre não aceite cookies restaurados entre execuções. É a opção operacionalmente mais simples para sessões de navegador duradouras, mas tem custo mensal e exige aprovação antes de contratação.
- **Oracle E2 1GB existente**: não executará V85 completo de forma confiável. Pode servir como mini scheduler/API, mas GitHub Scheduler + Supabase já suprem isso; não ocupá-la sem necessidade.
- **Oracle ARM Always Free**: eventualmente viável se houver disponibilidade, mas não depender dele.

**Estado de produção, no momento da preparação:** `discovery_cloud_control.enabled=false`, `active_executor=local`, zero execuções cloud, sem Cron Discovery. Manter WhatsApp desativado.
