# Leitura completa do Lume

## Visão geral

O Lume é um app de gestão para restaurantes e lanchonetes de pequeno porte. Ele reúne, num só lugar:

- Cardápio digital
- Pedidos de salão, balcão e online
- Gestão de salão com 100 mesas numeradas — só o número, sem lugares
- Ponto de venda (PDV)
- Caixa com calculadora de taxa da maquininha
- Estoque
- Entregas próprias com rastreio
- Integrações demonstrativas com iFood e 99

Existem duas versões do Lume:

| Versão | Como funciona |
| --- | --- |
| App completo | Com backend e dados persistentes |
| Demonstração pública | Estática, com dados de exemplo temporários por visitante |

Regra do projeto: toda atualização feita no app principal vai também para a demonstração. As duas versões ficam sincronizadas.

## Identidade visual

A identidade do Lume é escura, com laranja como cor principal.

- **Logomarca:** chama laranja neon sobre fundo preto, em estilo startup. É a versão 4, escolhida pelo usuário.
- **Tema:** dark predominante, com acentos em laranja e âmbar em toda a interface.
- **Efeito GridBeam:** feixes de luz suaves em laranja e âmbar percorrem as divisórias dos grids — no resumo, no mapa de mesas e nos pagamentos. Há um controle "Pausar luz ambiente" e o efeito respeita a redução de movimento configurada no sistema do usuário.
- **Notificações sonoras:** botão para alternar entre modo com som e modo sem som. Ao chegar um pedido novo, uma voz fininha anuncia: "Lume! Novo pedido recebido!"

## Arquitetura de ponta a ponta

### Frontend

App web em React + TypeScript.

Principais arquivos de tela e componente:

- `App.tsx` — estrutura principal do app da equipe
- `CustomerPortal.tsx` — área do cliente
- `DeliveryView.tsx` — entregas
- `SalesReportsView` — relatórios e curva de vendas
- `OrderForm` — lançamento de pedidos
- `MenuForm` — cadastro de itens do cardápio
- `theme.css` — tema visual

### Backend

Camada de servidor em TypeScript, em `server/src/actions.ts`, com validações feitas no servidor — inclusive a validação de permissões. As mudanças no banco usam migrações SQL versionadas, como `0009_add_order_notes.sql`, que adicionou as observações nos pedidos.

### Banco de dados

| Área | Tabelas |
| --- | --- |
| Equipe e acesso | `staff_users`, `access_roles`, `staff_sessions` |
| Cardápio | `menu_items` |
| Salão | `dining_tables` |
| Pedidos | `orders`, `order_items` |
| Caixa | `cash_sessions`, `payments`, `payment_fee_settings` |
| Estoque | `stock_items` |
| Entregas | `deliveries`, `delivery_drivers`, `delivery_settings` |
| Outros registros | `entries` |

### Autenticação e permissões

- Primeiro acesso do dono com login seguro.
- Login individual por usuário e senha para cada funcionário.
- Área "Acessos" para o dono criar, editar, ativar e desativar funcionários.
- Perfis iniciais: gerente, caixa, cozinha, entregador e atendente — todos ajustáveis.
- Cada perfil controla quais módulos aparecem para aquele usuário.
- As ações são validadas no servidor, não só escondidas na tela.

### Mapa de entregas

Leaflet + OpenStreetMap, gratuito e sem chave de API. É essa base que mostra o GPS do entregador, o trajeto, a saída e o destino no acompanhamento do cliente.

### Hospedagem e distribuição

- **Hospedagem atual:** ambiente do Muse.
- **Demonstração pública:** acessível por link compartilhável.
- **Código da demonstração no GitHub:** repositório `SRARAUJO1/lume`, com o arquivo `lume.html`.
- **Versão independente:** reconstrução em andamento para o GitHub, com backend de verdade em Node + Express + SQLite, para rodar fora do ambiente do Muse.

## Todas as telas

### 1. Visão geral

Resumo do turno e atalhos para as áreas do app. É uma das telas com o efeito GridBeam percorrendo as divisórias do grid.

### 2. Cardápio

Grade de itens com foto, preço e disponibilidade, com busca e filtros por categoria: Lanches, Porções, Pratos, Bebidas e Sobremesas.

