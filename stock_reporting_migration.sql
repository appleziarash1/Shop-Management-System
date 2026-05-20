ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_stock INTEGER DEFAULT 0;
UPDATE products SET opening_stock = quantity WHERE opening_stock IS NULL OR opening_stock = 0;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tpin TEXT;

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS selling_price NUMERIC(15, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('adjustment_increase', 'adjustment_decrease', 'damage')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stock adjustments read access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments insert access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments update access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments delete access" ON stock_adjustments;

CREATE POLICY "Stock adjustments read access" ON stock_adjustments FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Stock adjustments insert access" ON stock_adjustments FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Stock adjustments update access" ON stock_adjustments FOR UPDATE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id)) WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Stock adjustments delete access" ON stock_adjustments FOR DELETE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
