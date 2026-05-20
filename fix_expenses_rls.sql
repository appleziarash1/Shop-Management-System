-- ==========================================
-- FIX: Allow all authorized users to log expenses
-- ==========================================

-- 1. Drop existing insert policy
DROP POLICY IF EXISTS "Expenses insert access" ON expenses;

-- 2. Create new insert policy
-- This allows anyone with access to the shop (assigned staff OR owners) to log an expense.
CREATE POLICY "Expenses insert access" ON expenses 
FOR INSERT WITH CHECK (
    shop_id IN (SELECT get_user_shop_access())
);

-- Note: Management (Owner/Admin/Manager) can still manage (Edit/Delete)
-- as those policies remain unchanged and use can_manage_shop().
