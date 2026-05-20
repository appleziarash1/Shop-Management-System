-- Customer Credit / Debt Tracking Schema

-- 1. Customer Credit table
CREATE TABLE IF NOT EXISTS customer_credit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount_owed NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    due_date DATE,
    is_settled BOOLEAN DEFAULT false,
    settled_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    destination TEXT NOT NULL,
    driver_name TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Dispatched', 'Delivered', 'Cancelled')),
    notes TEXT,
    delivery_date DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE customer_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Shop access" ON customer_credit;
CREATE POLICY "Shop access" ON customer_credit FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

DROP POLICY IF EXISTS "Shop access" ON deliveries;
CREATE POLICY "Shop access" ON deliveries FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));
