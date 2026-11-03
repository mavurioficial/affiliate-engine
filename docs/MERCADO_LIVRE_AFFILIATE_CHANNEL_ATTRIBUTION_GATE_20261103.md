# Mavuri Mercado Livre — gate comercial e canais permitidos (03/11/2026)

## Achado crítico

Página oficial de compartilhamento: https://www.mercadolivre.com.br/l/afiliados-compartilhamento-de-publicacao

O Mercado Livre afirma permitir links de afiliados no WhatsApp/Telegram em canais **públicos e abertos**, e não em grupos privados/fechados. Outra página reforça que só redes/canais públicos declarados no cadastro são válidos:
https://www.mercadolivre.com.br/l/afiliados-onde-compartilhar-links

Página oficial de boas práticas: https://www.mercadolivre.com.br/l/boas-praticas-links
Riscos: grupos fechados, canais não declarados, links que não geram atribuição, visualizações artificiais, compras próprias e conteúdo desatualizado.

**Inconsistência relevante:** outra página oficial de orientação descreve WhatsApp/Telegram como não permitidos em geral:
https://www.mercadolivre.com.br/l/afiliados-aproveite-o-programa

Não presumir que todas as páginas refletem a política vigente para esta conta. Confirmar o termo/escopo do programa aplicável e os canais declarados antes de habilitar distribuição. Sem aguardar suporte para progredir em análise técnica, mas não tratar elegibilidade como comprovada.

## Estado do Mavuri verificado em Supabase

- Quatro destinos Telegram conectados: Mavuri Ofertas, Mavuri Tecnologia, Mavuri Mulher, Mavuri Casa & Cozinha.
- A tabela `flow_channels` não armazena um campo confiável de privacidade pública/privada nem aprovação da conta ML.
- Status "connected" comprova integração com bot, **não autorização comercial**.
- WhatsApp continua disabled.
- Piloto `mavuri-ml-observation-20261103` está ativo, ainda sem publicações.

## Plano de verificação de atribuição

1. Identificar um canal real **público, aberto e cadastrado** na conta afiliada, com confirmação das regras vigentes.
2. Criar etiquetas distintas para links oficiais versus qualquer hipótese experimental, se o portal permitir, sem alterar etiquetas antigas.
3. Usar links oficiais gerados pelo Portal/Barra como controle positivo; guardar produto, item, etiqueta e origem.
4. Não divulgar URLs diretas com matt_word/matt_tool como links comissionáveis enquanto não houver autorização/atribuição comprovada.
5. Validar em métricas reais e atribuição de **compras orgânicas independentes**, sem testar com familiares, compras próprias, bots ou cliques de teste.
6. Manter a distribuição ML desabilitada durante esta verificação. Não afetar Shopee/Magalu.

## Critérios para produção

- Fonte de ofertas distinta e suficientemente variada.
- Qualidade: desconto oficial comprovado **ou** preço competitivo claramente rotulado, frete e disponibilidade verificados.
- Geração de link oficial ou mecanismo explicitamente autorizado de comissão.
- Somente canais elegíveis e declarados.
- Publicação de até oito ofertas por ciclo de 30 minutos, sem sacrificar variedade/cooldown.
