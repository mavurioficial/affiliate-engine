# Roadmap Inicial

## Orientação

O roadmap organiza uma evolução incremental do Mavuri Affiliate Engine. As fases descrevem objetivos, não compromissos de prazo nem decisões técnicas fechadas. A implementação deve avançar após validação das decisões pendentes de cada etapa.

## Fase 1 — Fundação

- Consolidar visão do produto, princípios, arquitetura de alto nível e modelo conceitual.
- Confirmar o vocabulário de mercados, operações, plataformas, ofertas e distribuição.
- Registrar decisões técnicas e de negócio ainda abertas.

**Resultado esperado:** base documental comum para planejar a implementação.

## Fase 2 — Modelo de dados

- Traduzir o modelo conceitual em um modelo de dados a ser aprovado.
- Definir identificadores, cardinalidades, estados, validações e regras de histórico necessárias.
- Escolher tecnologia de persistência e estratégia de migrações.

**Decisão pendente:** banco de dados e modelo físico.

## Fase 3 — Administração

- Definir os casos de uso de administração para mercados, operações/marcas, plataformas, produtos, ofertas, links, canais e destinos.
- Implementar as interfaces administrativas somente após a escolha da stack e das regras de acesso.

**Decisões pendentes:** frontend, backend, autenticação, autorização e experiência de uso.

## Fase 4 — Entrada de ofertas

- Definir o primeiro fluxo de entrada de produtos e ofertas.
- Permitir registrar a origem afiliada e os links relacionados conforme as regras aprovadas.
- Estabelecer critérios de qualidade, atualização e validade de dados.

**Decisão pendente:** a entrada inicial será manual, importada ou descoberta por integração futura.

## Fase 5 — Integração com Telegram

- Definir o contrato do canal de distribuição e os requisitos operacionais do Telegram.
- Implementar o adaptador do Telegram após a definição de credenciais, permissões, formatos e tratamento de falhas.
- Associar destinos de Telegram às operações pertinentes.

**Limite:** não pressupõe integração com outros canais nesta fase.

## Fase 6 — Publicação

- Definir o ciclo de preparação, revisão e publicação de conteúdo.
- Registrar publicações por destino e o vínculo com oferta, link e conteúdo.
- Avaliar necessidade de agendamento, filas, repetição e idempotência.

**Decisão pendente:** automação, aprovação editorial, processamento assíncrono e política de falhas.

## Fase 7 — Métricas

- Definir métricas prioritárias, fontes de dados e indicadores de sucesso.
- Relacionar métricas a ofertas, links, conteúdos e publicações quando aplicável.
- Projetar consultas e visualizações administrativas de acordo com necessidades validadas.

**Decisão pendente:** quais eventos e dados estarão disponíveis por plataforma e canal.

## Fase 8 — Futuras integrações e expansão

- Adicionar plataformas de afiliados conforme prioridade de negócio.
- Expandir para WhatsApp e outros canais por meio de adaptadores próprios.
- Ampliar mercados além do Brasil, incluindo Estados Unidos, e aprimorar suporte a português e inglês conforme necessidades de cada operação.
- Evoluir processamento assíncrono, observabilidade, segurança e infraestrutura quando justificado pelo uso.

## Critério de evolução

Cada fase deve manter o núcleo de domínio independente de detalhes de provedores externos. Antes de avançar, devem ser confirmados os requisitos, os critérios de aceite e as decisões pendentes que afetam a fase seguinte.
