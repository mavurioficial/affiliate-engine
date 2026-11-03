# Mavuri ML — piloto isolado, auditoria de candidatos (03/11/2026)

## Estado validado

- As URLs candidatas para Samsung Galaxy A17 e Sony PlayStation Gift Card, montadas por concatenação de matt_word e matt_tool, abriram os produtos corretos em testes manuais.
- Isso comprova navegação, **não atribuição comercial** ou autorização de uso automatizado.
- O protótipo em scripts/ml-direct-link-candidate.mjs só cria URLs candidatas; não envia dados nem publica.

## Leitura realizada diretamente no Supabase

- Total de ofertas ML: 798.
- 568 ofertas têm algum affiliate_url já cadastrado.
- 155 ofertas têm URL com identificador de catálogo e não possuem affiliate_url.
- Destas 155, 127 têm categoria; 49 têm desconto histórico >=10%.
- **0 das 155 foram capturadas nos 7 dias anteriores à auditoria**.
- Registro mais recente desse grupo: 08/10/2026.
- Os quatro canais Telegram estão conectados, mas permissão de publicação do Mercado Livre precisa ser verificada conforme termos da conta.

## Decisão de engenharia

As 155 ofertas são material de análise offline, NÃO candidatas prontas à publicação. Sem revalidação de preço, estoque, seller, variante e, principalmente, atribuição de comissão, o resultado de produção autorizado é **zero**.

O SQL em scripts/ml-cloud-candidate-dryrun.sql é somente leitura. Executá-lo não enfileira mensagens, não atualiza ofertas e não altera estado algum.

## Critérios exigidos para uma futura operação

1. Documentar e verificar mecanismo de atribuição/autorização comercial dos links diretos; se não verificado, não usar como affiliate_url de produção.
2. Descobrir ofertas recentes por fonte confiável acessível em nuvem, sem repetir sessões proibidas ou bloqueios 403.
3. Revalidar preço/variante/estoque e manter regras de categoria, tags, diversidade, cooldown e até 8 itens únicos.
4. Respeitar cron 08:00–22:00 horário de Brasília em ciclos 30min; não publicar fora da janela.
5. Fazer dry-run com contagens e razões de descarte antes de habilitar envios reais.
6. Nunca repetir compra própria, tráfego artificial, publicação de teste em canais públicos ou presumir comissão pelo banner GANHOS no portal.

Sem mudanças na main, cron, Edge Functions, RLS, jobs ou publicação Telegram.
