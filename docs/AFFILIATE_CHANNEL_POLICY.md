# Mavuri — Política de canais de afiliados

## Objetivo

O Mavuri deve separar **capacidade técnica de distribuição** de **permissão comercial do programa de afiliados**.

Um canal pode ser tecnicamente suportado pelo Flow e, ainda assim, não estar autorizado para determinada oferta/programa. O worker não deve interpretar a existência de um Chat ID, URL ou integração como prova de conformidade.

## Mercado Livre — estado atual

As páginas oficiais do Programa de Afiliados consultadas em 22/09/2026 apresentam informações inconsistentes sobre WhatsApp e Telegram:

- Uma página oficial lista WhatsApp e Telegram entre plataformas permitidas quando os canais são públicos e abertos.
- Outra página oficial lista WhatsApp e Telegram como plataformas não permitidas.
- A orientação oficial também exige que os canais públicos utilizados pelo afiliado sejam informados no cadastro e proíbe grupos privados.

Por causa dessa inconsistência, o Mavuri **não deve hard-codear Telegram ou WhatsApp como permitido ou proibido**. Antes de uma operação comercial em escala, a configuração efetiva do programa/conta deve ser confirmada nos Termos e Condições aplicáveis e, se necessário, com o suporte do Mercado Livre.

## Regra de produto

1. O adapter de canal continua genérico.
2. A captura da oferta e o tracking continuam independentes do canal.
3. A publicação automática deve poder ser habilitada/desabilitada por canal.
4. O painel deve tratar "canal configurado" e "canal autorizado para monetização" como conceitos diferentes.
5. Nunca redirecionar automaticamente para a página inicial do marketplace.
6. Links de afiliado devem ser gerados pelas ferramentas oficiais do programa.
7. O Mavuri não deve afirmar que um link é válido/atribuível apenas porque possui formato de URL de afiliado.

## Diretriz para evolução

Quando houver integração com outro marketplace, cada adapter deverá declarar sua própria política de canais. O núcleo do Flow não deve assumir que uma regra de distribuição válida para um marketplace também vale para outro.

## Fontes oficiais consultadas

- https://www.mercadolivre.com.br/l/afiliados-compartilhamento-de-publicacao
- https://www.mercadolivre.com.br/l/afiliados-aproveite-o-programa
- https://www.mercadolivre.com.br/l/afiliados-pode-compartilhar
- https://www.mercadolivre.com.br/l/checklist
- https://www.mercadolivre.com.br/l/afiliados-direcionamento-de-visitas
