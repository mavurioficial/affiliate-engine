# Decisões Técnicas — Fundação Executável do MVP

Este registro complementa a documentação conceitual e separa escolhas habilitadoras de requisitos de negócio ainda não definidos.

## Escolhas desta etapa

### Aplicação web local estática com JavaScript nativo

Foi adotada uma aplicação web de página única composta por módulos JavaScript nativos e CSS, servida por um servidor Node.js local sem dependências de terceiros. A escolha é limitada à fundação executável: permite executar e validar a interface mesmo em ambientes sem acesso ao registro de pacotes, sem introduzir serviços externos ou pagos. A adoção de framework continua reavaliável quando os casos de uso administrativos forem definidos.

### Catálogos de desenvolvimento em memória

Os dados mostrados na interface são objetos locais em `src/infrastructure/development/catalogs.js`. Eles não são uma fonte de verdade, não persistem alterações e não representam uma decisão sobre banco de dados, modelo físico ou origem real das ofertas.

### Contrato de repositório de leitura

As telas dependem de um contrato de catálogo na camada de aplicação. A implementação local fica na infraestrutura. Esse limite permite substituir os dados demonstrativos por API ou banco de dados em uma fase posterior, preservando a interface e o vocabulário do domínio.

## Decisões pendentes

Os itens abaixo permanecem abertos e exigem validação antes de evolução funcional:

- modelo físico: identificadores, cardinalidades, estados, regras de histórico, validações e exclusões;
- banco de dados, migrações, índices, consistência e retenção;
- casos de uso de criação e edição na administração, incluindo regras de acesso, autenticação e autorização;
- origem inicial de produtos e ofertas (cadastro manual, importação ou integração);
- regras de normalização, validade, atribuição e processamento de affiliate links;
- modelo de destinos de distribuição, conteúdo, revisão e publicação;
- contrato e credenciais para adaptadores de Telegram ou outras plataformas;
- infraestrutura de implantação, observabilidade, segurança e processamento assíncrono.
