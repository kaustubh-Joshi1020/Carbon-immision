import os
import sys
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

# Dynamically resolve import paths so the test runner can locate main.py
# whether executed from the repository root or from inside the backend folder.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app, db, hash_password, verify_password, ActivityExtractor, ActivityDetail

client = TestClient(app)

# -------------------------------------------------------------------------
# Test Helpers
# -------------------------------------------------------------------------
def test_password_cryptography():
    password = "MyTestPassword123"
    hashed = hash_password(password)
    assert hashed.startswith("pbkdf2:sha256:")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

# -------------------------------------------------------------------------
# Test Auth Flow
# -------------------------------------------------------------------------
def test_auth_flow():
    email = "test_auth_user@example.com"
    password = "SecurePassword123"
    
    # Clean up
    db.execute(f"DELETE FROM users WHERE email = {db.placeholder}", (email,))

    # 1. Sign Up
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert signup_resp.status_code == 200
    data = signup_resp.json()
    assert data["success"] is True
    user_id = data["user_id"]

    # 2. Duplicate Check
    dup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert dup_resp.status_code == 400

    # 3. Login
    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    assert login_resp.json()["user_id"] == user_id

    # Clean up
    db.execute(f"DELETE FROM users WHERE id = {db.placeholder}", (user_id,))

# -------------------------------------------------------------------------
# Test User Profile Baselines Flow
# -------------------------------------------------------------------------
def test_user_profile_flow():
    email = "test_profile_user@example.com"
    password = "SecurePassword123"
    
    # 1. Register user
    db.execute(f"DELETE FROM users WHERE email = {db.placeholder}", (email,))
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    user_id = signup_resp.json()["user_id"]

    # 2. Fetch empty profile
    get_empty_resp = client.get(f"/api/profile?user_id={user_id}")
    assert get_empty_resp.status_code == 200
    assert get_empty_resp.json()["has_profile"] is False
    assert get_empty_resp.json()["baseline_daily_co2_kg"] == 0.0

    # 3. Save profile details
    profile_data = {
        "user_id": user_id,
        "primary_commute": "car",
        "commute_distance": 15.0, # 15km roundtrip = 30km
        "commute_days": 5.0,
        "vehicle_fuel": "petrol", # petrol car factor = 0.170
        "diet_type": "non-vegetarian", # base non-veg diet = 1.8
        "meat_freq_per_week": 3.0, # meat factor = (3 * 1.5)/7
        "cooking_fuel": "electric_induction", # induction base = 0.5/ household_size
        "household_size": 2.0,
        "waste_segregation": True, # waste segregation base = 0.1
        "water_people_count": 2.0,
        "water_source": "municipal", # municipal water base = (0.05 * 2)/2
        "monthly_online_orders": 4.0 # shopping base = (4 * 1.5)/30
    }
    
    save_resp = client.post("/api/profile", json=profile_data)
    assert save_resp.status_code == 200
    assert save_resp.json()["success"] is True

    # 4. Retrieve saved profile & verify baselines
    get_resp = client.get(f"/api/profile?user_id={user_id}")
    assert get_resp.status_code == 200
    res = get_resp.json()
    assert res["has_profile"] is True
    # Daily Baseline calculations:
    # Commute: (15 * 2 * 5 * 0.170) / 7 = 3.643
    # Diet: 1.8 + (3 * 1.5) / 7 = 2.443
    # Cooking: 0.5 / 2 = 0.250
    # Waste: 0.100
    # Water: (0.05 * 2) / 2 = 0.050
    # Shopping: (4 * 1.5) / 30 = 0.200
    # Total expected daily base = 3.643 + 2.443 + 0.250 + 0.100 + 0.050 + 0.200 = 6.686 kg CO2
    assert res["baseline_daily_co2_kg"] == 6.686

    # Clean up
    db.execute(f"DELETE FROM users WHERE id = {db.placeholder}", (user_id,))

# -------------------------------------------------------------------------
# Test Emission Chat & Daily Challenges Flow
# -------------------------------------------------------------------------
@patch("main.query_gemini_api")
def test_emission_chat_and_challenges(mock_gemini):
    # Setup mock Gemini response for chat log
    mock_gemini.return_value = ActivityExtractor(
        activities=[
            ActivityDetail(
                category="transport",
                sub_category="diesel_car",
                value=20.0,
                unit="km"
            )
        ],
        explanation="Logged 20 km in diesel car."
    )

    email = "test_challenges_user@example.com"
    password = "SecurePassword123"
    
    # 1. Register test user
    db.execute(f"DELETE FROM users WHERE email = {db.placeholder}", (email,))
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    user_id = signup_resp.json()["user_id"]

    # 2. Log activity & verify challenge is returned in response
    chat_resp = client.post("/api/chat", json={
        "user_id": user_id,
        "email": email,
        "text": "I drove 20 km in a diesel car"
    })
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["success"] is True
    assert "daily_challenge" in chat_data
    assert chat_data["daily_challenge"]["offset_kg"] == 4.5
    challenge_text = chat_data["daily_challenge"]["text"]

    # 3. Accept challenge (Log negative offset reduction)
    accept_resp = client.post("/api/challenges/accept", json={
        "user_id": user_id,
        "category": "transport",
        "offset_kg": 4.5,
        "text": challenge_text
    })
    assert accept_resp.status_code == 200
    assert accept_resp.json()["success"] is True
    assert accept_resp.json()["offset_logged_kg"] == -4.5

    # 4. Fetch emissions list and verify net emissions
    list_resp = client.get(f"/api/emissions?user_id={user_id}&range=all_time")
    logs = list_resp.json()
    # 2 logs: 1 diesel_car (3.42 kg), 1 challenge_offset (-4.5 kg)
    assert len(logs) == 2
    net_emissions = sum(float(l["co2_emissions_kg"]) for l in logs)
    assert round(net_emissions, 2) == -1.08

    # Clean up
    db.execute(f"DELETE FROM users WHERE id = {db.placeholder}", (user_id,))
