# Lume — gestão para restaurantes e lanchonetes

App de gestão para restaurantes e lanchonetes de pequeno porte, com backend
de verdade. Projeto independente (não depende do Muse para rodar).

## O que já funciona

- **Cardápio**: itens com nome, preço, categoria (Lanches, Porções, Pratos,
  Bebidas, Sobremesas), foto (upload vira imagem embutida) e disponibilidade.
- **Pedidos manuais**: origem Mesa, Caixa, Delivery, iFood ou 99; vários itens
  com quantidade; observações por item e geral; fila da cozinha com avanço de
  status (novo → em preparo → pronto → em rota → entregue).
- **Salão**: 100 mesas numeradas (só número, sem lugares); abrir mesa, lançar
  itens, transferir mesa escolhendo uma mesa livre de destino, fechar conta.
- **PDV & Caixa**: abertura/fechamento de caixa, pagamentos (dinheiro, débito,
  crédito, Pix), divisão de conta e calculadora de taxa de maquininha
  (crédito/débito configuráveis: bruto, taxa e líquido).
- **Estoque**: insumos com quantidade mínima configurável, alerta de estoque
  baixo (popup ao entrar) e baixa automática ao entregar o pedido (vincule
  insumos aos itens do cardápio na tela de Estoque).
- **Entregas**: fluxo em preparo → pronto → em rota → entregue, atribuição de
  entregador, compartilhamento de GPS pelo entregador e rastreio do cliente
  no mapa (Leaflet + OpenStreetMap).
- **Relatórios**: curva de vendas ao longo do tempo com filtro de período,
  curva por produto e ranking dos mais vendidos.
- **Permissões**: login por usuário/senha; perfis dono, gerente, caixa,
  cozinha, entregador e atendente — cada um vê só os módulos permitidos, e o
  servidor bloqueia as operações sensíveis por perfil. O dono gerencia
  usuários na aba Acessos.
- **Área do cliente separada**: abre sem login e mostra só cardápio,
  montagem de pedido e acompanhamento. Link aceita `?mesa=N` para vincular a
  mesa (destino de QR Code); sem mesa, o pedido segue como delivery com
  endereço. A área da equipe nunca aparece nesse acesso.
- **Notificações**: botão modo com som / sem som; ao chegar pedido novo, toca
  a voz "Lume! Novo pedido recebido!" (arquivo `public/notification.mp3`
  quando presente, com fallback para voz sintetizada do navegador — o MP3
  não vai para o Git, pois o push aceita só texto; gere-o de novo ou use a
  voz sintetizada).

## Como rodar

Pré-requisito: Node.js 22 ou superior.

```bash
npm install
npm start
```

Abra http://localhost:3000 (ou a porta da variável `PORT`).

Na primeira execução o banco é criado em `data/lume.db` e populado com:

- 100 mesas numeradas
- Cardápio e estoque de exemplo
- Usuários (troque as senhas no primeiro uso):

| Usuário    | Senha         | Perfil     |
| ---------- | ------------- | ---------- |
| dono       | lume123       | dono       |
| gerente    | gerente123    | gerente    |
| caixa      | caixa123      | caixa      |
| cozinha    | cozinha123    | cozinha    |
| entregador | entregador123 | entregador |
| atendente  | atendente123  | atendente  |

## Arquitetura

- `server.js` — API REST (Express) + SQLite (`node:sqlite`, sem dependências
  nativas). Serve o frontend em `public/`.
- `public/index.html`, `public/style.css`, `public/app.js` — interface web
  (equipe + área do cliente), sem build.
- `public/notification.mp3` — voz da notificação de novo pedido.
- `data/lume.db` — banco de dados em arquivo (criado na primeira execução,
  ignorado pelo Git).

Principais endpoints: `POST /api/login`, `GET /api/menu`, `POST /api/orders`,
`GET /api/tables`, `POST /api/tables/:n/transfer`, `POST /api/cash/open|close`,
`POST /api/payments`, `POST /api/calc-fee`, `GET /api/stock`,
`POST /api/deliveries`, `GET /api/reports/sales`, `GET /api/public/menu`,
`POST /api/public/orders`, `GET /api/public/tracking/:code`.

## Observações honestas

- As origens iFood e 99 são **lançamento manual** de pedidos (o operador
  registra o pedido que chegou por esses canais). A integração automática com
  as APIs oficiais exige credenciais do restaurante e não está incluída.
- O mapa de rastreio usa OpenStreetMap via CDN; sem internet, o mapa não
  carrega (o status da entrega continua visível).
- A demonstração estática `lume.html` (arquivo separado neste repositório)
  é a vitrine antiga do projeto e não usa este backend.
