# Mavuri V85 Windows x Cloud — Matriz de paridade (22/10/2026)

**Objetivo inalterado:** PC desligado e Discovery Mavuri 24/7, ciclo de 30 minutos, com regras equivalentes ao runner V85, sem envios duplicados. **Não habilitar publicação cloud até paridade testada e cutover controlado.**

Este documento é um checklist técnico baseado no arquivo V85 original enviado pelo proprietário (`browser-discovery-v1(20261022-165219).mjs`), no estado da Edge Function `discovery-cloud-shopee` v14, nas regras `flow-shopee-ingest` e nos testes de banco Supabase de 22/10/2026. **O arquivo V85 original não está versionado** porque contém estado local e pelo menos um token embutido.

| Comportamento/regra exigida | V85 Windows | Cloud v14 | Estado de paridade |
|---|---|---|---|
| Agenda a cada 30min, independente da máquina | Runner local agenda; PC ligado | Nenhum Cron Discovery; enabled=false | **NÃO IMPLEMENTADO** |
| Exclusão mútua (Windows/cloud; sem duplicar) | Runner V85 não usa lease cloud | RPC/controle de lease preparado, mas não compartilhado | **NÃO VALIDADO** |
| Shopee GraphQL afiliados e 80 candidatos | Busca real no runner | API assinada real funciona, 80 candidatos e links presentes | **PARCIAL:** consultas e fontes/balanceamento não idênticos em todos os casos |
| Shopee até 8 ofertas únicas/ciclo | Meta V85 | Política no simulador; 7 projetadas em execução real | **SOMENTE SIMULAÇÃO** |
| Bloqueio 48h mesmo produto/canal | Regra-alvo V85; há divergências entre runner e ingest de produção | Simulação bloqueia 48h; 46 bloqueios em uma auditoria | **SOMENTE SIMULAÇÃO; NÃO ALTEROU INGEST REAL** |
| Liberação por queda REAL de preço >=10% | Regra-alvo, no pipeline atual há múltiplas camadas de cooldown | Consulta snapshots antigos e compara; não confirma preço exato renderizado | **SOMENTE SIMULAÇÃO / AUDITAR PREÇO** |
| Bloqueio 24h variante de outro vendedor | Desejado no Mavuri, identidade por produto/catálogo | Heurística de título provisória sem shop_id histórico | **NÃO VALIDADO EM DADOS REAIS** |
| Filtros, categorias e quatro canais | Regras reais e overrides do banco | V14 comparador shadow copia classificador de ingest e interpreta as quatro regras; não aplica overrides SQL posteriores, nem autoriza publicação | **SOMENTE COMPARAÇÃO** |
| Diversidade sem prejudicar categoria Outros | Regras e categorias ativas no Flow | 13/19 bloqueios por categoria Outros em v13; 32/80 'outros' na v14 | **EM AJUSTE; NÃO MUDAR LIMITES SEM VALIDAÇÃO** |
| Link de afiliado em todos os envios | Runner utiliza fontes/geração afiliada | API fornece offerLink; ainda não provou equivalência final de rastreamento e sub IDs | **PARCIAL** |
| Seleção e publicação Shopee nos canais | Runner V85 chama `flow-shopee-ingest` e `flow-worker` | `discovery-cloud-shopee` não escreve nem chama ingest ou worker | **NÃO IMPLEMENTADO** |
| Prioridade de cupons, fora da meta | V85 descobre vouchers Shopee, cupons ML/Magalu, consolidando publicação | Não portada no novo executor | **NÃO IMPLEMENTADO** |
| ML catálogo diversificado (~250), menor preço por variação, cupons, link próprio | V85 via Hub ML Chrome autenticado, Best Price + cupom | Sem coletor ML cloud | **NÃO IMPLEMENTADO** |
| Magalu até 5 ofertas/ciclo + cupons | V85 usa MTProto + navegador/loja + ingest | Sem coletor Magalu cloud | **NÃO IMPLEMENTADO** |
| WhatsApp/Whapi desativado | Pedido do usuário, preservado | `flow_channels.whatsapp=disabled` | **CORRETO — NÃO ATIVAR** |
| Amazon em modo manual | V85 tem coletor local; não integra meta ML8/Shopee8/Magalu5 | Não faz parte do primeiro corte da meta de 21; não portar token local | **FORA DO ESCOPO DO PRIMEIRO CORTE** |

## Próximos marcos obrigatórios (em ordem)

1. **Shopee em paralelo (shadow):** analisar por categorias os resultados da v14, confronto com regras+overrides reais. Preservar comissões/shop_id do GraphQL, regras específicas de nichos e deduplicação correta por canal. Melhorar as heurísticas com amostras validadas, sem falsos positivos.
2. **Pipeline de publicação:** garantir que preço publicado corresponde ao snapshot imutável e que o veto ao reenvio é consistente no worker/ingest/política. Testar com zero envios cloud no período.
3. **ML / Magalu / cupons:** extrair dependências de Chrome/MTProto para executores protegidos ou arquitetura independente; nunca versionar cookies, sesssões ou tokens locais.
4. **Cutover atômico:** compartilhar o lease com executor local (ou desligá-lo de forma explicitamente verificada), habilitar Cron 30min só no momento da troca, validar limites e rastreamento, rollback preparado.

**Situação factual ao atualizar:** somente `discovery-cloud-shopee` v14 está implantada; `discovery_cloud_control.enabled=false`, `active_executor=local`; nenhum Cron de Discovery. PR #19 permanece DRAFT. Não fazer merge, não desligar o PC.

**Cuidado semântico:** nunca apresentar `7/8` da simulação como oferta efetivamente publicada, nem os `matched_candidates_by_rule` como jobs que seriam autorizados. O candidato pode combinar regras de mais de um canal; a mesma oferta única só conta uma vez por ciclo.
