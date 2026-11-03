# Mavuri ML — seleção em modo sombra (03/11/2026)

## Implementado no Supabase

View privada: `mavuri_internal.ml_shadow_candidate_scores`.

A view lê exclusivamente as observações oficiais de catálogo coletadas pelas tabelas `public.mavuri_ml_observation_runs` e `public.mavuri_ml_observation_items`. Não faz consultas de rede, não grava ofertas e não envia mensagens.

### Regras de pré-seleção

- Considera apenas preços observados nas últimas 24 horas.
- Considera somente a observação mais recente de cada `item_id`.
- Evita contar anúncios diferentes do mesmo vendedor como concorrência independente.
- Escolhe apenas o menor preço por `catalog_id`, sem multiplicar o mesmo produto.
- `own_item_price_drop`: redução mínima de 10% em relação à observação anterior **do mesmo anúncio**.
- `competitively_priced`: preço pelo menos 5% menor que outro vendedor do mesmo catálogo.
- `insufficient_evidence`: sem sinal suficiente.
- `publication_allowed=false`, `affiliate_attribution_verified=false` e `verified_official_discount=false` são obrigatórios.

**Atenção:** a diferença entre vendedores não comprova promoção, a mesma página de catálogo pode conter variantes e a vantagem deve ser validada considerando frete/estoque. Dados de catálogo não são equivalentes a links oficiais de afiliados.

### Prévia segura

```sql
select catalog_id,item_id,name,category,price,previous_item_price,
       next_seller_price,item_price_drop_pct,seller_price_advantage_pct,
       signal_type,preliminary_signal,publication_allowed
from mavuri_internal.ml_shadow_candidate_scores
order by preliminary_signal desc,observed_at desc
limit 8;
```

### Testes

- Cenário sintético com dois vendedores de um mesmo catálogo (R$100 x R$150): `competitively_priced`.
- Cenário sintético com mesmo anúncio caindo de R$200 para R$170: `own_item_price_drop`.
- Cenário sem diferença/histórico: `insufficient_evidence`.
- Resultados verificados via consultas SQL somente leitura.
- A view está protegida em `mavuri_internal`, com acesso SELECT ao `service_role`, sem SELECT ao `anon`.

### Estado

A coleta está agendada para 03 a 06/11/2026. Antes do primeiro ciclo, não há observações, então o resultado real da view é 0 linhas — não inventar ofertas.

## Próximas etapas

Após os primeiros ciclos, examinar a taxa de produtos novos, repetidos, quedas de preço e candidatos preliminares; ampliar diversidade só se a API se mantiver estável. Atribuição comissionada continua uma linha de trabalho separada e não bloqueia a simulação.
