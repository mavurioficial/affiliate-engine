# Arquitetura Inicial

## Propósito

Esta proposta descreve uma arquitetura inicial de alto nível para o Mavuri Affiliate Engine. Ela não define uma stack nem inicia sua implementação. As escolhas tecnológicas indicadas como decisões pendentes deverão ser feitas quando houver requisitos suficientes para sustentá-las.

## Visão arquitetural

O sistema deve ser estruturado em camadas, com um núcleo de domínio independente das interfaces de usuário, persistência e provedores externos:

```text
Interfaces (administração e APIs)
              │
Aplicação (casos de uso e orquestração)
              │
Domínio (regras e entidades conceituais)
              │
Adaptadores de infraestrutura
 ├─ Persistência
 ├─ Plataformas de afiliados
 ├─ Canais de distribuição
 └─ Processamento assíncrono futuro
```

Essa separação deve permitir que o domínio de ofertas permaneça estável quando um canal, uma plataforma de afiliados ou a tecnologia de armazenamento mudar.

## Frontend

No futuro, o frontend deverá servir à administração das operações: consulta e organização de ofertas, manutenção de cadastros, preparação de conteúdo e acompanhamento de publicações e métricas.

**Decisão pendente:** framework, forma de entrega, autenticação, perfis de acesso, experiência de administração e desenho detalhado das telas.

## Backend

O backend deverá expor os casos de uso do produto e proteger as regras do domínio. Entre suas responsabilidades previstas estão coordenar a entrada de ofertas, a gestão de links, a preparação de conteúdo, a solicitação de publicação e a consulta de dados operacionais.

O backend não deve conter regras específicas de um provedor externo no núcleo do domínio. Essas regras devem ficar em adaptadores que implementem contratos definidos pela camada de aplicação.

**Decisão pendente:** linguagem, framework, estilo de API, estratégia de autenticação e autorização, e limites de módulos ou serviços.

## Banco de dados

Uma camada de persistência futura deverá armazenar os dados do domínio e preservar seus vínculos essenciais: mercado, operação, plataforma, produto, oferta, link, conteúdo, destino e publicação.

O esquema, o tipo de banco, índices, migrações, retenção e consistência transacional são decisões pendentes. Nenhum banco de dados ou modelo físico é criado nesta fase.

## Integrações externas

Integrações devem ser tratadas como adaptadores substituíveis. Cada adaptador deve traduzir entre o contrato interno e as particularidades de uma plataforma de afiliados ou canal de distribuição.

- **Plataformas de afiliados:** futuras fontes de ofertas, produtos, links ou métricas.
- **Telegram:** primeiro canal previsto para publicação.
- **WhatsApp e outros canais:** extensões futuras, sem pressupor que compartilhem a mesma API ou capacidades do Telegram.

Uma integração não deve definir as entidades centrais do sistema. Informações específicas do provedor devem permanecer restritas ao adaptador e a configurações necessárias, evitando espalhar dependências externas pelo domínio.

## Processamento assíncrono futuro

Atividades potencialmente demoradas ou sujeitas a falhas externas — como importação de ofertas, processamento de links, geração de conteúdo, publicação, reprocessamento e coleta de métricas — poderão ser executadas de maneira assíncrona no futuro.

**Decisão pendente:** mecanismo de filas, formato de tarefas, política de repetição, idempotência, agendamento, monitoramento e tratamento de falhas. A V1 não implementa processamento assíncrono.

## Separação entre domínio e integrações

O núcleo deve modelar intenções de negócio, como “publicar um conteúdo em um destino”, sem depender de detalhes como endpoints, credenciais, formatos de mensagem ou identificadores de provedores. A camada de aplicação escolhe o adaptador aplicável; o adaptador executa a comunicação externa e devolve resultados em termos compreensíveis pelo domínio.

Essa orientação favorece testes das regras de negócio sem chamadas externas e reduz o impacto da inclusão ou substituição de plataformas e canais.

## Preparação para crescimento

A evolução deve preservar os seguintes eixos de expansão:

- múltiplos mercados, começando por Brasil e prevendo Estados Unidos e outros;
- múltiplos idiomas, começando por português e inglês;
- múltiplas operações ou marcas;
- múltiplas plataformas de afiliados;
- múltiplos canais e destinos de distribuição por operação;
- crescimento de tarefas assíncronas e de métricas sem acoplamento às interfaces.

Não há decisão nesta fase sobre arquitetura monolítica, serviços separados, fornecedores de nuvem ou topologia de implantação. A escolha deve acompanhar o estágio e as necessidades comprovadas do produto.
