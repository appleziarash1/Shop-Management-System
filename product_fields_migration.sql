-- Migration: Add extra fields to products table for advanced lookup
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update RLS if needed (usually not required if columns are just added)
