-- Service Integration Schema

-- 1. Services Table
CREATE TABLE IF NOT EXISTS services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    duration INTEGER, -- in minutes
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Modify Sale Items to support Services
-- We add service_id and staff_id (to track who performed the service)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='service_id') THEN
        ALTER TABLE sale_items ADD COLUMN service_id UUID REFERENCES services(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='staff_id') THEN
        ALTER TABLE sale_items ADD COLUMN staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Enable RLS on Services
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy for Services
DROP POLICY IF EXISTS "Shop access" ON services;
CREATE POLICY "Shop access" ON services FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- 5. Helpful view for Service Performance
CREATE OR REPLACE VIEW service_performance AS
SELECT 
    s.name AS service_name,
    sh.name AS shop_name,
    p.full_name AS staff_name,
    si.unit_price,
    sl.created_at
FROM sale_items si
JOIN services s ON si.service_id = s.id
JOIN sales sl ON si.sale_id = sl.id
JOIN shops sh ON sl.shop_id = sh.id
LEFT JOIN profiles p ON si.staff_id = p.id;
