# 🏍 MotoGest — Backend API

Sistema completo de gestão para loja de moto peças.  
Node.js + Express + PostgreSQL + JWT.

---

## 📁 Estrutura do Projeto

```
motogest-backend/
├── config/
│   └── database.js          # Pool PostgreSQL + helpers de transação
├── middleware/
│   ├── auth.js              # JWT authenticate + authorize por cargo
│   └── errorHandler.js      # Handler global de erros + audit log
├── routes/
│   ├── auth.js              # Login, refresh token, troca de senha
│   ├── products.js          # CRUD produtos + ajuste de estoque
│   ├── sales.js             # PDV: criar venda, cancelar, relatório
│   ├── customers.js         # Clientes + gestão de fiado
│   ├── financial.js         # Lançamentos financeiros + fluxo de caixa
│   ├── reports.js           # Exportar PDF e Excel
│   └── users.js             # Usuários do sistema (admin only)
├── public/
│   ├── sw.js                # Service Worker (PWA + offline)
│   └── manifest.json        # PWA manifest
├── sql/
│   └── schema.sql           # Schema completo do banco + triggers
├── server.js                # Ponto de entrada
├── package.json
└── .env.example
```

---

## ⚡ Instalação Rápida

### 1. Pré-requisitos
- Node.js 18+
- PostgreSQL 14+

### 2. Clonar e instalar dependências

```bash
git clone https://github.com/seu-usuario/motogest-backend.git
cd motogest-backend
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas credenciais do banco
```

### 4. Criar o banco e aplicar o schema

```bash
# Criar o banco
createdb motogest

# Aplicar schema (cria tabelas, triggers e dados de exemplo)
psql -d motogest -f sql/schema.sql
```

### 5. Iniciar o servidor

```bash
# Desenvolvimento (com auto-reload)
npm run dev

# Produção
npm start
```

O servidor sobe em `http://localhost:3001`.  
Health check: `GET /health`

---

## 🔑 Autenticação

Todas as rotas (exceto `/api/auth/login`) exigem header:

```
Authorization: Bearer <token>
```

**Login padrão** (criado automaticamente pelo schema):
- E-mail: `admin@motogest.com`
- Senha:  `admin123`

### Níveis de acesso

| Cargo     | Permissões |
|-----------|-----------|
| `admin`   | Tudo |
| `gerente` | Criar/editar produtos, clientes, vendas, relatórios |
| `caixa`   | Somente PDV (criar vendas) e consultas |

---

## 📡 Endpoints

### Auth
| Método | Rota                        | Descrição |
|--------|-----------------------------|-----------|
| POST   | `/api/auth/login`           | Login → retorna accessToken + refreshToken |
| POST   | `/api/auth/refresh`         | Renovar token |
| GET    | `/api/auth/me`              | Dados do usuário logado |
| PUT    | `/api/auth/change-password` | Trocar senha |

### Produtos
| Método | Rota                        | Descrição |
|--------|-----------------------------|-----------|
| GET    | `/api/products`             | Listar com busca/filtro/paginação |
| GET    | `/api/products/low-stock`   | Produtos com estoque abaixo do mínimo |
| GET    | `/api/products/categories`  | Lista de categorias |
| GET    | `/api/products/:id`         | Detalhes do produto |
| POST   | `/api/products`             | Criar produto |
| PUT    | `/api/products/:id`         | Editar produto |
| PUT    | `/api/products/:id/stock`   | Ajuste manual de estoque |
| DELETE | `/api/products/:id`         | Remover produto (soft delete) |

### Vendas / PDV
| Método | Rota                    | Descrição |
|--------|-------------------------|-----------|
| POST   | `/api/sales`            | Criar venda (PDV) |
| GET    | `/api/sales`            | Histórico de vendas |
| GET    | `/api/sales/summary`    | Totais hoje/mês/ano |
| GET    | `/api/sales/daily`      | Vendas por dia (gráfico) |
| GET    | `/api/sales/:id`        | Detalhes da venda + itens |
| POST   | `/api/sales/:id/cancel` | Cancelar venda (reverte estoque) |

