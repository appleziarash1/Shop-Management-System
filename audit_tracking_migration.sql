-- ============================================================
-- AUDIT TRACKING MIGRATION
-- Run this once in the Supabase SQL Editor.
-- Adds: employee_sessions, audit_logs tables
-- Extends: sales table with session_id + employee_name
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. EMPLOYEE SESSIONS TABLE
--    Tracks every login/logout event per employee per shop.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_sessions (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id          UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
    employee_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    employee_name    TEXT NOT NULL,
    employee_role    TEXT NOT NULL DEFAULT 'Cashier',
    login_time       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    logout_time      TIMESTAMP WITH TIME ZONE,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed'))
);

-- ─────────────────────────────────────────────────────────────
-- 2. AUDIT LOGS TABLE
--    Unified event log — every meaningful action is recorded.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id          UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
    action_type      TEXT NOT NULL CHECK (action_type IN (
                         'LOGIN', 'LOGOUT', 'SALE', 'PURCHASE',
                         'EXPENSE', 'ADJUSTMENT', 'STOCK_ADD', 'OTHER'
                     )),
    employee_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    employee_name    TEXT NOT NULL,
    employee_role    TEXT,
    session_id       UUID REFERENCES employee_sessions(id) ON DELETE SET NULL,
    description      TEXT NOT NULL,
    metadata         JSONB,          -- flexible: sale_id, product_name, amount, etc.
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- 3. EXTEND SALES TABLE
--    Link every sale to the session that created it.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS session_id    UUID REFERENCES employee_sessions(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS employee_name TEXT;

-- ─────────────────────────────────────────────────────────────
-- 4. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employee_sessions_shop_id       ON employee_sessions(shop_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee_id   ON employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_status        ON employee_sessions(status);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_login_time    ON employee_sessions(login_time DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_id              ON audit_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_employee_id          ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id           ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type          ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at           ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_session_id                ON sales(session_id);

-- ─────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employee_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

-- employee_sessions: staff see own shop; owners see all their shops
DROP POLICY IF EXISTS "Sessions shop access" ON employee_sessions;
CREATE POLICY "Sessions shop access" ON employee_sessions
    FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- audit_logs: any shop member can INSERT (system writes), only management can read
DROP POLICY IF EXISTS "Audit logs read access"   ON audit_logs;
DROP POLICY IF EXISTS "Audit logs insert access" ON audit_logs;

CREATE POLICY "Audit logs read access" ON audit_logs
    FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));

CREATE POLICY "Audit logs insert access" ON audit_logs
    FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()));

-- ─────────────────────────────────────────────────────────────
-- 6. AUTO-CLOSE ORPHAN SESSIONS (optional helper function)
--    Call this if you want to close sessions older than 16 hours.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
    rows_closed INTEGER;
BEGIN
    UPDATE employee_sessions
    SET    status      = 'closed',
           logout_time = timezone('utc'::text, now())
    WHERE  status      = 'active'
      AND  login_time  < timezone('utc'::text, now()) - INTERVAL '16 hours';

    GET DIAGNOSTICS rows_closed = ROW_COUNT;
    RETURN rows_closed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- End of audit_tracking_migration.sql
