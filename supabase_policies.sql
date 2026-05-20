-- Full CRUD RLS Policies for development

-- Products
DROP POLICY IF EXISTS "Users can view products in their shop" ON products;
CREATE POLICY "Allow all select for products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow all insert for products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update for products" ON products FOR UPDATE USING (true);
CREATE POLICY "Allow all delete for products" ON products FOR DELETE USING (true);

-- Shops
DROP POLICY IF EXISTS "Shops access policy" ON shops;
CREATE POLICY "Allow all select for shops" ON shops FOR SELECT USING (true);
CREATE POLICY "Allow all insert for shops" ON shops FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update for shops" ON shops FOR UPDATE USING (true);
CREATE POLICY "Allow all delete for shops" ON shops FOR DELETE USING (true);

-- Customers
CREATE POLICY "Allow all select for customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Allow all insert for customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update for customers" ON customers FOR UPDATE USING (true);
CREATE POLICY "Allow all delete for customers" ON customers FOR DELETE USING (true);

-- Suppliers
CREATE POLICY "Allow all select for suppliers" ON suppliers FOR SELECT USING (true);
CREATE POLICY "Allow all insert for suppliers" ON suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update for suppliers" ON suppliers FOR UPDATE USING (true);
CREATE POLICY "Allow all delete for suppliers" ON suppliers FOR DELETE USING (true);

-- Sales
CREATE POLICY "Allow all select for sales" ON sales FOR SELECT USING (true);
CREATE POLICY "Allow all insert for sales" ON sales FOR INSERT WITH CHECK (true);

-- Sale Items
CREATE POLICY "Allow all select for sale_items" ON sale_items FOR SELECT USING (true);
CREATE POLICY "Allow all insert for sale_items" ON sale_items FOR INSERT WITH CHECK (true);

-- Purchases
CREATE POLICY "Allow all select for purchases" ON purchases FOR SELECT USING (true);
CREATE POLICY "Allow all insert for purchases" ON purchases FOR INSERT WITH CHECK (true);

-- Profiles
DROP POLICY IF EXISTS "Profile view policy" ON profiles;
DROP POLICY IF EXISTS "Profile delete policy" ON profiles;
DROP POLICY IF EXISTS "Profile update policy" ON profiles;
DROP POLICY IF EXISTS "Profile insert policy" ON profiles;
CREATE POLICY "Allow all select for profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow all insert for profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update for profiles" ON profiles FOR UPDATE USING (true);
 
+-- Expenses
+DROP POLICY IF EXISTS "Expenses read access" ON expenses;
+DROP POLICY IF EXISTS "Expenses insert access" ON expenses;
+DROP POLICY IF EXISTS "Expenses update access" ON expenses;
+DROP POLICY IF EXISTS "Expenses delete access" ON expenses;
+CREATE POLICY "Expenses read access" ON expenses FOR SELECT USING (shop_id IN (SELECT get_user_shop_access()));
+CREATE POLICY "Expenses insert access" ON expenses FOR INSERT WITH CHECK (shop_id IN (SELECT get_user_shop_access()));
+CREATE POLICY "Expenses update access" ON expenses FOR UPDATE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id)) WITH CHECK (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
+CREATE POLICY "Expenses delete access" ON expenses FOR DELETE USING (shop_id IN (SELECT get_user_shop_access()) AND can_manage_shop(shop_id));
