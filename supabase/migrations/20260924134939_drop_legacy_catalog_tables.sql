-- Remove the legacy catalog tables after the Mavuri Flow migration.
drop table if exists public.affiliate_links;
drop table if exists public.offers;
drop table if exists public.products;
drop table if exists public.channels;
drop table if exists public.platforms;
drop table if exists public.operations;
drop table if exists public.markets;
