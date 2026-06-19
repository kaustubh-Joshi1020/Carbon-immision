# EcoLog - AI Carbon Emission Tracker

EcoLog is a premium, real-time carbon emission tracking dashboard built with a **Next.js App Router** frontend and a **Python FastAPI** backend. It features **Gemini AI Structured Outputs** to parse natural language logs (e.g., *"I drove 20 km in a diesel car today"*) and **Gemini Vision** to parse utility bills and receipts (PNG/JPG).

## Features
- **Interactive Glassmorphic UI**: High-end dark theme dashboard with custom CSS animations.
- **Natural Language Parsing**: Just chat with the AI helper to log your carbon footprint.
- **Multimodal Document Parsing**: Upload electricity bills or transit receipts, and let Gemini extract the exact usage values.
- **Dynamic Charting**: Segment emissions by categories (*Transport, Energy, Food, Waste*) over multiple time frames (*Today, 7 Days, 30 Days, Year, All Time*).
- **Zero-Config Developer Mode**: Fallback to local SQLite database and simulated auth if no external databases are configured. Supports PostgreSQL (Supabase) out of the box.

---

## 💻 Local Setup Guide

Follow these steps to run EcoLog locally on your Windows laptop using PowerShell or CMD.

### Prerequisites
1. **Python 3.10+** (Ensure "Add to PATH" was selected during install).
2. **Node.js 18+** (Includes npm).
3. **Google Gemini API Key** (Get one for free at [Google AI Studio](https://aistudio.google.com/)).

---

### Step 1: Database Setup
You can run this project in two modes:

#### Option A: Zero-Config Local Mode (SQLite) - *Recommended for instant testing*
- No database setup required! The backend will automatically create an `emissions.db` SQLite file locally and use simulated authentication.

#### Option B: Cloud Database Mode (PostgreSQL / Supabase)
1. Create a free project on [Supabase](https://supabase.com/).
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Copy the contents of the [schema.sql](file:///d:/promptwar/Carbon%20immision/schema.sql) file, paste them into the SQL editor, and click **Run**.
4. Retrieve your **Transaction Connection String** from database settings. It looks like:
   `postgresql://postgres.[username]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`

---

### Step 2: Backend Setup (FastAPI)
1. Open PowerShell and navigate to the backend folder:
   ```powershell
   cd "d:\promptwar\Carbon immision\backend"
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   - Duplicate `.env.template` and rename it to `.env`:
     ```powershell
     copy .env.template .env
     ```
   - Open `.env` and fill in your keys:
     ```env
     GEMINI_API_KEY=your_actual_gemini_api_key_here
     
     # (Optional) Add your Supabase PostgreSQL connection string to enable Postgres mode:
     DATABASE_URL=postgresql://postgres.xxx:yourpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
     ```
5. Start the FastAPI server:
   ```powershell
   python main.py
   ```
   *The backend will boot up at `http://localhost:8000`.*

---

### Step 3: Frontend Setup (Next.js)
1. Open a new PowerShell window and navigate to the frontend folder:
   ```powershell
   cd "d:\promptwar\Carbon immision\frontend"
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Configure environment variables:
   - Duplicate `.env.template` and rename it to `.env.local`:
     ```powershell
     copy .env.template .env.local
     ```
   - Open `.env.local` and add backend and authentication details:
     ```env
     NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
     
     # (Optional) Leave these blank for Simulated Local Auth!
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```
4. Launch the Next.js development server:
   ```powershell
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:3000`.

---

## 🚀 Cloud Deployment Guide

To put your application online so others can use it, follow these deployment steps.

### 1. Database Deployment (Supabase)
If you haven't already:
- Set up a project on Supabase and run the DDL statements in `schema.sql` to initialize the database tables.

---

### 2. Backend Deployment (Render or Railway)
We recommend **Render** or **Railway** for hosting the Python FastAPI backend.

#### Deploying on Render (Free Tier):
1. Push your backend code to a GitHub repository (it's recommended to put the `backend` folder in its own repo or use a monorepo structure).
2. Go to [Render](https://render.com/), sign in, and click **New > Web Service**.
3. Connect your GitHub repository.
4. Set the following details:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Go to **Advanced** and add these Environment Variables:
   - `GEMINI_API_KEY`: *Your Google AI Studio Key*
   - `DATABASE_URL`: *Your Supabase Transaction Pooler URL*
   - `PORT`: `8000`
6. Click **Deploy**. Render will generate a URL (e.g. `https://ecolog-backend.onrender.com`). Copy this URL.

---

### 3. Frontend Deployment (Vercel)
**Vercel** is the natural hosting platform for Next.js applications.

#### Deploying on Vercel:
1. Push your frontend code to GitHub.
2. Go to [Vercel](https://vercel.com/) and click **Add New > Project**.
3. Import your GitHub repository.
4. Under **Framework Preset**, select **Next.js**.
5. Set the **Root Directory** to `frontend`.
6. Expand **Environment Variables** and enter:
   - `NEXT_PUBLIC_BACKEND_URL`: *The Render URL you copied in the previous step (without a trailing slash)*
   - (Optional) `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` (if using Supabase Auth).
7. Click **Deploy**. Vercel will build your application and launch it at a custom `.vercel.app` domain.

---

## 🔒 Enabling Google Auth on Supabase (Optional)
If you want to use Google Sign-In on your production dashboard:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Navigate to **APIs & Services > Credentials** and configure your **OAuth Consent Screen**.
3. Create an **OAuth 2.0 Client ID**.
4. In your Supabase Dashboard, go to **Authentication > Providers > Google**.
5. Copy your Google **Client ID** and **Client Secret** into Supabase.
6. Copy the **Redirect URI** provided by Supabase and paste it back into your Google Credentials settings under **Authorized redirect URIs**.
