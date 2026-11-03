# Mavuri / Mercado Livre: dry-run direct URL investigation

This is a **non-production, branch-only experiment**. It constructs URL candidates from an individual product URL and two metadata values. It does not generate an official Mercado Livre affiliate link, demonstrate merchant authorization, or establish commission attribution.

## Run the completely offline check

    node scripts/test-ml-direct-link-candidate.mjs
    node scripts/ml-direct-link-candidate.mjs --product https://www.mercadolivre.com.br/p/MLB63335606 --matt-word YOUR_TAG --matt-tool YOUR_NUMERIC_ID

The experiment makes no Mercado Livre or Supabase requests, writes no database records, creates no scheduled jobs, and never publishes to Telegram.

## Explicit limitations

- Official full links sampled from the Mercado Livre Link Generator point to a social profile path and have an opaque product-specific ref. The candidate instead points to a direct catalog product and adds matt_word/matt_tool. They are not equivalent.
- Parsing a syntactically correct URL does **not** demonstrate that a commission will be attributed.
- The catalog product ID alone does not guarantee the right seller, buy-box winner, variant, promotion, or availability.
- Do not create fake traffic, self-purchases, or posts in channels not allowed by the affiliate program.

## Release gate (not met)

Before considering production, obtain adequate evidence that a candidate is permitted, attributed correctly, and leads to the intended item/offer. The existing queue/worker must never use an unverified candidate in its affiliate_url field. All production operations remain untouched.
