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

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop access" ON deliveries;
CREATE POLICY "Shop access" ON deliveries
FOR ALL
USING (shop_id IN (SELECT get_user_shop_access()));
