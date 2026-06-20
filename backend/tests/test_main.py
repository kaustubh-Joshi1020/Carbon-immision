import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from main import app, db, hash_password, verify_password, ActivityExtractor, ActivityDetail

client = TestClient(app)

# -------------------------------------------------------------------------
# Test Helpers
# -------------------------------------------------------------------------
def test_password_cryptography():
    password = "MyTestPassword123"
    hashed = hash_password(password)
    
    # Assert hash structure
    assert hashed.startswith("pbkdf2:sha256:")
    
    # Assert successful verification
    assert verify_password(password, hashed) is True
    
    # Assert invalid verification fails
    assert verify_password("WrongPassword", hashed) is False

# -------------------------------------------------------------------------
# Test Endpoints
# -------------------------------------------------------------------------
def test_auth_flow():
    # Setup unique credentials
    email = "test_auth_user@example.com"
    password = "SecurePassword123"
    
    # Clean up user if it already exists from previous runs
    db.execute(f"DELETE FROM users WHERE email = {db.placeholder}", (email,))

    # 1. Sign Up
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert signup_resp.status_code == 200
    data = signup_resp.json()
    assert data["success"] is True
    assert data["email"] == email
    user_id = data["user_id"]
    assert user_id is not None

    # 2. Duplicate Sign Up Prevention
    dup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert dup_resp.status_code == 400
    assert "already registered" in dup_resp.json()["detail"]

    # 3. Rejection of Invalid Login
    bad_login = client.post("/api/auth/login", json={"email": email, "password": "WrongPassword"})
    assert bad_login.status_code == 401
    assert "Invalid email" in bad_login.json()["detail"]

    # 4. Successful Login
    good_login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert good_login.status_code == 200
    login_data = good_login.json()
    assert login_data["success"] is True
    assert login_data["user_id"] == user_id

    # Clean up user
    db.execute(f"DELETE FROM users WHERE id = {db.placeholder}", (user_id,))

@patch("main.query_gemini_api")
def test_emission_flow(mock_gemini):
    # Setup mocked Gemini response
    mock_gemini.return_value = ActivityExtractor(
        activities=[
            ActivityDetail(
                category="transport",
                sub_category="diesel_car",
                value=20.0,
                unit="km"
            )
        ],
        explanation="Parsed 20 km trip in a diesel car."
    )

    email = "test_emissions_user@example.com"
    password = "SecurePassword123"
    
    # 1. Register test user
    db.execute(f"DELETE FROM users WHERE email = {db.placeholder}", (email,))
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    user_id = signup_resp.json()["user_id"]

    # 2. Log activity via chat
    chat_resp = client.post("/api/chat", json={
        "user_id": user_id,
        "email": email,
        "text": "I drove 20 km in a diesel car today"
    })
    
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["success"] is True
    # 20 km * 0.171 diesel factor = 3.42 kg CO2
    assert chat_data["total_co2_kg"] == 3.420
    assert len(chat_data["activities"]) == 1
    assert chat_data["activities"][0]["co2_emissions_kg"] == 3.420

    # 3. Retrieve emissions log
    list_resp = client.get(f"/api/emissions?user_id={user_id}&range=all_time")
    assert list_resp.status_code == 200
    logs = list_resp.json()
    assert len(logs) == 1
    assert logs[0]["category"] == "transport"
    assert logs[0]["sub_category"] == "diesel_car"
    assert float(logs[0]["co2_emissions_kg"]) == 3.420
    log_id = logs[0]["id"]

    # 4. Delete the log
    del_resp = client.delete(f"/api/emissions/{log_id}?user_id={user_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True

    # 5. Verify log is deleted
    list_resp_empty = client.get(f"/api/emissions?user_id={user_id}&range=all_time")
    assert len(list_resp_empty.json()) == 0

    # Clean up user
    db.execute(f"DELETE FROM users WHERE id = {db.placeholder}", (user_id,))
