import { developmentCatalogs } from '../infrastructure/development/catalogs.js'

export const sections = [
  ['mercados', 'Mercados', 'Contexto comercial', 'Mercados', 'Organize o contexto geográfico, idioma e moeda das futuras ofertas.', 'markets', ['locale', 'currency']],
  ['operacoes', 'Marcas / Operações', 'Organização', 'Marcas e operações', 'Agrupe a atuação comercial, os mercados e os idiomas de cada operação.', 'operations', ['markets', 'languages']],
  ['plataformas', 'Plataformas de afiliados', 'Origem afiliada', 'Plataformas de afiliados', 'Registre as origens de produtos, ofertas e links sem acoplamento a integrações.', 'platforms', ['status']],
  ['produtos', 'Produtos', 'Catálogo', 'Produtos', 'Consulte os itens comerciais, independentemente de uma promoção específica.', 'products', ['platform', 'category']],
  ['ofertas', 'Ofertas', 'Oportunidades', 'Ofertas', 'Acompanhe as oportunidades de divulgação no contexto de produto e mercado.', 'offers', ['product', 'market', 'status']],
  ['links', 'Affiliate Links', 'Atribuição', 'Affiliate Links', 'Visualize links vinculados a ofertas, sem validação ou processamento externo.', 'affiliateLinks', ['offer', 'platform', 'destination']],
  ['canais', 'Canais de distribuição', 'Distribuição', 'Canais de distribuição', 'Mantenha os canais separados de seus futuros destinos e adaptadores.', 'channels', ['capability', 'status']],
].map(([id, label, eyebrow, title, intro, catalog, fields]) => ({ id, label, eyebrow, title, intro, repository: developmentCatalogs[catalog], fields }))

