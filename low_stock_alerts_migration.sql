CREATE TABLE IF NOT EXISTS low_stock_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_phone TEXT NOT NULL,
    product_name TEXT NOT NULL,
    shop_name TEXT,
    quantity INTEGER NOT NULL,
    min_quantity INTEGER NOT NULL,
    channel TEXT DEFAULT 'whatsapp',
    status TEXT DEFAULT 'pending',
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE low_stock_alerts ENABLE ROW LEVEL SECURITY;
