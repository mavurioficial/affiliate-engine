# Mavuri — prova de ingestão de mensagens de ofertas (03/11/2026)

## Amostras reais fornecidas pelo usuário

1. https://t.me/GRUPOTABUGADO/541060
   Texto encaminhado: "Personal Papel Higiênico VIP Folha Dupla Leve 32 Pague 28 rolos 30Ml R$33,52 NA RECORRENCIA", com frete grátis condicionado à assinatura Prime. Link https://link.amazon/B08aKs8yN.
2. https://meli.la/1DhpTm8 — URL de terceiro encaminhada pelo usuário. Produto específico ainda não identificado com segurança.
3. https://meli.la/2H56Kz8 — URL de terceiro encaminhada pelo usuário. Produto específico ainda não identificado com segurança.

Os posts https://t.me/GRUPOTABUGADO/541058 e /541041 também foram fornecidos, mas **não há associação verificada** entre cada post e cada link encurtado.

## Resultados das verificações

- Mensagem Amazon: preço anunciado R$33,52, **apenas na recorrência**, com frete grátis condicionado ao Prime; condição comercial não verificada.
- Os dois links curtos meli.la foram consultados uma vez cada, via GET com redirecionamento manual. Ambos retornaram HTTP 301 para www.mercadolivre.com.br/social/..., com parâmetros ref/matt_word.
- Os cabeçalhos de redirecionamento não revelaram catalog_id ou item_id; não atribuir nome/preço/especificações a eles sem identificação independente.
- A função de diagnóstico temporária foi **encerrada** imediatamente após o teste (v2 com 410, verify_jwt=true). Sem cron.
- Nenhuma requisição ao catálogo (HTTP 429 anterior), scraping de HTML, compra, clique sintético ou publicação.
- Nunca reutilizar links de terceiros como affiliate_url do Mavuri.

## Dados persistidos no Supabase

Tabela privada: mavuri_internal.external_discovery_candidates.
Três registros de entrada voluntária do usuário; um Amazon e dois Mercado Livre.
Informações: marketplace, link original, referência de origem quando comprovada, preço e restrições condicionais se conhecidos.
Todos com price_verified_current=false, own_affiliate_verified=false e publication_allowed=false.
RLS ativa; SELECT anônimo negado; SELECT authenticated negado; service_role autorizado.

## Código em branch experimental

- src/domain/telegram-offer-intake.js
- scripts/test-telegram-offer-intake.mjs
- src/domain/retailer-shortlink-intake.mjs
- scripts/test-retailer-shortlink-intake.mjs

Esses módulos são **somente extratores de candidatos**. Não monitoram grupos, não consultam páginas, não geram comissão, não alimentam a distribuição e não enviam mensagens.
Validação local de exemplos e negações de domínio foi executada em ambiente de simulação.

## Próximo gate técnico

1. Receber conteúdo da mensagem de um canal com autorização ou encaminhamento voluntário para identificar título, produto, cupom e preço.
2. Resolver produto/variante e verificar preço atual por via permitida.
3. Gerar link próprio com atribuição demonstrada.
4. Deduplicar/classificar e testar dry-run do flow-discovery-ingest sem transmissão.
5. Só liberar publicação automática após os gates anteriores.

Não confundir prova de captura/normalização com operação autônoma 24h.
