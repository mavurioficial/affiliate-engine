# Mavuri — piloto real 1 oferta Telegram → Amazon → Telegram (04/11/2026)

## Resultado confirmado
- Execução GitHub Actions: https://github.com/mavurioficial/affiliate-engine/actions/runs/41823873443
- Horário: 08h48 BRT, 04/11/2026.
- Origem: mensagem pública do Tá Bugado `541131`, lida pela sessão de conta de usuário no GitHub Actions. **Sem bot instalado no grupo**.
- Captura do workflow: 25 mensagens recentes; 5 ASINs distintos Amazon identificados; uma oferta selecionada.
- Produto postado: ASIN `B0DCKBMVH9`. O cartão de pré-visualização do próprio Telegram exibiu **Mixer Power Inox 3 em 1 600W Elgin Lunar 110V**; o texto da mensagem usou provisoriamente o nome genérico `Produto Amazon`.
- Link gerado: `https://www.amazon.com.br/dp/B0DCKBMVH9/ref=nosim?tag=mavuri0a-20`. A tag é a cadastrada no Mavuri; comissão não validada por venda.
- Supabase: `public.mavuri_telegram_onepost_audit`: test_key `tgcloudpilot:run:41823873443`, `status=sent`, `asin=B0DCKBMVH9`, `telegram_message_id=3441`, created_at `2026-11-04 11:48:29.501032+00`.
- Destino: **Mavuri Ofertas**, somente uma mensagem; o usuário confirmou visualmente no Telegram. Sem preço ou desconto alegado.
- GitHub Actions completou em sucesso: 5/5 testes do coletor original passaram. Esta execução comprova **caminho ponta a ponta na nuvem de uma oferta Amazon**, não cron recorrente nem qualidade de preço.

## Ajuste posterior sem novo envio
- `scripts/telegram-cloud-onepost.mjs`: campo opcional `title` recuperado de metadados de pré-visualização do Telegram ou, quando plausível, de uma linha curta de nome da mercadoria. Sem armazenar/encaminhar mensagem completa.
- `supabase/functions/mavuri-telegram-amazon-cloud-onepost/index.ts`: aceita o título facultativo, remove controles e faz HTML escaping antes de inserir no texto, com `Produto Amazon` como fallback.
- Função implantada no Supabase, versão **3**, sem publicação adicional. Testes da versão nova aguardam execução do workflow; **não afirmar que título funciona para todos os tipos de post**.

## Limitações atuais
- Programa de teste limitado a uma execução manual (workflow_dispatch), até 25 mensagens recentes, 5 ASINs, no máximo 1 postagem por execução.
- Não há agendamento recorrente nem ingestão contínua de novos produtos na base `flow_offers`. A auditoria registra apenas as publicações de teste.
- Preços não são verificados; **não publicar números da mensagem de terceiros como preço atual**.
- A leitura automatizada recorrente de grupos de terceiros exige atenção às condições de acesso e permissão do Telegram/fonte. O piloto individual não estabelece autorização para monitoramento permanente.
- A sessão privada `TG_SESSION_STRING` é segredo que concede acesso à conta, não imprimir nem armazenar em arquivos de log.
- Nenhuma alteração nos crons existentes Shopee/Magalu.
