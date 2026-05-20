-- Multi-Shop Management System - Database Schema
-- Last Updated: 2026-03-22

-- 1. Profiles (User-Role-Shop Mapping)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('Owner', 'Admin', 'Manager', 'Cashier')),
    shop_id UUID,
    avatar_url TEXT,
    theme_preference TEXT DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark')),
    country_residence TEXT DEFAULT 'Malawi',
    currency_preference TEXT DEFAULT 'MWK' CHECK (currency_preference IN ('MWK', 'ZMW', 'TZS', 'KES', 'ZAR', 'NGN', 'USD', 'GBP')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Shops
CREATE TABLE IF NOT EXISTS shops (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    contact_info TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    district TEXT,
    registration_number TEXT,
    tpin TEXT,
    vat_registered BOOLEAN DEFAULT FALSE,
    vat_number TEXT,
    opening_time TIME DEFAULT '08:00',
    closing_time TIME DEFAULT '18:00',
    is_manually_closed BOOLEAN DEFAULT FALSE,
    manually_closed_at TIMESTAMP WITH TIME ZONE,
    manually_closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Products
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    barcode TEXT,
    category TEXT,
    opening_stock INTEGER DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 5,
    cost_price NUMERIC(15, 2) DEFAULT 0,
    selling_price NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    loyalty_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    registration_number TEXT,
    tpin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Sales
CREATE TABLE IF NOT EXISTS sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'Completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 7. Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    cost_price NUMERIC(15, 2) DEFAULT 0,
    total_price NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Purchases (Inventory Restock)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    cost_price NUMERIC(15, 2) NOT NULL,
    selling_price NUMERIC(15, 2) DEFAULT 0,
    p_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 9. Stock Adjustments & Damages
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

-- 10. Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 11. Low Stock Alerts
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

-- 11. Daily Closures
CREATE TABLE IF NOT EXISTS daily_closures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    closing_date DATE NOT NULL,
    total_sales NUMERIC(15, 2) DEFAULT 0,
    total_expenses NUMERIC(15, 2) DEFAULT 0,
    net_profit NUMERIC(15, 2) DEFAULT 0,
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(shop_id, closing_date)
);

CREATE TABLE IF NOT EXISTS expense_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_id UUID,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    before_data JSONB,
    after_data JSONB,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Owner', 'Admin', 'Manager', 'Cashier'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'light';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_residence TEXT DEFAULT 'Malawi';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency_preference TEXT DEFAULT 'MWK';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_preference_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_preference_check CHECK (theme_preference IN ('light', 'dark'));
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_currency_preference_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_currency_preference_check CHECK (currency_preference IN ('MWK', 'ZMW', 'TZS', 'KES', 'ZAR', 'NGN', 'USD', 'GBP'));

ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_time TIME DEFAULT '08:00';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS closing_time TIME DEFAULT '18:00';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_manually_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS manually_closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS manually_closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS tpin TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT FALSE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_stock INTEGER DEFAULT 0;
UPDATE products SET opening_stock = quantity WHERE opening_stock IS NULL OR opening_stock = 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tpin TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS selling_price NUMERIC(15, 2) DEFAULT 0;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 11. Security Helper Functions (To prevent recursion)
CREATE OR REPLACE FUNCTION get_my_shop_id() 
RETURNS UUID AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id FROM public.profiles WHERE id = auth.uid();
    RETURN v_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION check_is_shop_owner(s_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.shops 
        WHERE id = s_id AND owner_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION check_is_shop_member(s_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE shop_id = s_id AND id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. Modified Transaction Access Function
CREATE OR REPLACE FUNCTION get_user_shop_access() 
RETURNS SETOF UUID AS $$
    SELECT get_my_shop_id()
    UNION
    SELECT id FROM shops WHERE owner_id = auth.uid();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION can_manage_shop(target_shop UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN check_is_shop_owner(target_shop) OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND shop_id = target_shop
          AND role IN ('Owner', 'Admin', 'Manager')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION prevent_closed_day_expense_changes()
RETURNS TRIGGER AS $$
DECLARE
    target_shop UUID;
    target_date DATE;
BEGIN
    target_shop := COALESCE(NEW.shop_id, OLD.shop_id);
    target_date := COALESCE(NEW.expense_date, OLD.expense_date);

    IF EXISTS (
        SELECT 1
        FROM daily_closures
        WHERE shop_id = target_shop
          AND closing_date = target_date
    ) THEN
        RAISE EXCEPTION 'Cannot modify expenses for closed day %.', target_date;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        NEW.updated_at := timezone('utc'::text, now());
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION audit_expense_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO expense_audit_logs (expense_id, shop_id, action, before_data, after_data, changed_by)
        VALUES (NEW.id, NEW.shop_id, TG_OP, NULL, to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO expense_audit_logs (expense_id, shop_id, action, before_data, after_data, changed_by)
        VALUES (NEW.id, NEW.shop_id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
        RETURN NEW;
    END IF;

    INSERT INTO expense_audit_logs (expense_id, shop_id, action, before_data, after_data, changed_by)
    VALUES (OLD.id, OLD.shop_id, TG_OP, to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS POLICIES

-- Shops: Owners see all their shops, Staff see assigned shop
DROP POLICY IF EXISTS "Shops access policy" ON shops;
CREATE POLICY "Shops access policy" ON shops FOR ALL USING (
    owner_id = auth.uid() OR 
    check_is_shop_member(id)
);

-- Profiles: Users see own, Owners see staff
DROP POLICY IF EXISTS "Profile view policy" ON profiles;
CREATE POLICY "Profile view policy" ON profiles FOR SELECT USING (
    auth.uid() = id OR 
    check_is_shop_owner(shop_id)
);

-- Allow profile creation during sign up
DROP POLICY IF EXISTS "Profile insert policy" ON profiles;
CREATE POLICY "Profile insert policy" ON profiles FOR INSERT WITH CHECK (
    auth.uid() = id
);

-- Allow profile deletion by owners
DROP POLICY IF EXISTS "Profile delete policy" ON profiles;
CREATE POLICY "Profile delete policy" ON profiles FOR DELETE USING (
    check_is_shop_owner(shop_id)
);

DROP POLICY IF EXISTS "Profile update policy" ON profiles;
CREATE POLICY "Profile update policy" ON profiles FOR UPDATE USING (
    auth.uid() = id OR
    check_is_shop_owner(shop_id)
) WITH CHECK (
    auth.uid() = id OR
    check_is_shop_owner(shop_id)
);

-- Transaction Tables: Based on profile.shop_id or ownership
DROP POLICY IF EXISTS "Shop access" ON products;
CREATE POLICY "Shop access" ON products FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

DROP POLICY IF EXISTS "Shop access" ON customers;
CREATE POLICY "Shop access" ON customers FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

DROP POLICY IF EXISTS "Shop access" ON suppliers;
CREATE POLICY "Shop access" ON suppliers FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- Sales RLS: Anyone can view and insert, ONLY Owners can Update/Delete
DROP POLICY IF EXISTS "Shop access" ON sales;
DROP POLICY IF EXISTS "Shop access SELECT" ON sales;
DROP POLICY IF EXISTS "Shop access INSERT" ON sales;
DROP POLICY IF EXISTS "Shop access UPDATE" ON sales;
DROP POLICY IF EXISTS "Shop access DELETE" ON sales;

CREATE POLICY "Shop access SELECT" ON sales FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Shop access INSERT" ON sales FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Shop access UPDATE" ON sales FOR UPDATE USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));
CREATE POLICY "Shop access DELETE" ON sales FOR DELETE USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Shop access" ON purchases;
CREATE POLICY "Shop access" ON purchases FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

DROP POLICY IF EXISTS "Stock adjustments read access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments insert access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments update access" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments delete access" ON stock_adjustments;
CREATE POLICY "Stock adjustments read access" ON stock_adjustments FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Stock adjustments insert access" ON stock_adjustments FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Stock adjustments update access" ON stock_adjustments FOR UPDATE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id)) WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Stock adjustments delete access" ON stock_adjustments FOR DELETE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));

DROP POLICY IF EXISTS "Shop access" ON expenses;
DROP POLICY IF EXISTS "Expenses read access" ON expenses;
DROP POLICY IF EXISTS "Expenses insert access" ON expenses;
DROP POLICY IF EXISTS "Expenses update access" ON expenses;
DROP POLICY IF EXISTS "Expenses delete access" ON expenses;
CREATE POLICY "Expenses read access" ON expenses FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Expenses insert access" ON expenses FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Expenses update access" ON expenses FOR UPDATE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id)) WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Expenses delete access" ON expenses FOR DELETE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));

DROP POLICY IF EXISTS "Low stock alerts read access" ON low_stock_alerts;
DROP POLICY IF EXISTS "Low stock alerts insert access" ON low_stock_alerts;
DROP POLICY IF EXISTS "Low stock alerts update access" ON low_stock_alerts;
CREATE POLICY "Low stock alerts read access" ON low_stock_alerts FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Low stock alerts insert access" ON low_stock_alerts FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Low stock alerts update access" ON low_stock_alerts FOR UPDATE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id)) WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));

