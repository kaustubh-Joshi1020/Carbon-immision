-- Carbon Emission Tracker Database Schema
-- Compatible with PostgreSQL / Supabase SQL Editor

-- 1. Create Users Table
-- If using Supabase, this table maps user profiles.
-- For local development, user_id can be any unique string (e.g. simulated auth email or UUID).
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Emissions Log Table
-- Tracks individual carbon-emitting activities logged by users.
CREATE TABLE IF NOT EXISTS emissions_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,     -- 'transport', 'energy', 'food', 'waste'
    sub_category VARCHAR(50) NOT NULL, -- e.g., 'diesel_car', 'electricity', 'lpg', 'meat_meal'
    input_value NUMERIC NOT NULL,      -- Numerical amount (e.g., 20.0, 150.5)
    input_unit VARCHAR(20) NOT NULL,   -- Unit (e.g., 'km', 'kWh', 'meals', 'liters')
    co2_emissions_kg NUMERIC NOT NULL, -- Calculated CO2 impact in kg
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Indexes for Optimization (Optional but Recommended)
CREATE INDEX IF NOT EXISTS idx_emissions_user_id ON emissions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_emissions_logged_at ON emissions_log(logged_at);
