# Affiliate Discovery → Flow ingest V1

## Objetivo

Receber no Supabase os produtos descobertos pelo worker local do Mercado Livre e encaixá-los no pipeline já existente do Mavuri Flow:

`Chrome Worker → flow-discovery-ingest → flow_offers → rules → flow_delivery_jobs → flow-worker → Telegram`

A função **não** recebe cookies, CSRF, sessão do Mercado Livre ou tokens OAuth do Mercado Livre. Ela recebe apenas o JSON normalizado das ofertas.

## Segurança

- Endpoint protegido por sessão JWT do usuário.
- A função identifica o usuário pelo `Authorization: Bearer <JWT>`.
- Depois da autenticação, usa uma chave secreta somente no backend para gravar os dados.
- O worker local nunca precisa conhecer uma service key do Supabase.

A arquitetura separa **usuário do Mavuri** de **conta afiliada do marketplace**. Isso permite manter hoje a conta pessoal `lucasbrasildf` como uma conta conectada e, futuramente, adicionar uma conta dedicada ao Mavuri ou múltiplas contas por usuário.
- A configuração padrão do Supabase mantém `verify_jwt` habilitado para funções autenticadas. Isso segue o padrão recomendado para chamadas feitas por usuários autenticados. 

## Payload

```json
{
  "offers": [
    {
      "id": "MLB123456789",
      "product_id": "MLB123456",
      "title": "Produto de exemplo",
      "price": 99.9,
      "previous_price": 129.9,
      "discount": 23,
      "coupon": null,
      "shipping_text": "Frete grátis",
      "url": "https://www.mercadolivre.com.br/...",
      "affiliate_url": "https://meli.la/...",
      "image_url": "https://...",
      "extra_commission": true,
      "category": "cozinha",
      "seller": "loja-exemplo",
      "list_url": "https://www.mercadolivre.com.br/afiliados/hub",
      "metadata": {}
    }
  ]
}
```

Máximo por chamada: 100 ofertas.

Opcionalmente, o payload pode informar `affiliate_account_id`. Quando informado, a função valida que a conta pertence ao usuário e ao Mercado Livre. Sem esse campo, usa a primeira conta ativa do Mercado Livre disponível para compatibilidade.

## Idempotência

A identidade operacional da oferta é o `source_ref` do produto Mercado Livre, dentro do usuário + marketplace. A oferta também pode carregar `affiliate_account_id`, permitindo que o mesmo usuário tenha múltiplas contas do Mercado Livre sem misturar credenciais, links ou origem comercial.

O `fingerprint` representa o estado comercial relevante da oferta. Se a mesma oferta voltar sem mudança, ela não gera novo job. Se preço, desconto, título ou outros dados relevantes mudarem, o fingerprint muda e uma nova entrega pode ser criada.

O `delivery_key` é determinístico:

`discovery:<offer_id>:<fingerprint>:<channel_id>`

Isso permite repetir o discovery sem duplicar publicações para o mesmo estado da oferta.

## Regras

A função reaproveita a estrutura atual de `flow_rules` e suporta:

- `marketplace`
- `minDiscount` / `maxDiscount`
- `minPrice` / `maxPrice`
- `category`
- `seller`
- `allowedWords`
- `deniedWords`
- `requireCoupon`

As ações usam `channel_ids`. Apenas canais Telegram ativos e com referência externa válida recebem jobs nesta etapa.

## Dry run

Enviar:

```json
{ "offers": [...], "dry_run": true }
```

faz a validação, deduplicação e avaliação das regras sem gravar ofertas nem jobs.

## Limite deliberado

Esta função não gera automaticamente o link de afiliado. O worker pode enviar `affiliate_url` quando já o possuir; a geração automática continua separada porque o endpoint observado no Central de Afiliados é interno/undocumented e não deve ser tratado como API pública estável.

## Próximo encaixe

O próximo passo técnico é o worker local chamar esta função usando a sessão autenticada do próprio Mavuri no navegador dedicado, sem transportar credenciais do usuário para o processo do worker.