O diálogo "Novo item" pede nome, preço, categoria, disponibilidade e foto. A foto aceita PNG, JPG e WebP, com pré-visualização antes de salvar.

### 3. Pedidos e cozinha

Fila de pedidos com filtros clicáveis: Todos, Salão, Balcão e Online.

- O lançamento é manual — nada entra sozinho na fila. Quem lança marca a origem: Mesa, Caixa, Delivery, iFood ou 99.
- Um pedido pode ter vários itens, cada um com sua quantidade.
- Cada item pode ter observações próprias, e o pedido pode ter uma observação geral. As observações aparecem na fila da cozinha.
- O código do pedido é único, para não confundir um pedido com outro.

### 4. Mesas

Salão com 100 mesas numeradas — só o número no cartão, sem lugares.

- Quando o salão está vazio, aparece o botão "Criar as 100 mesas".
- A partir de uma mesa aberta, a equipe lança os itens do pedido.
- A transferência de mesa exige a seleção obrigatória de uma mesa de destino livre.
- A mesa só é liberada quando o último pedido ativo dela é entregue.

### 5. PDV e Caixa

- Abertura e fechamento de caixa. Tentar fechar um caixa já fechado mostra um aviso.
- Registro de pagamentos e divisão de conta.
- Calculadora de taxas configurável para crédito e débito, mostrando valor bruto, taxa e valor líquido.
- Um pagamento acima do valor restante da conta é recusado, com aviso de quanto ainda falta.

### 6. Estoque

Lista de insumos com quantidade mínima configurável por item.

- Quando um insumo atinge a quantidade mínima ou fica abaixo dela, aparece um popup de alerta — inclusive quando a baixa é automática, feita por uma venda.
- Os itens em alerta ficam com destaque visual na lista.

### 7. Entregas

Fluxo da entrega própria: em preparo → pronto → em rota → entregue.

- O restaurante atribui um entregador à entrega.
- O entregador só inicia a rota depois que o restaurante marca a entrega como pronta.
- Durante a rota, o GPS do entregador alimenta o acompanhamento.
- O cliente acompanha no mapa, com trajeto, ponto de saída e destino.
- Na demonstração pública, esse rastreio é simulado.

### 8. Relatórios

- Curva de vendas ao longo do tempo, com filtros por dia, semana, mês e período personalizado.
- Curva de vendas por produto.
- Ranking dos produtos mais vendidos no período, por quantidade ou por receita.

### 9. Acessos

Gestão de funcionários e de perfis, com permissões granulares por módulo. É aqui que o dono define quem acessa cada área do sistema.

### 10. Integrações

iFood e 99 aparecem como origens de pedido e como integração do app. Na demonstração, essa integração é demonstrativa. A integração real exige as credenciais oficiais do restaurante.

### 11. Área do cliente

Área de acesso exclusivo do cliente, separada do sistema da equipe.

- Abre sem login.
- Não mostra nem permite acessar nada do sistema da equipe.
- Funciona como destino de QR Code: o link aceita `?mesa=N` para identificar a mesa.
- Com a mesa identificada, o pedido é vinculado a ela. Sem mesa identificada, o pedido segue como delivery, com endereço.
- O cliente vê o cardápio, monta o pedido e acompanha o andamento por etapas, usando o código do pedido.

## Fluxos principais

### Pedido de mesa

1. Abrir a mesa no salão.
2. Lançar os itens manualmente, com quantidades e observações.
3. A cozinha recebe o pedido na fila, com as observações visíveis.
4. Entregar o pedido.
5. A mesa só libera quando o último pedido ativo é entregue.
6. Fechar a conta no caixa.

### Delivery próprio

1. O pedido entra e fica em preparo.
2. O restaurante marca como pronto.
3. Um entregador é atribuído.
4. O entregador sai em rota, com GPS ativo.
5. O cliente acompanha por link ou código, no mapa.
6. A entrega é concluída como entregue.

### Estoque mínimo

1. Uma venda ou baixa reduz a quantidade do insumo.
2. O insumo atinge a quantidade mínima configurada, ou fica abaixo dela.
3. Um popup de alerta aparece e o item ganha destaque na lista de estoque.
