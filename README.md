# Mavuri Affiliate Engine

Fundação executável do MVP para administrar, inicialmente de forma local, o domínio de ofertas afiliadas da Mavuri.

## Estado atual

Esta etapa entrega uma interface administrativa navegável com dados demonstrativos para:

- Mercados;
- Marcas / operações;
- Plataformas de afiliados;
- Produtos;
- Ofertas;
- Affiliate Links;
- Canais de distribuição.

Não há autenticação, banco de dados, integração com plataformas afiliadas, Telegram, scraping, automações ou publicação real. Os dados são mantidos em memória no navegador e servem exclusivamente à validação inicial da estrutura.

## Executar localmente

### Pré-requisitos

- Node.js 20 ou superior;
- npm 10 ou superior (para os scripts locais).

### Comandos

```bash
npm run dev
```

Abra `http://localhost:5173`.

Para validar a sintaxe e gerar a versão de produção:

```bash
npm run check
npm run build
```

Para servir o build localmente:

```bash
npm run preview
```

## Organização do código

```text
src/
├── application/     Contrato de acesso aos catálogos
├── infrastructure/  Implementação local de desenvolvimento
└── app/             Configuração das áreas administrativas
```

O código da interface consome contratos da camada de aplicação. Assim, o catálogo local pode ser substituído futuramente por adaptadores de API ou persistência sem acoplar as telas a detalhes de infraestrutura.

## Documentação e decisões

A visão, arquitetura, modelo conceitual e roadmap estão em [`docs/`](docs/). As escolhas habilitadoras desta etapa e os pontos que requerem validação estão registrados em [`docs/TECHNICAL_DECISIONS.md`](docs/TECHNICAL_DECISIONS.md).
