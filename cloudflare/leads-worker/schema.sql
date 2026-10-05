-- Заявки с лендинга репетитора
-- Cloudflare Dashboard → D1 → Create database → SQL → вставить сюда → Execute

CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  grade       TEXT,
  goal        TEXT,
  page        TEXT,
  ip          TEXT,
  user_agent  TEXT,
  status      TEXT    NOT NULL DEFAULT 'new'
);

-- Лимит от спама считает заявки за последние N минут по этому индексу
CREATE INDEX IF NOT EXISTS idx_leads_ip      ON leads(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Пометка «обработано» после того, как вы перезвонили:
--   UPDATE leads SET status = 'done' WHERE id = 42;
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
