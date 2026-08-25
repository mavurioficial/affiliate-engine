# Visão do Projeto — Mavuri Affiliate Engine

## Visão do produto

O Mavuri Affiliate Engine é a plataforma da Mavuri para gerenciar e distribuir ofertas de afiliados. Ela deverá centralizar produtos, ofertas e links de afiliados de múltiplas plataformas, organizá-los por mercado e operação/marca, e transformá-los em conteúdo pronto para publicação nos canais de distribuição adequados.

A plataforma começará com foco no mercado brasileiro, nos idiomas português e inglês e na distribuição por Telegram. A estrutura conceitual, porém, deve permitir a expansão gradual para os Estados Unidos, outros mercados, WhatsApp e demais canais.

## Problema que resolve

Operações de afiliados precisam lidar com ofertas originadas em plataformas diferentes, links específicos, públicos e mercados distintos, além de vários grupos ou canais de divulgação. Quando essas informações ficam dispersas, aumenta o trabalho manual, diminui a consistência do conteúdo e torna-se difícil acompanhar o ciclo de vida de cada oferta e publicação.

O Affiliate Engine busca estabelecer uma base única para organizar esse fluxo: da entrada ou descoberta de uma oferta à preparação do conteúdo e à sua distribuição.

## Objetivos

- Centralizar o cadastro e a organização de produtos, ofertas e links de afiliados.
- Suportar múltiplas plataformas de afiliados sem acoplar o domínio a uma plataforma específica.
- Modelar mercados, idiomas e operações/marcas de forma explícita.
- Preparar conteúdo de divulgação associado a ofertas e adequado a destinos de distribuição.
- Publicar inicialmente em destinos do Telegram.
- Permitir que uma mesma operação gerencie múltiplos grupos ou canais.
- Preservar uma arquitetura extensível para novos mercados, idiomas, plataformas e canais.

## Princípios

1. **Domínio antes de integração.** Produtos, ofertas, links e publicações pertencem ao domínio; detalhes de APIs e provedores devem permanecer isolados.
2. **Configuração por contexto.** Mercado, idioma, marca/operação e destino de distribuição devem orientar a organização dos dados e do conteúdo.
3. **Evolução incremental.** A primeira versão deve validar a fundação do produto sem antecipar integrações ou automações não necessárias.
4. **Rastreabilidade.** A documentação e o modelo futuro devem permitir acompanhar a origem de uma oferta, o link utilizado, o conteúdo gerado e a publicação correspondente.
5. **Extensibilidade consciente.** Novos canais e plataformas devem poder ser acrescentados sem reestruturar o núcleo do domínio.
6. **Decisões explícitas.** Requisitos e escolhas técnicas ainda não definidos devem ser registrados como decisões pendentes, e não assumidos como fatos.

## Escopo da V1

A V1 estabelece a fundação documental e conceitual do projeto. Ela inclui:

- definição da visão, princípios e limites iniciais do produto;
- proposta arquitetural de alto nível, sem implementação;
- modelo conceitual das entidades e seus relacionamentos;
- planejamento incremental das fases de desenvolvimento;
- direcionamento inicial para Brasil, português e inglês, Telegram e suporte conceitual a múltiplas operações, plataformas e destinos.

## Fora do escopo da V1

Os itens abaixo são explicitamente excluídos desta primeira versão:

- implementação de frontend, backend ou banco de dados;
- instalação de dependências ou definição de stack tecnológica definitiva;
- integração real com plataformas de afiliados;
- descoberta automatizada, coleta ou importação de ofertas;
- encurtamento, validação, redirecionamento ou outro processamento técnico de links;
- integração com Telegram, WhatsApp ou qualquer outro canal externo;
- publicação automática, filas, agendamentos ou processamento assíncrono em produção;
- geração automática de conteúdo, inclusive com serviços de IA;
- dashboards, cálculo de métricas ou relatórios operacionais;
- autenticação, permissões e regras detalhadas de acesso;
- decisões de infraestrutura, hospedagem, observabilidade, segurança ou retenção de dados.

## Decisões pendentes

- Tecnologias de frontend, backend, banco de dados e infraestrutura.
- Formato e origem inicial da entrada de ofertas.
- Regras de normalização, validade e atribuição de links de afiliados.
- Estratégia de criação, revisão, localização e aprovação de conteúdo.
- Regras de publicação, agendamento, falhas e repetição por canal.
- Definição das métricas prioritárias e das fontes que poderão fornecê-las.
