# Mavuri Mercado Livre — duas fontes de candidatos (03/11/2026)

## Alterações aplicadas no Supabase

Duas *views privadas e sem publicação*, no schema `mavuri_internal`:

- `ml_shadow_candidate_scores`: acompanha observações de catálogo com preço recente, deduplicadas por anúncio e por produto de catálogo. Mostra sinais preliminares de redução >= 10% no mesmo anúncio ou vantagem de preço >= 5% em relação a outro vendedor. Não compara como desconto oficial.
- `ml_legacy_seed_pool`: consolida links históricos do tipo `https://meli.la/...` já guardados no Flow. Deduplicação por `catalog_id`, um produto por catálogo. Marcação explícita para revalidar preços, vendedor e link.

Origem real no Supabase: 566 registros com `meli.la`, sendo 546 links curtos únicos, 368 URLs de catálogo e 350 catálogos distintos. O último registro é de 22/10/2026. Todos os preços/descontos são históricos, não válidos para publicação imediata.

Resultados do banco após criação:
- `ml_legacy_seed_pool`: 350 produtos distintos, 345 com desconto histórico >=10% (NÃO atual).
- `ml_shadow_candidate_scores`: 0 registros porque o primeiro ciclo de observação ainda não ocorreu.
- Ambas têm `publication_allowed = false` e `affiliate_attribution_verified = false`.
- As duas views são do schema não exposto `mavuri_internal`, com `security_invoker=true`, SELECT somente para `service_role`; `anon` não tem SELECT.

## Consulta de diagnóstico dos links históricos

```sql
SELECT category,count(*) AS distinct_catalogs
FROM mavuri_internal.ml_legacy_seed_pool
GROUP BY category ORDER BY count(*) DESC;
```

## Pré-seleção SOMENTE para teste (não publicar)

```sql
SELECT catalog_id,item_id,name,category,price,
       previous_item_price,item_price_drop_pct,
       seller_price_advantage_pct,signal_type,publication_allowed
FROM mavuri_internal.ml_shadow_candidate_scores
WHERE preliminary_signal
ORDER BY item_price_drop_pct DESC NULLS LAST,
         seller_price_advantage_pct DESC NULLS LAST
LIMIT 8;
```

## Próxima etapa

Validar nas execuções agendadas as métricas de coleta e, após a recuperação da API, testar **poucos registros por vez** do acervo histórico. Só considerar a publicação com preço, item e link atualizados, conforme regras de categoria, variedade e cooldown. Nenhum envio automático do Mercado Livre foi ligado neste desenvolvimento.
