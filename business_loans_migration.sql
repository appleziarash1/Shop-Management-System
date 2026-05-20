-- Business Loans Migration
-- Track loans obtained from firms, banks, or individuals

CREATE TABLE IF NOT EXISTS business_loans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    lender_name TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) DEFAULT 0, -- Percentage
    obtained_date DATE NOT NULL,
    due_date DATE NOT NULL,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE business_loans ENABLE ROW LEVEL SECURITY;

-- Apply Shop Access RLS Policy
CREATE POLICY "Shop access" ON business_loans FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));
