# Modelo de Domínio Conceitual

## Objetivo

Este documento apresenta o vocabulário de negócio do Mavuri Affiliate Engine. As entidades são conceituais: não representam tabelas, APIs, classes ou campos definitivos.

## Entidades

### Market

Representa o mercado geográfico/comercial em que uma oferta é relevante. O Brasil é o mercado inicial; os Estados Unidos e outros mercados são extensões previstas. Um mercado contextualiza moeda, idioma e disponibilidade quando essas regras vierem a ser definidas.

### Brand / Operation

Representa uma marca ou operação que utiliza o Affiliate Engine. Uma operação organiza sua presença comercial e pode operar em um ou mais mercados, trabalhar com várias plataformas e possuir múltiplos destinos de distribuição.

### Affiliate Platform

Representa uma plataforma ou programa de afiliados que pode fornecer produtos, ofertas, links ou métricas. A entidade identifica a origem de informações afiliadas sem impor detalhes de integração.

### Product

Representa o item comercial divulgado, independentemente de uma promoção específica. Um produto pode estar associado a uma plataforma e pode ter uma ou mais ofertas ao longo do tempo. Os critérios para identificação, deduplicação e catálogo são decisões pendentes.

### Offer

Representa uma oportunidade de divulgação de um produto em um contexto definido. Pode conter condições comerciais, disponibilidade, período de validade e demais informações que venham a ser necessárias. Uma oferta é distinta do produto porque um mesmo produto pode ter diferentes condições, mercados ou períodos.

### Affiliate Link

Representa um link atribuído a uma relação de afiliado e utilizável para divulgar uma oferta ou produto. Seu processamento futuro pode incluir regras de validação ou transformação, mas essas regras não estão definidas nesta fase.

### Distribution Channel

Representa o meio de distribuição de conteúdo. Telegram é o canal inicial previsto; WhatsApp e outros canais são futuras extensões. O canal descreve capacidades gerais, não um grupo, perfil ou conversa específicos.

### Distribution Target

Representa o destino específico dentro de um canal, como um grupo ou canal do Telegram. Um destino pertence a uma operação e está associado a um canal. Pode ter mercado, idioma e regras editoriais próprios quando tais requisitos forem definidos.

### Content

Representa uma peça de conteúdo preparada para divulgar uma oferta. Pode ter versões por idioma, mercado, operação ou destino. O formato, a geração, a revisão e a aprovação do conteúdo permanecem decisões pendentes.

### Publication

Representa a tentativa ou o registro de distribuição de um conteúdo em um destino. Ela conecta conteúdo e destino, preservando o contexto da oferta divulgada. Estados, agendamento, confirmação de entrega e reprocessamento ainda não foram especificados.

### Métricas

Métricas representam observações sobre o desempenho de ofertas, links, conteúdos ou publicações, como interações, acessos ou resultados que venham a ser disponibilizados por fontes confiáveis. As métricas prioritárias, seus cálculos, fontes, granularidade e período de retenção são decisões pendentes.

## Relacionamentos conceituais

```text
Market ──────── contextualiza ──────── Offer
Market ──────── contextualiza ──────── Brand / Operation

Brand / Operation ─ possui ─────────── Distribution Target
Distribution Channel ─ classifica ──── Distribution Target

Affiliate Platform ─ origina ───────── Product / Offer / Affiliate Link
Product ─ possui ───────────────────── Offer
Offer ─ utiliza ────────────────────── Affiliate Link
Offer ─ é divulgado por ────────────── Content
Content ─ é publicado como ─────────── Publication
Publication ─ é enviada a ──────────── Distribution Target

Métricas ─ podem se associar a ─────── Product, Offer, Affiliate Link,
                                       Content e Publication
```

Os relacionamentos indicam intenção de domínio, e não cardinalidades definitivas. Cardinalidades, obrigatoriedade, propriedade dos dados e regras de exclusão são decisões pendentes para a etapa de modelagem de dados.

## Contextos importantes

- **Mercado e idioma:** ofertas e conteúdos devem poder ser contextualizados para atender à expansão internacional, sem assumir regras de localização ainda não definidas.
- **Operação e destino:** uma operação pode organizar múltiplos grupos ou canais, mantendo sua distribuição separada por destino.
- **Origem afiliada:** produtos, ofertas e links podem ter uma plataforma como origem, mas não devem depender do formato técnico dela.
- **Ciclo de divulgação:** o fluxo conceitual vai de produto e oferta para link, conteúdo e publicação; cada etapa poderá ganhar regras próprias em fases futuras.
