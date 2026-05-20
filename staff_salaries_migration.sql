-- Staff Salaries / Payroll Tracking Migration
-- Track short-term or long-term owed wages to staff or casual labor

CREATE TABLE IF NOT EXISTS staff_salaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL, 
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE staff_salaries ENABLE ROW LEVEL SECURITY;

-- Apply Shop Access RLS Policy
CREATE POLICY "Shop access" ON staff_salaries FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));
