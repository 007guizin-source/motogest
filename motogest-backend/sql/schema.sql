-- ============================================================
-- MotoGest — Schema PostgreSQL Completo
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- busca por similaridade

-- ============================================================
-- USUÁRIOS DO SISTEMA
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(180) UNIQUE NOT NULL,
  password    TEXT NOT NULL,                        -- bcrypt hash
  role        VARCHAR(30) NOT NULL DEFAULT 'caixa', -- admin | gerente | caixa
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- CATEGORIAS
-- ============================================================
CREATE TABLE categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(80) UNIQUE NOT NULL
);

INSERT INTO categories (name) VALUES
  ('Filtros'),('Transmissão'),('Motor'),('Suspensão'),
  ('Pneus'),('Elétrica'),('Freios'),('Lubrificantes'),
  ('Funilaria'),('Acessórios');

-- ============================================================
-- PRODUTOS
-- ============================================================
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku           VARCHAR(40) UNIQUE NOT NULL,
  barcode       VARCHAR(60) UNIQUE,
  name          VARCHAR(200) NOT NULL,
  category_id   INTEGER REFERENCES categories(id),
  brand         VARCHAR(80),
  model         VARCHAR(120),
  price_buy     NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_sell    NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  stock_min     INTEGER NOT NULL DEFAULT 5,
  location      VARCHAR(30),
  photo_url     TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_sku      ON products(sku);
CREATE INDEX idx_products_barcode  ON products(barcode);
CREATE INDEX idx_products_name     ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_category ON products(category_id);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(150) NOT NULL,
  document      VARCHAR(20),                  -- CPF ou CNPJ
  phone         VARCHAR(20),
  email         VARCHAR(180),
  address       TEXT,
  city          VARCHAR(80),
  state         VARCHAR(2),
  credit_limit  NUMERIC(10,2) NOT NULL DEFAULT 0,
  debt          NUMERIC(10,2) NOT NULL DEFAULT 0, -- saldo devedor atual
  active        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name     ON customers USING gin(name gin_trgm_ops);
CREATE INDEX idx_customers_document ON customers(document);

-- ============================================================
-- VENDAS (cabeçalho)
-- ============================================================
CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number          SERIAL UNIQUE,             -- número legível da venda
  customer_id     UUID REFERENCES customers(id),
  user_id         UUID REFERENCES users(id),
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amt    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method  VARCHAR(30) NOT NULL,      -- dinheiro|pix|debito|credito|fiado
  installments    INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed|cancelled
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_customer  ON sales(customer_id);
CREATE INDEX idx_sales_user      ON sales(user_id);
CREATE INDEX idx_sales_created   ON sales(created_at);
CREATE INDEX idx_sales_status    ON sales(status);

-- ============================================================
-- ITENS DA VENDA
-- ============================================================
CREATE TABLE sale_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL DEFAULT 1,
  price_unit  NUMERIC(10,2) NOT NULL,       -- preço no momento da venda
  price_buy   NUMERIC(10,2) NOT NULL,       -- custo no momento (para lucro)
  subtotal    NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- ============================================================