DROP POLICY IF EXISTS "Shop access" ON daily_closures;
DROP POLICY IF EXISTS "Daily closures read access" ON daily_closures;
DROP POLICY IF EXISTS "Daily closures insert access" ON daily_closures;
DROP POLICY IF EXISTS "Daily closures delete access" ON daily_closures;
CREATE POLICY "Daily closures read access" ON daily_closures FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
CREATE POLICY "Daily closures insert access" ON daily_closures FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Daily closures delete access" ON daily_closures FOR DELETE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));

DROP POLICY IF EXISTS "Expense audit read access" ON expense_audit_logs;
DROP POLICY IF EXISTS "Expense audit insert access" ON expense_audit_logs;
CREATE POLICY "Expense audit read access" ON expense_audit_logs FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
CREATE POLICY "Expense audit insert access" ON expense_audit_logs FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()));

DROP TRIGGER IF EXISTS expenses_prevent_closed_day_changes ON expenses;
CREATE TRIGGER expenses_prevent_closed_day_changes
BEFORE INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION prevent_closed_day_expense_changes();

DROP TRIGGER IF EXISTS expenses_audit_changes ON expenses;
CREATE TRIGGER expenses_audit_changes
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION audit_expense_changes();
-- End of Schema

-- 12. Business Loans
CREATE TABLE IF NOT EXISTS business_loans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    lender_name TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) DEFAULT 0,
    obtained_date DATE NOT NULL,
    due_date DATE NOT NULL,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE business_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop access" ON business_loans;
