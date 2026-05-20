-- Sample Data for Multi-Shop SMS
-- Shops
INSERT INTO shops (id, name, location, contact_info) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Lilongwe Branch', 'Area 47, Lilongwe', '088100200'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Blantyre Branch', 'Limbe, Blantyre', '088100300');

-- Products for Shop 1
INSERT INTO products (shop_id, name, category, quantity, min_quantity, cost_price, selling_price) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Rice (5kg)', 'Groceries', 50, 10, 8500, 12000),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sugar (2kg)', 'Groceries', 100, 20, 2500, 3200),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Cooking Oil (2L)', 'Groceries', 30, 5, 4500, 6000);

-- Products for Shop 2
INSERT INTO products (shop_id, name, category, quantity, min_quantity, cost_price, selling_price) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Hammer', 'Hardware', 15, 3, 3000, 5500),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Nails (1kg)', 'Hardware', 40, 10, 1500, 2500);

-- Customers
INSERT INTO customers (shop_id, name, phone, email) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'John Phiri', '0999001122', 'john@example.com'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Mary Banda', '0888003344', 'mary@example.com');

-- Suppliers
INSERT INTO suppliers (shop_id, name, contact_person, phone) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Agro-Business Ltd', 'Mr. Chirimba', '0111222333'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Hardware Wholesalers', 'Steve Jobo', '0111555666');
