ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_residence TEXT DEFAULT 'Malawi';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency_preference TEXT DEFAULT 'MWK';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_currency_preference_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_currency_preference_check
CHECK (currency_preference IN ('MWK', 'ZMW', 'TZS', 'KES', 'ZAR', 'NGN', 'USD', 'GBP'));