CREATE POLICY "Shop access" ON business_loans FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- 13. Staff Salaries
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

ALTER TABLE staff_salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop access" ON staff_salaries;
CREATE POLICY "Shop access" ON staff_salaries FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- 14. Customer Credit (Loans given to customers)
CREATE TABLE IF NOT EXISTS customer_credit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount_owed NUMERIC(15, 2) NOT NULL,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE customer_credit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop access" ON customer_credit;
CREATE POLICY "Shop access" ON customer_credit FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- 15. Inventory Audit Logs
CREATE TABLE IF NOT EXISTS inventory_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('SALE', 'PURCHASE', 'ADJUSTMENT', 'AUTO_DELETE')),
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE inventory_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop access" ON inventory_audit_logs;
CREATE POLICY "Shop access" ON inventory_audit_logs FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- 14. Inventory Management Functions
CREATE OR REPLACE FUNCTION decrement_inventory(row_id UUID, amount INTEGER, action_type TEXT DEFAULT 'SALE', notes TEXT DEFAULT NULL, user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    current_quantity INTEGER;
    new_quantity INTEGER;
    shop_id_val UUID;
BEGIN
    
    RAISE NOTICE 'decrement_inventory called with row_id: %, amount: %, action_type: %', row_id, amount, action_type;
    
    -- Get current quantity and shop_id
    SELECT quantity, shop_id INTO current_quantity, shop_id_val 
    FROM products 
    WHERE id = row_id;
    
    RAISE NOTICE 'Found product with quantity: %, shop_id: %', current_quantity, shop_id_val;
    
    -- If no product found, return -1
    IF current_quantity IS NULL THEN
        RAISE NOTICE 'Product not found, returning -1';
        RETURN -1;
    END IF;
    
    -- Calculate new quantity (don't go below 0)
    new_quantity := GREATEST(0, current_quantity - amount);
    
    RAISE NOTICE 'Calculated new_quantity: %', new_quantity;
    
    -- Log the inventory change (with error handling)
    BEGIN
        INSERT INTO inventory_audit_logs (shop_id, product_id, action, quantity_changed, previous_quantity, new_quantity, notes, created_by)
        VALUES (shop_id_val, row_id, action_type, -amount, current_quantity, new_quantity, notes, user_id);
        RAISE NOTICE 'Audit log inserted successfully';
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but continue with the inventory update
        RAISE WARNING 'Failed to log inventory change for product %: %', row_id, SQLERRM;
    END;
    
    -- Update or delete the product
    IF new_quantity = 0 THEN
        -- Delete the product when it reaches 0 quantity
        RAISE NOTICE 'Deleting product %', row_id;
        DELETE FROM products WHERE id = row_id;
        RETURN 0;
    ELSE
        -- Update the product quantity
        RAISE NOTICE 'Updating product % quantity to %', row_id, new_quantity;
        UPDATE products 
        SET quantity = new_quantity 
        WHERE id = row_id;
        RETURN new_quantity;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 15. Financial Sync for Loans and Credits
CREATE OR REPLACE FUNCTION handle_loan_financial_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- CUSTOMER CREDIT SCENARIOS
    IF (TG_TABLE_NAME = 'customer_credit') THEN
        -- When a new credit is recorded (Money/Goods leaving the shop)
        IF (TG_OP = 'INSERT') THEN
            INSERT INTO expenses (shop_id, category, amount, description, created_by)
            VALUES (NEW.shop_id, 'Customer Credit Given', NEW.amount_owed, 'Automated: Credit given to customer ID ' || UPPER(SUBSTRING(NEW.customer_id::text FROM 1 FOR 6)), NEW.created_by);
        
        -- When credit is marked as settled (Money coming back to the shop)
        ELSIF (TG_OP = 'UPDATE' AND OLD.is_settled = FALSE AND NEW.is_settled = TRUE) THEN
            INSERT INTO sales (shop_id, customer_id, total_amount, payment_method, created_by)
            VALUES (NEW.shop_id, NEW.customer_id, NEW.amount_owed, 'Credit Payment', NEW.created_by);
        END IF;

    -- BUSINESS LOAN SCENARIOS
    ELSIF (TG_TABLE_NAME = 'business_loans') THEN
        -- When a new loan is taken (Cash entering the shop)
        IF (TG_OP = 'INSERT') THEN
            INSERT INTO sales (shop_id, total_amount, payment_method, created_by)
            VALUES (NEW.shop_id, NEW.amount, 'Loan Received (' || NEW.lender_name || ')', NEW.created_by);
        
        -- When a loan is repaid/settled (Cash leaving the shop)
        ELSIF (TG_OP = 'UPDATE' AND OLD.is_settled = FALSE AND NEW.is_settled = TRUE) THEN
            INSERT INTO expenses (shop_id, category, amount, description, created_by)
            VALUES (NEW.shop_id, 'Loan Repayment', NEW.amount, 'Automated: Paid back loan to ' || NEW.lender_name, NEW.created_by);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach triggers
DROP TRIGGER IF EXISTS trg_customer_credit_finance ON customer_credit;
CREATE TRIGGER trg_customer_credit_finance
AFTER INSERT OR UPDATE ON customer_credit
FOR EACH ROW EXECUTE FUNCTION handle_loan_financial_sync();

DROP TRIGGER IF EXISTS trg_business_loan_finance ON business_loans;
CREATE TRIGGER trg_business_loan_finance
AFTER INSERT OR UPDATE ON business_loans
FOR EACH ROW EXECUTE FUNCTION handle_loan_financial_sync();

-- 16. Shop Messages (Staff-Owner Chat)
CREATE TABLE IF NOT EXISTS shop_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE shop_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop messages access" ON shop_messages;
CREATE POLICY "Shop messages access" ON shop_messages FOR ALL USING (shop_id IN (SELECT get_user_shop_access()));

-- Enable Realtime for shop_messages
ALTER PUBLICATION supabase_realtime ADD TABLE shop_messages;
