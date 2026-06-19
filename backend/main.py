import os
import datetime
import sqlite3
import hashlib
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
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
    allow_origins=["*"],  # Restrict to specific frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------------
# Password Hashing Helper
# -------------------------------------------------------------------------
def hash_password(password: str) -> str:
    # Use SHA-256 with a static salt for local auth security
    salt = "ecolog_secure_salt_98372"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

# -------------------------------------------------------------------------
# Database Manager
# -------------------------------------------------------------------------
class DatabaseManager:
    def __init__(self):
        self.db_type = "sqlite"
        self.placeholder = "?"
        self.conn = None
        self.connect()

    def connect(self):
        if DATABASE_URL:
            try:
                import psycopg2
                self.conn = psycopg2.connect(DATABASE_URL)
                self.db_type = "postgres"
                self.placeholder = "%s"
                print("Successfully connected to PostgreSQL database.")
            except Exception as e:
                print(f"PostgreSQL connection failed: {e}. Falling back to SQLite.")
                self.connect_sqlite()
        else:
            self.connect_sqlite()

    def connect_sqlite(self):
        self.conn = sqlite3.connect("emissions.db", check_same_thread=False)
        self.db_type = "sqlite"
        self.placeholder = "?"
        print("Connected to local SQLite database: emissions.db")

    def execute_query(self, query: str, params: tuple = ()):
        cursor = self.conn.cursor()
        try:
            cursor.execute(query, params)
            self.conn.commit()
            return cursor
        except (sqlite3.Error, Exception) as e:
            # Handle potential connection drop for Postgres
            if self.db_type == "postgres":
                print("Database query failed, attempting to reconnect...")
                try:
                    self.connect()
                    cursor = self.conn.cursor()
                    cursor.execute(query, params)
                    self.conn.commit()
                    return cursor
                except Exception as rec_err:
                    print(f"Reconnection failed: {rec_err}")
                    raise rec_err
            else:
                raise e

    def fetch_all(self, query: str, params: tuple = ()):
        cursor = self.execute_query(query, params)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def init_db(self):
        if self.db_type == "postgres":
            # PostgreSQL DDL
            self.execute_query("""
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute_query("""
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
            self.execute_query("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            self.execute_query("""
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

        # Self-healing migration: Add password_hash column if it is missing from an older database instance
        try:
            if self.db_type == "postgres":
                cols = self.fetch_all(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash'"
                )
                if not cols:
                    self.execute_query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''")
                    print("Database Migration: Added password_hash column to PostgreSQL users table.")
            else:
                cursor = self.conn.cursor()
                cursor.execute("PRAGMA table_info(users)")
                cols = [row[1] for row in cursor.fetchall()]
                if 'password_hash' not in cols:
                    self.execute_query("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
                    print("Database Migration: Added password_hash column to SQLite users table.")
        except Exception as mig_err:
            print(f"Self-healing database migration warning: {mig_err}")
        
        # Delete the default user 'kj@gmail.com' from the DB if it exists
        try:
            self.execute_query(
                f"DELETE FROM users WHERE email = {self.placeholder}",
                ("kj@gmail.com",)
            )
            print("Successfully deleted 'kj@gmail.com' from the database.")
        except Exception as del_err:
            print(f"Error deleting 'kj@gmail.com': {del_err}")

        print("Database schema successfully initialized.")

db = DatabaseManager()

@app.on_event("startup")
def startup_event():
    db.init_db()

# -------------------------------------------------------------------------
# Pydantic Schemas for Request & Response
# -------------------------------------------------------------------------
class AuthRequest(BaseModel):
    email: str
    password: str

class ActivityDetail(BaseModel):
    category: str = Field(
        description="Must be one of: 'transport', 'energy', 'food', 'waste'"
    )
    sub_category: str = Field(
        description="Specific type, e.g., 'petrol_car', 'diesel_car', 'electric_car', 'bus', 'flight', 'electricity', 'lpg', 'png', 'meat_meal', 'vegetarian_meal', 'vegan_meal'"
    )
    value: float = Field(
        description="Numerical quantity extracted from the text or document (e.g. distance in km, energy in kWh, quantity in kg, count of meals)"
    )
    unit: str = Field(
        description="Unit of measurement, e.g., 'km', 'kWh', 'liters', 'm3', 'kg', 'meals'"
    )

class ActivityExtractor(BaseModel):
    activities: List[ActivityDetail] = Field(
        description="List of carbon-emitting activities extracted from the user's input."
    )
    explanation: str = Field(
        description="Brief explanation of what was extracted and why."
    )

# -------------------------------------------------------------------------
# Carbon Emission Calculation Constants & Helper
# -------------------------------------------------------------------------
EMISSION_FACTORS = {
    "transport": {
        "petrol_car": 0.170,      # kg CO2 per km
        "diesel_car": 0.171,      # kg CO2 per km
        "electric_car": 0.047,    # kg CO2 per km
        "hybrid_car": 0.109,      # kg CO2 per km
        "bus": 0.089,             # kg CO2 per km (per passenger-km)
        "train": 0.041,           # kg CO2 per km (per passenger-km)
        "flight": 0.255,          # kg CO2 per km (per passenger-km)
        "motorbike": 0.114,       # kg CO2 per km
    },
    "energy": {
        "electricity": 0.385,     # kg CO2 per kWh
        "lpg": 1.555,             # kg CO2 per liter (or 2.939 per kg)
        "png": 2.021,             # kg CO2 per m3
        "natural_gas": 2.021,     # kg CO2 per m3
        "heating_oil": 2.68,      # kg CO2 per liter
        "coal": 2.42,             # kg CO2 per kg
    },
    "food": {
        "meat_meal": 3.0,         # kg CO2 per meal
        "beef": 27.0,             # kg CO2 per kg
        "chicken": 6.9,           # kg CO2 per kg
        "fish": 6.1,              # kg CO2 per kg
        "dairy": 1.9,             # kg CO2 per kg
        "vegetarian_meal": 0.8,   # kg CO2 per meal
        "vegan_meal": 0.5,        # kg CO2 per meal
    },
    "waste": {
        "municipal_waste": 0.5,   # kg CO2 per kg
        "recycling": 0.1,         # kg CO2 per kg
        "compost": 0.05,          # kg CO2 per kg
    }
}

def calculate_emissions(category: str, sub_category: str, value: float, unit: str) -> float:
    category = category.lower().strip()
    sub_category = sub_category.lower().strip().replace(" ", "_")
    unit = unit.lower().strip()
    
    # Conversions
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
        # Fallback to fuzzy match
        for key, val in cat_factors.items():
            if key in sub_category or sub_category in key:
                factor = val
                break
        else:
            # General defaults
            defaults = {
                "transport": 0.15,
                "energy": 0.4,
                "food": 1.2,
                "waste": 0.3
            }
            factor = defaults.get(category, 0.1)
            
    return round(value * factor, 3)

# -------------------------------------------------------------------------
# Gemini API Interaction
# -------------------------------------------------------------------------
def query_gemini_api(contents: list) -> ActivityExtractor:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API Key is not configured on the backend server. Please add GEMINI_API_KEY to your environment variables."
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
        raise HTTPException(
            status_code=500,
            detail=f"Error communicating with Gemini AI: {str(e)}"
        )

# -------------------------------------------------------------------------
# Authentication Endpoints
# -------------------------------------------------------------------------
@app.post("/api/auth/signup")
def signup(req: AuthRequest):
    email = req.email.lower().strip()
    password = req.password
    
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    
    # Check if user already exists
    users = db.fetch_all(f"SELECT id FROM users WHERE email = {db.placeholder}", (email,))
    if users:
        raise HTTPException(status_code=400, detail="Email is already registered.")
    
    user_id = f"usr_{hashlib.md5(email.encode('utf-8')).hexdigest()[:10]}"
    p_hash = hash_password(password)
    
    try:
        db.execute_query(
            f"INSERT INTO users (id, email, password_hash) VALUES ({db.placeholder}, {db.placeholder}, {db.placeholder})",
            (user_id, email, p_hash)
        )
        return {"success": True, "user_id": user_id, "email": email}
    except Exception as e:
        print(f"Registration failed: {e}")
        raise HTTPException(status_code=500, detail="Database write error during sign up.")

@app.post("/api/auth/login")
def login(req: AuthRequest):
    email = req.email.lower().strip()
    password = req.password
    p_hash = hash_password(password)
    
    users = db.fetch_all(
        f"SELECT id, password_hash FROM users WHERE email = {db.placeholder}",
        (email,)
    )
    
    if not users or users[0]["password_hash"] != p_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    return {"success": True, "user_id": users[0]["id"], "email": email}

# -------------------------------------------------------------------------
# Activity Log Endpoints
# -------------------------------------------------------------------------
class ChatRequest(BaseModel):
    user_id: str
    email: str
    text: str

@app.post("/api/chat")
async def chat_emission(req: ChatRequest):
    # Ask Gemini to extract structured info
    extracted = query_gemini_api([
        "You are a Carbon Emission Extractor agent. Analyze the following text and extract all carbon-emitting activities. "
        "Return the structured data matching the schema.",
        req.text
    ])

    results = []
    total_co2 = 0.0

    for act in extracted.activities:
        co2_kg = calculate_emissions(act.category, act.sub_category, act.value, act.unit)
        total_co2 += co2_kg

        # Insert log into DB
        db.execute_query(
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

    return {
        "success": True,
        "activities": results,
        "total_co2_kg": round(total_co2, 3),
        "explanation": extracted.explanation
    }

@app.post("/api/upload")
async def upload_receipt(
    user_id: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...)
):
    # Read image bytes
    file_bytes = await file.read()
    
    # Prepare image part for Gemini API
    image_part = types.Part.from_bytes(
        data=file_bytes,
        mime_type=file.content_type
    )

    # Query Gemini Vision
    extracted = query_gemini_api([
        image_part,
        "You are an expert carbon emission auditor and utility bill parser. Analyze this image. "
        "Identify if it is an electricity bill, LPG receipt, PNG bill, flight ticket, municipal waste bill, or fuel receipt. "
        "Extract the absolute quantity consumed (e.g. total kWh, liters of fuel, kilograms of gas, meals consumed). "
        "Map it to the structured schema."
    ])

    results = []
    total_co2 = 0.0

    for act in extracted.activities:
        co2_kg = calculate_emissions(act.category, act.sub_category, act.value, act.unit)
        total_co2 += co2_kg

        db.execute_query(
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

    return {
        "success": True,
        "activities": results,
        "total_co2_kg": round(total_co2, 3),
        "explanation": extracted.explanation
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

    query = f"SELECT * FROM emissions_log WHERE user_id = {db.placeholder} {date_filter} ORDER BY logged_at DESC"
    
    try:
        logs = db.fetch_all(query, tuple(params))
        
        # Serialize datetime fields for JSON compatibility
        for log in logs:
            if isinstance(log.get("logged_at"), datetime.datetime):
                log["logged_at"] = log["logged_at"].isoformat()
            elif isinstance(log.get("co2_emissions_kg"), float) or isinstance(log.get("co2_emissions_kg"), int):
                log["co2_emissions_kg"] = float(log["co2_emissions_kg"])
            else:
                log["co2_emissions_kg"] = float(log["co2_emissions_kg"])
                
        return logs
    except Exception as e:
        print(f"Error fetching emissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/emissions/{log_id}")
def delete_emission(log_id: int, user_id: str):
    db.execute_query(
        f"DELETE FROM emissions_log WHERE id = {db.placeholder} AND user_id = {db.placeholder}",
        (log_id, user_id)
    )
    return {"success": True, "message": "Log deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