### Clientes
| Método | Rota                       | Descrição |
|--------|----------------------------|-----------|
| GET    | `/api/customers`           | Listar clientes |
| GET    | `/api/customers/:id`       | Detalhes + histórico de compras |
| POST   | `/api/customers`           | Criar cliente |
| PUT    | `/api/customers/:id`       | Editar cliente |
| POST   | `/api/customers/:id/debt`  | Adicionar débito ou registrar pagamento |
| DELETE | `/api/customers/:id`       | Remover cliente |

### Financeiro
| Método | Rota                       | Descrição |
|--------|----------------------------|-----------|
| GET    | `/api/financial`           | Lançamentos com filtro |
| GET    | `/api/financial/summary`   | Totais por período |
| GET    | `/api/financial/cashflow`  | Fluxo de caixa diário (gráfico) |
| POST   | `/api/financial`           | Lançamento manual |
| DELETE | `/api/financial/:id`       | Remover lançamento |

### Relatórios (PDF e Excel)
| Método | Rota                       | Descrição |
|--------|----------------------------|-----------|
| GET    | `/api/reports/sales/pdf`   | Relatório de vendas em PDF |
| GET    | `/api/reports/sales/excel` | Relatório de vendas em Excel |
| GET    | `/api/reports/products/pdf`| Produtos mais vendidos em PDF |
| GET    | `/api/reports/stock/pdf`   | Estoque em PDF |
| GET    | `/api/reports/stock/excel` | Estoque em Excel |
| GET    | `/api/reports/debts/pdf`   | Fiado/inadimplência em PDF |

### Usuários (admin)
| Método | Rota                              | Descrição |
|--------|-----------------------------------|-----------|
| GET    | `/api/users`                      | Listar usuários |
| GET    | `/api/users/:id/audit`            | Histórico de ações |
| POST   | `/api/users`                      | Criar usuário |
| PUT    | `/api/users/:id`                  | Editar usuário |
| PUT    | `/api/users/:id/reset-password`   | Resetar senha |

---

## 🛡️ Segurança implementada

- **bcrypt** com 12 rounds para senhas
- **JWT** com expiração configurável (padrão 8h)
- **Refresh token** separado (7 dias)
- **Rate limiting** global + específico no login (10 req/15min)
- **Helmet** para headers de segurança HTTP
- **CORS** com whitelist de origens
- **Soft delete** em produtos e clientes (dados nunca apagados)
- **Audit log** de todas as ações sensíveis
- **Transações atômicas** no PDV (sem inconsistência de estoque)
- **FOR UPDATE** lock no PostgreSQL para evitar race conditions

---

## 🔄 Triggers automáticos no banco

| Trigger | O que faz |
|---------|-----------|
| `trg_sale_item_stock` | Baixa o estoque ao inserir item na venda |
| `trg_sale_financial`  | Cria lançamento financeiro ao concluir venda |
| `trg_sale_financial`  | Atualiza dívida do cliente em vendas no fiado |
| `trg_*_updated`       | Atualiza `updated_at` automaticamente |

---

## 🚀 Deploy em produção

### Railway (recomendado para começar)
```bash
railway login
railway init
railway add postgresql
railway up
```

### VPS com PM2
```bash
npm install -g pm2
pm2 start server.js --name motogest-api
pm2 save
pm2 startup
```

### Variáveis obrigatórias em produção
```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<string aleatória de 64+ chars>
CORS_ORIGINS=https://seu-dominio.com.br
```

---

## 📱 PWA / Offline

O arquivo `public/sw.js` implementa:
- Cache de assets estáticos (cache-first)
- Cache de API para leitura offline (network-first com fallback)
- Fila de sincronização para mutações feitas offline
- Background Sync quando a conexão retorna
- Push Notifications para alertas de estoque

Para registrar o SW no frontend Next.js, adicione em `_app.js`:

```javascript
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```