-- MOVIMENTAÇÕES DE ESTOQUE
-- ============================================================
CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id),
  user_id     UUID REFERENCES users(id),
  type        VARCHAR(20) NOT NULL,  -- entrada|saida|ajuste|devolucao
  qty         INTEGER NOT NULL,
  reason      VARCHAR(200),
  ref_id      UUID,                  -- referência (sale_id, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_product ON stock_movements(product_id);
CREATE INDEX idx_stock_created ON stock_movements(created_at);

-- ============================================================
-- TRANSAÇÕES FINANCEIRAS
-- ============================================================
CREATE TABLE financial_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        VARCHAR(10) NOT NULL,       -- entrada|saida
  description VARCHAR(200) NOT NULL,
  value       NUMERIC(10,2) NOT NULL,
  category    VARCHAR(60),               -- Vendas|Compras|Despesas|Recebimentos
  ref_id      UUID,                      -- sale_id se origem for venda
  user_id     UUID REFERENCES users(id),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fin_date ON financial_transactions(date);
CREATE INDEX idx_fin_type ON financial_transactions(type);

-- ============================================================
-- REGISTROS DE DÍVIDA / FIADO
-- ============================================================
CREATE TABLE debt_records (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES customers(id),
  type         VARCHAR(15) NOT NULL, -- debito|pagamento
  value        NUMERIC(10,2) NOT NULL,
  description  VARCHAR(200),
  sale_id      UUID REFERENCES sales(id),
  user_id      UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debt_customer ON debt_records(customer_id);

-- ============================================================
-- LOG DE AUDITORIA
-- ============================================================
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(80) NOT NULL,     -- login|create_sale|edit_product|...
  entity      VARCHAR(40),             -- products|sales|customers|...
  entity_id   UUID,
  details     JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_action  ON audit_log(action);

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated  BEFORE UPDATE ON products  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FUNÇÃO: baixar estoque ao criar sale_item
-- ============================================================
CREATE OR REPLACE FUNCTION decrease_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET stock = stock - NEW.qty WHERE id = NEW.product_id;
  INSERT INTO stock_movements (product_id, type, qty, reason, ref_id)
    VALUES (NEW.product_id, 'saida', NEW.qty, 'Venda', NEW.sale_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_item_stock
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION decrease_stock_on_sale();

-- ============================================================
-- FUNÇÃO: lançamento financeiro automático ao concluir venda
-- ============================================================
CREATE OR REPLACE FUNCTION create_financial_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO financial_transactions (type, description, value, category, ref_id, user_id)
      VALUES ('entrada', 'Venda #' || NEW.number, NEW.total, 'Vendas', NEW.id, NEW.user_id);

    -- se for fiado, atualiza dívida do cliente
    IF NEW.payment_method = 'fiado' AND NEW.customer_id IS NOT NULL THEN
      UPDATE customers SET debt = debt + NEW.total WHERE id = NEW.customer_id;
      INSERT INTO debt_records (customer_id, type, value, description, sale_id, user_id)
        VALUES (NEW.customer_id, 'debito', NEW.total, 'Compra fiado - Venda #' || NEW.number, NEW.id, NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_financial
  AFTER INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION create_financial_on_sale();

-- ============================================================
-- USUÁRIO ADMIN PADRÃO (senha: admin123)
-- ============================================================
INSERT INTO users (name, email, password, role) VALUES
  ('Administrador', 'admin@motogest.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewf2yDzoPv8Bg9Xm',
   'admin');

-- ============================================================
-- DADOS DE EXEMPLO
-- ============================================================
INSERT INTO products (sku, barcode, name, category_id, brand, model, price_buy, price_sell, stock, stock_min, location) VALUES
  ('FLT001','7891234560001','Filtro de Óleo Honda CG 150',1,'Fram','CG 150',12.90,28.00,45,10,'A-01'),
  ('COR001','7891234560002','Corrente 428H x 118 Elos',2,'DID','Universal',45.00,89.90,8,5,'B-03'),
  ('VEL001','7891234560003','Vela Ignição Iridium NGK',3,'NGK','CG/Titan/Fan',18.50,38.90,32,15,'A-04'),
  ('RET001','7891234560004','Retentor de Bengala 31mm',4,'Vedaço','Universal',8.00,19.90,3,8,'C-02'),
  ('PNE001','7891234560005','Pneu Dianteiro 2.75-18 Pirelli',5,'Pirelli','CG 125/150',85.00,159.90,12,4,'D-01'),
  ('PNE002','7891234560006','Pneu Traseiro 90/90-18 Pirelli',5,'Pirelli','CG 125/150',110.00,199.90,10,4,'D-02'),
  ('BAT001','7891234560007','Bateria Moura 5Ah YTX5L',6,'Moura','Universal',89.00,159.90,6,3,'E-01'),
  ('EMB001','7891234560008','Kit Embreagem Completo CG 150',3,'Cofap','CG 150',42.00,89.90,14,5,'B-01'),
  ('FRE001','7891234560009','Pastilha de Freio Dianteira',7,'Cobreq','Universal',15.00,35.90,2,6,'C-01'),
  ('OLE001','7891234560010','Óleo Motor 10W30 1L Motul',8,'Motul','Universal',28.00,54.90,28,10,'F-01');

INSERT INTO customers (name, document, phone, city, credit_limit) VALUES
  ('João Silva','123.456.789-00','(53) 99123-4567','Jaguarão',500),
  ('Maria Oliveira','987.654.321-00','(53) 98765-4321','Jaguarão',300),
  ('Carlos Mecânica','456.789.123-00','(53) 99234-5678','Jaguarão',1000),
  ('Pedro Santos','321.654.987-00','(53) 99345-6789','Herval',200),
  ('Ana Lima','654.321.789-00','(53) 99456-7890','Bagé',400);
