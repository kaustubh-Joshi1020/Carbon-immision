import os
import datetime
import sqlite3
import hashlib
import secrets
import hmac
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("PORT", 8000))

# Initialize FastAPI app
app = FastAPI(title="Carbon Emission Tracker API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------------
# Security: Global Exception Sanitizer (Prevents database schema leaks)
# -------------------------------------------------------------------------
@app.exception_handler(Exception)
def global_exception_handler(request, exc):
    print(f"UNHANDLED ERROR LOGGED: {exc}")
    # Return a generic message so attackers cannot see database/sql tracebacks
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal database or server error occurred. Please contact administrators."}
    )

# -------------------------------------------------------------------------
# Cryptographically Secure PBKDF2 Password Hashing
# -------------------------------------------------------------------------
def hash_password(password: str, salt: Optional[str] = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    iterations = 100000
    hash_bytes = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    )
    hash_hex = hash_bytes.hex()
    return f"pbkdf2:sha256:{iterations}${salt}${hash_hex}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        if not stored_hash.startswith("pbkdf2:sha256:"):
            old_salt = "ecolog_secure_salt_98372"
            old_hash = hashlib.sha256((password + old_salt).encode('utf-8')).hexdigest()
            return hmac.compare_digest(old_hash.encode('utf-8'), stored_hash.encode('utf-8'))
        
        parts = stored_hash.split("$")
        if len(parts) != 3:
            return False
        
        salt = parts[1]
        new_hash = hash_password(password, salt)
        return hmac.compare_digest(new_hash.encode('utf-8'), stored_hash.encode('utf-8'))
    except Exception:
        return False

