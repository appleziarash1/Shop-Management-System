# Shop Management System

A multi-branch shop management system built with React, Vite, and Supabase. The application helps shop owners and staff manage inventory, sales, purchases, customers, suppliers, staff access, branch operations, and business reports from a single dashboard.

## Overview

This system is designed for small and growing businesses that need to manage day-to-day shop activities across one or more branches. It supports role-based access so owners can oversee the full business while staff members focus on the branches assigned to them.

## Main Features

- Owner and staff authentication
- Multi-shop and branch management
- Product and inventory tracking
- Sales processing with cart workflow
- Receipt generation in PDF format
- Purchase and restocking records
- Customer and supplier management
- Dashboard analytics and low-stock alerts
- Business reports with CSV and PDF export
- Role-based data access with Supabase Row Level Security

## User Roles

- `Owner`: manages shops, monitors reports, and views full business data
- `Manager`: manages shop operations for the assigned branch
- `Cashier`: focuses on sales and customer transactions

## Modules

- `Dashboard`: revenue, transactions, products, low-stock alerts, receipts, and branch summaries
- `Inventory`: product listing, stock quantities, pricing, and minimum stock levels
- `Sales`: add items to cart, choose customer, complete checkout, and print receipts
- `Purchases`: record restocking and inventory inflow
- `Customers`: maintain customer records
- `Suppliers`: manage supplier information
- `Reports`: generate operational and financial summaries, export CSV/PDF
- `Staff`: manage staff access and assignments
- `Shops`: create and manage business branches

## Tech Stack

- `React 19`
- `Vite`
- `React Router`
- `Supabase`
- `Chart.js` and `react-chartjs-2`
- `jsPDF` and `jspdf-autotable`
- `date-fns`
- `lucide-react`

## Project Structure

```text
src/
  components/      Reusable UI and route protection
  context/         Global shop and user state
  lib/             Supabase client
  pages/           Application screens
public/            Static assets
supabase_schema.sql
supabase_policies.sql
seed.sql
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Chiyambi/Shop-Management-System.git
cd Shop-Management-System
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Run the Application

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Database Setup

This project includes SQL files for preparing the Supabase database:

- `supabase_schema.sql`: creates the main tables and core RLS logic
- `supabase_policies.sql`: provides development-friendly CRUD policies
- `seed.sql`: optional sample data for testing

### Main Database Tables

- `profiles`
- `shops`
- `products`
- `customers`
- `suppliers`
- `sales`
- `sale_items`
- `purchases`

### Suggested Setup Flow

1. Create a new Supabase project
2. Open the SQL editor
3. Run `supabase_schema.sql`
4. Run `supabase_policies.sql` if you want easier development access
5. Run `seed.sql` if you want sample records
6. Add your Supabase project credentials to `.env`

## Authentication Flow

- Owners can sign up and create their first shop during registration
- Owners and staff sign in through separate login flows
- Staff accounts are tied to branch and profile data stored in Supabase
- Protected routes prevent unauthenticated access to the main system

## Reporting and Documents

The system can generate:

- sales receipts in PDF
- business reports in PDF
- summary exports in CSV

## Deployment

The frontend can be deployed on platforms such as:

- Vercel
- Netlify
- Supabase hosting-compatible static environments

After deployment, make sure your production environment variables match your Supabase project settings.

## Notes

- The app uses Supabase as both the database and authentication provider
- The project includes development helper scripts such as `check_api.js`, `check_rest.js`, `check_tables.js`, and `test_db.js`
- `.env` is ignored by git and should not be committed

## Repository

GitHub repository:

`https://github.com/Chiyambi/Shop-Management-System`
developed by chiyambi chimamba.
