-- Carbon Emission Tracker Database Schema
-- Compatible with PostgreSQL / Supabase SQL Editor

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create User Profiles Table for baseline emissions (infrequent updates)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    primary_commute VARCHAR(50) DEFAULT 'walking',         -- 'car', 'bike', 'bus', 'train', 'metro', 'walking'
    commute_distance NUMERIC DEFAULT 0,                    -- km distance (one way)
    commute_days NUMERIC DEFAULT 0,                        -- travel days per week
    vehicle_fuel VARCHAR(30) DEFAULT 'petrol',              -- 'petrol', 'diesel', 'EV', 'CNG'
    diet_type VARCHAR(50) DEFAULT 'vegetarian',            -- 'vegetarian', 'eggetarian', 'non-vegetarian', 'vegan'
    meat_freq_per_week NUMERIC DEFAULT 0,                  -- meat frequency per week
    cooking_fuel VARCHAR(50) DEFAULT 'electric_induction',  -- 'LPG', 'PNG', 'electric_induction'
    household_size NUMERIC DEFAULT 1,                      -- size of household
    waste_segregation BOOLEAN DEFAULT FALSE,               -- true/false segregation status
    water_people_count NUMERIC DEFAULT 1,                  -- water allocation headcount
    water_source VARCHAR(50) DEFAULT 'municipal',          -- 'municipal', 'tanker'
    monthly_online_orders NUMERIC DEFAULT 0,                -- monthly shopping orders
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Emissions Log Table
CREATE TABLE IF NOT EXISTS emissions_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,     -- 'transport', 'energy', 'food', 'waste', 'challenge_offset'
    sub_category VARCHAR(50) NOT NULL, -- e.g., 'diesel_car', 'electricity', 'lpg', 'meat_meal', 'challenge_reward'
    input_value NUMERIC NOT NULL,      -- Numerical amount
    input_unit VARCHAR(20) NOT NULL,   -- Unit
    co2_emissions_kg NUMERIC NOT NULL, -- Calculated CO2 impact in kg (can be negative for offsets)
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Indexes for Optimization
CREATE INDEX IF NOT EXISTS idx_emissions_user_id ON emissions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_emissions_logged_at ON emissions_log(logged_at);