# -------------------------------------------------------------------------
# Thread-Safe Database Manager with WAL & Connection Pooling
# -------------------------------------------------------------------------
class DatabaseManager:
    def __init__(self):
        self.db_type = "sqlite"
        self.placeholder = "?"
        self.pool = None
        self.connect()

    def connect(self):
        if DATABASE_URL:
            try:
                from psycopg2.pool import ThreadedConnectionPool
                self.pool = ThreadedConnectionPool(1, 20, DATABASE_URL)
                self.db_type = "postgres"
                self.placeholder = "%s"
                print("Successfully created PostgreSQL ThreadedConnectionPool.")
            except Exception as e:
                print(f"PostgreSQL connection pool creation failed: {e}. Falling back to SQLite.")
                self.connect_sqlite()
        else:
            self.connect_sqlite()

    def connect_sqlite(self):
        self.db_type = "sqlite"
        self.placeholder = "?"
        
        # Enable Write-Ahead Logging (WAL) Mode for optimal SQLite write concurrency
        conn = sqlite3.connect("emissions.db")
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.commit()
            print("SQLite connection initialized with WAL mode.")
        except Exception as e:
            print(f"Failed to enable SQLite WAL: {e}")
        finally:
            conn.close()

    def get_connection(self):
        if self.db_type == "postgres":
            if not self.pool:
                raise Exception("PostgreSQL pool is not initialized.")
            return self.pool.getconn()
        else:
            conn = sqlite3.connect("emissions.db", timeout=30)
            conn.execute("PRAGMA foreign_keys = ON")
            return conn

    def release_connection(self, conn):
        if self.db_type == "postgres":
            if self.pool and conn:
                self.pool.putconn(conn)
        else:
            if conn:
                conn.close()

    def execute(self, query: str, params: tuple = ()):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(query, params)
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            self.release_connection(conn)

    def fetch(self, query: str, params: tuple = ()) -> List[dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(query, params)
            if cursor.description is None:
                return []
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as e:
            raise e
        finally:
            self.release_connection(conn)

    def init_db(self):
        if self.db_type == "postgres":
            # PostgreSQL DDL
            self.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute("""
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    primary_commute VARCHAR(50) DEFAULT 'walking',
                    commute_distance NUMERIC DEFAULT 0,
                    commute_days NUMERIC DEFAULT 0,
                    vehicle_fuel VARCHAR(30) DEFAULT 'petrol',
                    diet_type VARCHAR(50) DEFAULT 'vegetarian',
                    meat_freq_per_week NUMERIC DEFAULT 0,
                    cooking_fuel VARCHAR(50) DEFAULT 'electric_induction',
                    household_size NUMERIC DEFAULT 1,
                    waste_segregation BOOLEAN DEFAULT FALSE,
                    water_people_count NUMERIC DEFAULT 1,
                    water_source VARCHAR(50) DEFAULT 'municipal',
                    monthly_online_orders NUMERIC DEFAULT 0,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute("""
                CREATE TABLE IF NOT EXISTS emissions_log (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                    category VARCHAR(50) NOT NULL,
                    sub_category VARCHAR(50) NOT NULL,
                    input_value NUMERIC NOT NULL,
                    input_unit VARCHAR(20) NOT NULL,
                    co2_emissions_kg NUMERIC NOT NULL,
                    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
        else:
            # SQLite DDL
            self.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute("""
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    primary_commute TEXT DEFAULT 'walking',
                    commute_distance REAL DEFAULT 0,
                    commute_days REAL DEFAULT 0,
                    vehicle_fuel TEXT DEFAULT 'petrol',
                    diet_type TEXT DEFAULT 'vegetarian',
                    meat_freq_per_week REAL DEFAULT 0,
                    cooking_fuel TEXT DEFAULT 'electric_induction',
                    household_size REAL DEFAULT 1,
                    waste_segregation INTEGER DEFAULT 0,
                    water_people_count REAL DEFAULT 1,
                    water_source TEXT DEFAULT 'municipal',
                    monthly_online_orders REAL DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute("""
                CREATE TABLE IF NOT EXISTS emissions_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                    category TEXT NOT NULL,
                    sub_category TEXT NOT NULL,
                    input_value REAL NOT NULL,
                    input_unit TEXT NOT NULL,
                    co2_emissions_kg REAL NOT NULL,
                    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

        # Self-healing migrations: add missing columns if they don't exist
        try:
            if self.db_type == "postgres":
                cols = self.fetch(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash'"
                )
                if not cols:
                    self.execute("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''")
            else:
                conn = self.get_connection()
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(users)")
                cols = [row[1] for row in cursor.fetchall()]
                self.release_connection(conn)
                if 'password_hash' not in cols:
                    self.execute("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
        except Exception as mig_err:
            print(f"Self-healing database migration warning: {mig_err}")
        
        # Delete default user 'kj@gmail.com'
        try:
            self.execute(f"DELETE FROM users WHERE email = {self.placeholder}", ("kj@gmail.com",))
        except Exception as del_err:
            print(f"Error removing default user: {del_err}")

        print("Database schema successfully initialized.")

db = DatabaseManager()

@app.on_event("startup")
def startup_event():
    db.init_db()

# -------------------------------------------------------------------------
# Pydantic Schemas (Strict Input Validation for Security)
# -------------------------------------------------------------------------
class AuthRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)

class ProfileRequest(BaseModel):
    user_id: str = Field(..., max_length=255)
    primary_commute: str = Field(..., pattern="^(car|bike|bus|train|metro|walking)$")
    commute_distance: float = Field(..., ge=0)
    commute_days: float = Field(..., ge=0, le=7)
    vehicle_fuel: str = Field(..., pattern="^(petrol|diesel|EV|CNG)$")
    diet_type: str = Field(..., pattern="^(vegetarian|eggetarian|non-vegetarian|vegan)$")
    meat_freq_per_week: float = Field(..., ge=0, le=21)
    cooking_fuel: str = Field(..., pattern="^(LPG|PNG|electric_induction)$")
    household_size: float = Field(..., ge=1)
    waste_segregation: bool
    water_people_count: float = Field(..., ge=1)
    water_source: str = Field(..., pattern="^(municipal|tanker)$")
    monthly_online_orders: float = Field(..., ge=0)

class ChallengeAcceptRequest(BaseModel):
    user_id: str = Field(..., max_length=255)
    category: str = Field(..., max_length=50)
    offset_kg: float = Field(..., gt=0)
    text: str = Field(..., max_length=255)

class ChatRequest(BaseModel):
    user_id: str = Field(..., max_length=255)
    email: str = Field(..., max_length=255)
    text: str = Field(..., max_length=1000)

class ActivityDetail(BaseModel):
    category: str = Field(description="Must be one of: 'transport', 'energy', 'food', 'waste'")
    sub_category: str = Field(description="Specific type, e.g. petrol_car, diesel_car, electricity, lpg, meat_meal, vegan_meal")
    value: float = Field(description="Quantity extracted")
    unit: str = Field(description="Unit of measurement")

class ActivityExtractor(BaseModel):
    activities: List[ActivityDetail] = Field(description="List of activities")
    explanation: str = Field(description="Explanation text")

# -------------------------------------------------------------------------
# Science Baseline Formula Calculations
# -------------------------------------------------------------------------
def calculate_baseline_emissions(p: dict) -> float:
    daily_co2 = 0.0
    
    # 1. Commute Baseline
    commute_mode = p.get("primary_commute", "walking").lower()
    distance = float(p.get("commute_distance", 0))
    days = float(p.get("commute_days", 0))
    fuel = p.get("vehicle_fuel", "petrol").lower()
    
    if commute_mode == "car":
        factor = 0.170
        if fuel == "diesel": factor = 0.171
        elif fuel == "ev": factor = 0.047
        elif fuel == "cng": factor = 0.120
        daily_co2 += (distance * 2 * days * factor) / 7.0
    elif commute_mode == "bike":
        daily_co2 += (distance * 2 * days * 0.080) / 7.0
    elif commute_mode == "bus":
        daily_co2 += (distance * 2 * days * 0.089) / 7.0
    elif commute_mode in ["train", "metro"]:
        daily_co2 += (distance * 2 * days * 0.041) / 7.0
        
    # 2. Diet Baseline
    diet = p.get("diet_type", "vegetarian").lower()
    meat_freq = float(p.get("meat_freq_per_week", 0))
    if diet == "vegan":
        daily_co2 += 0.5
    elif diet == "vegetarian":
        daily_co2 += 0.8
    elif diet == "eggetarian":
        daily_co2 += 1.2
    elif diet == "non-vegetarian":
        daily_co2 += 1.8 + (meat_freq * 1.5) / 7.0
        
    # 3. Cooking Fuel Baseline
    cook = p.get("cooking_fuel", "electric_induction").lower()
    size = max(float(p.get("household_size", 1)), 1.0)
    if cook == "lpg":
        daily_co2 += 1.5 / size
    elif cook == "png":
        daily_co2 += 1.0 / size
    else:
        daily_co2 += 0.5 / size
        
    # 4. Waste Baseline
    seg = bool(p.get("waste_segregation", False))
    daily_co2 += 0.1 if seg else 0.3
    
    # 5. Water Source Baseline
    source = p.get("water_source", "municipal").lower()
    water_people = max(float(p.get("water_people_count", 1)), 1.0)
    factor = 0.25 if source == "tanker" else 0.05
    daily_co2 += (factor * water_people) / size
    
    # 6. Online Shopping Baseline
    orders = float(p.get("monthly_online_orders", 0))
    daily_co2 += (orders * 1.5) / 30.0
    
    return round(daily_co2, 3)

# -------------------------------------------------------------------------
# Dynamic Challenge Suggestions
# -------------------------------------------------------------------------
def generate_challenge(category: str) -> dict:
    challenges = {
        "transport": {
            "text": "Carpool or ride public transit (bus/metro) for your next commute instead of driving a solo vehicle.",
            "offset_kg": 4.5
        },
        "energy": {
            "text": "Turn off all standby appliances, chargers, and non-essential lights tonight before going to bed.",
            "offset_kg": 0.8
        },
        "food": {
            "text": "Opt for a fully plant-based vegan or vegetarian meal for your next dinner instead of meat/beef.",
            "offset_kg": 2.2
        },
        "waste": {
            "text": "Segregate all your dry paper/plastics and wet compost organic kitchen waste today.",
            "offset_kg": 0.5
        }
    }
    return challenges.get(category.lower(), {
        "text": "Walk or bike for short trips under 2 km today instead of taking motorized transport.",
        "offset_kg": 1.2
    })

# -------------------------------------------------------------------------
# Conversions & Helpers
# -------------------------------------------------------------------------
EMISSION_FACTORS = {
    "transport": {
        "petrol_car": 0.170,
        "diesel_car": 0.171,
        "electric_car": 0.047,
        "hybrid_car": 0.109,
        "bus": 0.089,
        "train": 0.041,
        "flight": 0.255,
        "motorbike": 0.114,
    },
    "energy": {
        "electricity": 0.385,
        "lpg": 1.555,
        "png": 2.021,
        "natural_gas": 2.021,
        "heating_oil": 2.68,
        "coal": 2.42,
    },
    "food": {
        "meat_meal": 3.0,
        "beef": 27.0,
        "chicken": 6.9,
        "fish": 6.1,
        "dairy": 1.9,
        "vegetarian_meal": 0.8,
        "vegan_meal": 0.5,
    },
    "waste": {
        "municipal_waste": 0.5,
        "recycling": 0.1,
        "compost": 0.05,
    }
}

def calculate_emissions(category: str, sub_category: str, value: float, unit: str) -> float:
    category = category.lower().strip()
    sub_category = sub_category.lower().strip().replace(" ", "_")
    unit = unit.lower().strip()
    
    if unit in ["miles", "mile"]:
        value = value * 1.60934
        unit = "km"
    elif unit in ["gallons", "gallon", "gal"]:
        value = value * 3.78541
        unit = "liters"

    cat_factors = EMISSION_FACTORS.get(category, {})
    if sub_category in cat_factors:
        factor = cat_factors[sub_category]
    else:
        for key, val in cat_factors.items():
            if key in sub_category or sub_category in key:
                factor = val
                break
        else:
            defaults = {"transport": 0.15, "energy": 0.4, "food": 1.2, "waste": 0.3}
            factor = defaults.get(category, 0.1)
            
    return round(value * factor, 3)

def query_gemini_api(contents: list) -> ActivityExtractor:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API Key is not configured on the backend server."
        )
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ActivityExtractor,
            ),
        )
        return response.parsed
    except Exception as e:
        print(f"Gemini API Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI parsing error: {str(e)}")

# -------------------------------------------------------------------------
# Auth Endpoints
# -------------------------------------------------------------------------
@app.post("/api/auth/signup")
def signup(req: AuthRequest):
    email = req.email.lower().strip()
    password = req.password
    
    users = db.fetch(f"SELECT id FROM users WHERE email = {db.placeholder}", (email,))
    if users:
        raise HTTPException(status_code=400, detail="Email is already registered.")
    
    user_id = f"usr_{hashlib.md5(email.encode('utf-8')).hexdigest()[:10]}"
    p_hash = hash_password(password)
    db.execute(
        f"INSERT INTO users (id, email, password_hash) VALUES ({db.placeholder}, {db.placeholder}, {db.placeholder})",
        (user_id, email, p_hash)
    )
    return {"success": True, "user_id": user_id, "email": email}

@app.post("/api/auth/login")
def login(req: AuthRequest):
    email = req.email.lower().strip()
    password = req.password
    
    users = db.fetch(f"SELECT id, password_hash FROM users WHERE email = {db.placeholder}", (email,))
    if not users or not verify_password(password, users[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    return {"success": True, "user_id": users[0]["id"], "email": email}

# -------------------------------------------------------------------------
# Profile Endpoints (User Baselines)
# -------------------------------------------------------------------------
@app.post("/api/profile")
def save_profile(req: ProfileRequest):
    # Verify user exists
    user_exists = db.fetch(f"SELECT id FROM users WHERE id = {db.placeholder}", (req.user_id,))
    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found.")
        
    db.execute(
        f"INSERT INTO user_profiles ("
        f"  user_id, primary_commute, commute_distance, commute_days, vehicle_fuel,"
        f"  diet_type, meat_freq_per_week, cooking_fuel, household_size,"
        f"  waste_segregation, water_people_count, water_source, monthly_online_orders"
        f") VALUES ("
        f"  {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder},"
        f"  {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder},"
        f"  {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}"
        f") ON CONFLICT(user_id) DO UPDATE SET "
        f"  primary_commute = EXCLUDED.primary_commute,"
        f"  commute_distance = EXCLUDED.commute_distance,"
        f"  commute_days = EXCLUDED.commute_days,"
        f"  vehicle_fuel = EXCLUDED.vehicle_fuel,"
        f"  diet_type = EXCLUDED.diet_type,"
        f"  meat_freq_per_week = EXCLUDED.meat_freq_per_week,"
        f"  cooking_fuel = EXCLUDED.cooking_fuel,"
        f"  household_size = EXCLUDED.household_size,"
        f"  waste_segregation = EXCLUDED.waste_segregation,"
        f"  water_people_count = EXCLUDED.water_people_count,"
        f"  water_source = EXCLUDED.water_source,"
        f"  monthly_online_orders = EXCLUDED.monthly_online_orders,"
        f"  updated_at = CURRENT_TIMESTAMP",
        (
            req.user_id, req.primary_commute, req.commute_distance, req.commute_days, req.vehicle_fuel,
            req.diet_type, req.meat_freq_per_week, req.cooking_fuel, req.household_size,
            int(req.waste_segregation), req.water_people_count, req.water_source, req.monthly_online_orders
        )
    )
    return {"success": True, "message": "Baseline profile updated successfully"}

@app.get("/api/profile")
def get_profile(user_id: str):
    profile = db.fetch(f"SELECT * FROM user_profiles WHERE user_id = {db.placeholder}", (user_id,))
    if not profile:
        return {
            "has_profile": False,
            "baseline_daily_co2_kg": 0.0,
            "baseline_weekly_co2_kg": 0.0,
            "profile": {}
        }
    p = profile[0]
    p["waste_segregation"] = bool(p["waste_segregation"])
    # Convert numerical types for SQLite compat
    p["commute_distance"] = float(p["commute_distance"])
    p["commute_days"] = float(p["commute_days"])
    p["meat_freq_per_week"] = float(p["meat_freq_per_week"])
    p["household_size"] = float(p["household_size"])
    p["water_people_count"] = float(p["water_people_count"])
    p["monthly_online_orders"] = float(p["monthly_online_orders"])

    daily_co2 = calculate_baseline_emissions(p)
    return {
        "has_profile": True,
        "baseline_daily_co2_kg": daily_co2,
        "baseline_weekly_co2_kg": round(daily_co2 * 7, 3),
        "profile": p
    }

# -------------------------------------------------------------------------
# Daily Challenge Offset Logging Endpoint
# -------------------------------------------------------------------------
@app.post("/api/challenges/accept")
def accept_challenge(req: ChallengeAcceptRequest):
    # Log a negative co2 emission record represent the carbon savings offset!
    offset_kg = -abs(req.offset_kg)
    db.execute(
        f"INSERT INTO emissions_log (user_id, category, sub_category, input_value, input_unit, co2_emissions_kg) "
        f"VALUES ({db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder})",
        (req.user_id, "challenge_offset", req.text[:50], 1.0, "challenge", offset_kg)
    )
    return {"success": True, "offset_logged_kg": offset_kg, "message": "Challenge offset successfully applied!"}

# -------------------------------------------------------------------------
# Chat & Upload Logging Endpoints
# -------------------------------------------------------------------------
@app.post("/api/chat")
def chat_emission(req: ChatRequest):
    extracted = query_gemini_api([
        "You are a Carbon Emission Extractor agent. Analyze the following text and extract all carbon-emitting activities. "
        "Return the structured data matching the schema.",
        req.text
    ])

    results = []
    total_co2 = 0.0
    primary_category = "transport"

    for act in extracted.activities:
        co2_kg = calculate_emissions(act.category, act.sub_category, act.value, act.unit)
        total_co2 += co2_kg
        primary_category = act.category.lower()

        db.execute(
            f"INSERT INTO emissions_log (user_id, category, sub_category, input_value, input_unit, co2_emissions_kg) "
            f"VALUES ({db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder})",
            (req.user_id, act.category, act.sub_category, act.value, act.unit, co2_kg)
        )

        results.append({
            "category": act.category,
            "sub_category": act.sub_category,
            "value": act.value,
            "unit": act.unit,
            "co2_emissions_kg": co2_kg
        })

    # Pick a contextual daily challenge
    challenge = generate_challenge(primary_category)

    return {
        "success": True,
        "activities": results,
        "total_co2_kg": round(total_co2, 3),
        "explanation": extracted.explanation,
        "daily_challenge": challenge
    }

@app.post("/api/upload")
def upload_receipt(
    user_id: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...)
):
    file_bytes = file.file.read()
    image_part = types.Part.from_bytes(
        data=file_bytes,
        mime_type=file.content_type
    )

    extracted = query_gemini_api([
        image_part,
        "You are an expert carbon emission auditor and utility bill parser. Analyze this image. "
        "Identify if it is an electricity bill, LPG receipt, PNG bill, flight ticket, municipal waste bill, or fuel receipt. "
        "Extract the absolute quantity consumed (e.g. total kWh, liters of fuel, kilograms of gas, meals consumed). "
        "Map it to the structured schema."
    ])

    results = []
    total_co2 = 0.0
    primary_category = "energy"

    for act in extracted.activities:
        co2_kg = calculate_emissions(act.category, act.sub_category, act.value, act.unit)
        total_co2 += co2_kg
        primary_category = act.category.lower()

        db.execute(
            f"INSERT INTO emissions_log (user_id, category, sub_category, input_value, input_unit, co2_emissions_kg) "
            f"VALUES ({db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder}, {db.placeholder})",
            (user_id, act.category, act.sub_category, act.value, act.unit, co2_kg)
        )

        results.append({
            "category": act.category,
            "sub_category": act.sub_category,
            "value": act.value,
            "unit": act.unit,
            "co2_emissions_kg": co2_kg
        })

    challenge = generate_challenge(primary_category)

    return {
        "success": True,
        "activities": results,
        "total_co2_kg": round(total_co2, 3),
        "explanation": extracted.explanation,
        "daily_challenge": challenge
    }

@app.get("/api/emissions")
def get_emissions(user_id: str, range: str = "all_time"):
    now = datetime.datetime.now(datetime.timezone.utc)
    params = [user_id]
    
    date_filter = ""
    if range == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = f"AND logged_at >= {db.placeholder}"
        params.append(start_date)
    elif range == "weekly":
        start_date = now - datetime.timedelta(days=7)
        date_filter = f"AND logged_at >= {db.placeholder}"
        params.append(start_date)
    elif range == "monthly":
        start_date = now - datetime.timedelta(days=30)
        date_filter = f"AND logged_at >= {db.placeholder}"
        params.append(start_date)
    elif range == "yearly":
        start_date = now - datetime.timedelta(days=365)
        date_filter = f"AND logged_at >= {db.placeholder}"
        params.append(start_date)

    # Limit returned rows count to prevent memory bloated (Efficiency)
    query = f"SELECT * FROM emissions_log WHERE user_id = {db.placeholder} {date_filter} ORDER BY logged_at DESC LIMIT 200"
    
    try:
        logs = db.fetch(query, tuple(params))
        for log in logs:
            if isinstance(log.get("logged_at"), datetime.datetime):
                log["logged_at"] = log["logged_at"].isoformat()
            if log.get("co2_emissions_kg") is not None:
                log["co2_emissions_kg"] = float(log["co2_emissions_kg"])
            if log.get("input_value") is not None:
                log["input_value"] = float(log["input_value"])
        return logs
    except Exception as e:
        print(f"Error fetching emissions: {e}")
        raise HTTPException(status_code=500, detail="Database select query failed.")

@app.delete("/api/emissions/{log_id}")
def delete_emission(log_id: int, user_id: str):
    db.execute(
        f"DELETE FROM emissions_log WHERE id = {db.placeholder} AND user_id = {db.placeholder}",
        (log_id, user_id)
    )
    return {"success": True, "message": "Log deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
