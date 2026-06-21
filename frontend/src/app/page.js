'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  Leaf, 
  Car, 
  Zap, 
  Utensils, 
  Trash2, 
  Send, 
  UploadCloud, 
  FileText, 
  AlertCircle,
  Clock,
  Sparkles,
  LogOut,
  User,
  Settings,
  X,
  TrendingDown,
  ShoppingBag,
  Award,
  CheckCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function Dashboard() {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Application State
  const [timeRange, setTimeRange] = useState('all_time');
  const [emissions, setEmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isMounted, setIsMounted] = useState(false);

  // Profile Baseline State
  const [hasProfile, setHasProfile] = useState(false);
  const [baselineDailyCO2, setBaselineDailyCO2] = useState(0.0);
  const [baselineWeeklyCO2, setBaselineWeeklyCO2] = useState(0.0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Profile Form State
  const [commuteMode, setCommuteMode] = useState('walking');
  const [commuteDistance, setCommuteDistance] = useState(0);
  const [commuteDays, setCommuteDays] = useState(0);
  const [vehicleFuel, setVehicleFuel] = useState('petrol');
  const [dietType, setDietType] = useState('vegetarian');
  const [meatFreq, setMeatFreq] = useState(0);
  const [cookingFuel, setCookingFuel] = useState('electric_induction');
  const [householdSize, setHouseholdSize] = useState(1);
  const [wasteSegregation, setWasteSegregation] = useState(false);
  const [waterPeopleCount, setWaterPeopleCount] = useState(1);
  const [waterSource, setWaterSource] = useState('municipal');
  const [monthlyOnlineOrders, setMonthlyOnlineOrders] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);

  // Daily Challenge State
  const [activeChallenge, setActiveChallenge] = useState({
    text: "Walk or bike for short trips under 2 km today instead of taking motorized transport.",
    offset_kg: 1.2,
    category: "transport"
  });
  const [challengeCompleted, setChallengeCompleted] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: "Hello! I am EcoLog AI. Tell me what you did today, e.g., 'I drove 45 km in a diesel car' or 'Cooked 3 vegetarian meals', and I will calculate and log the carbon emissions for you! You can also configure your custom Carbon Baseline Profile using the Settings icon in the header.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Check Auth on Mount
  useEffect(() => {
    setIsMounted(true);
    const savedUser = localStorage.getItem('ecolog_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Fetch Emissions & Profile whenever User or timeRange changes
  useEffect(() => {
    if (user) {
      fetchEmissions();
      fetchProfile();
    }
  }, [user, timeRange]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Fetch Emissions from FastAPI backend
  const fetchEmissions = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/emissions?user_id=${user.id}&range=${timeRange}`);
      if (!response.ok) {
        throw new Error("Failed to fetch emission records from server.");
      }
      const data = await response.json();
      setEmissions(data);
    } catch (err) {
      console.error(err);
      setApiError(err.message || "Failed to connect to FastAPI backend. Make sure it is running.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Carbon Profile Baseline details
  const fetchProfile = async () => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/profile?user_id=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setHasProfile(data.has_profile);
        setBaselineDailyCO2(data.baseline_daily_co2_kg);
        setBaselineWeeklyCO2(data.baseline_weekly_co2_kg);
        
        if (data.has_profile && data.profile) {
          const p = data.profile;
          setCommuteMode(p.primary_commute || 'walking');
          setCommuteDistance(p.commute_distance || 0);
          setCommuteDays(p.commute_days || 0);
          setVehicleFuel(p.vehicle_fuel || 'petrol');
          setDietType(p.diet_type || 'vegetarian');
          setMeatFreq(p.meat_freq_per_week || 0);
          setCookingFuel(p.cooking_fuel || 'electric_induction');
          setHouseholdSize(p.household_size || 1);
          setWasteSegregation(p.waste_segregation || false);
          setWaterPeopleCount(p.water_people_count || 1);
          setWaterSource(p.water_source || 'municipal');
          setMonthlyOnlineOrders(p.monthly_online_orders || 0);
        }
      }
    } catch (err) {
      console.error("Error fetching baseline profile:", err);
    }
  };

  // Save Carbon Profile Details
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          primary_commute: commuteMode,
          commute_distance: parseFloat(commuteDistance),
          commute_days: parseFloat(commuteDays),
          vehicle_fuel: vehicleFuel,
          diet_type: dietType,
          meat_freq_per_week: parseFloat(meatFreq),
          cooking_fuel: cookingFuel,
          household_size: parseFloat(householdSize),
          waste_segregation: wasteSegregation,
          water_people_count: parseFloat(waterPeopleCount),
          water_source: waterSource,
          monthly_online_orders: parseFloat(monthlyOnlineOrders)
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to save baseline profile.");
      }

      await fetchProfile();
      setShowProfileModal(false);
      
      confetti({
        particleCount: 100,
        spread: 70,
        colors: ['#00f2fe', '#d946ef'],
        origin: { y: 0.8 }
      });
    } catch (err) {
      alert("Error saving profile: " + err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  // Accept and Complete Daily Challenge
  const handleCompleteChallenge = async () => {
    if (!activeChallenge || challengeCompleted) return;

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/challenges/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          category: activeChallenge.category,
          offset_kg: activeChallenge.offset_kg,
          text: activeChallenge.text
        })
      });

      if (!response.ok) {
        throw new Error("Failed to register completed challenge.");
      }

      setChallengeCompleted(true);
      fetchEmissions();

      confetti({
        particleCount: 150,
        spread: 90,
        colors: ['#10b981', '#00f2fe', '#f97316'],
        origin: { y: 0.8 }
      });

      // Show congratulations, then rotate to a new standby challenge after 2.5 seconds
      setTimeout(() => {
        const standbyChallenges = [
          { text: "Walk or cycle for short trips under 2 km today instead of driving.", offset_kg: 1.2, category: "transport" },
          { text: "Turn off all standby appliances, computer monitors, and chargers tonight.", offset_kg: 0.8, category: "energy" },
          { text: "Opt for a fully plant-based vegan or vegetarian meal for your next dinner.", offset_kg: 2.2, category: "food" },
          { text: "Segregate your dry recyclable packaging from organic kitchen waste today.", offset_kg: 0.5, category: "waste" },
          { text: "Take a shorter 5-minute shower today to save water heating energy.", offset_kg: 1.5, category: "energy" },
          { text: "Avoid ordering online delivery today; buy locally to save transit emissions.", offset_kg: 1.0, category: "transport" }
        ];
        
        // Filter out current challenge to avoid repeating
        const options = standbyChallenges.filter(c => c.text !== activeChallenge.text);
        const next = options[Math.floor(Math.random() * options.length)];
        
        setActiveChallenge(next);
        setChallengeCompleted(false);
      }, 2500);

    } catch (err) {
      alert("Error recording challenge completion: " + err.message);
    }
  };

  // Delete an emission record
  const handleDeleteLog = async (id) => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/emissions/${id}?user_id=${user.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setEmissions(prev => prev.filter(item => item.id !== id));
      } else {
        alert("Failed to delete the emission log.");
      }
    } catch (err) {
      console.error(err);
      alert("Error contacting the backend to delete log.");
    }
  };

  // Handle Login & Signup
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;

    setAuthLoading(true);
    setAuthError(null);
    setApiError(null);

    const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';

    try {
      const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      const loggedInUser = {
        id: data.user_id,
        email: data.email
      };

      localStorage.setItem('ecolog_user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = () => {
    localStorage.removeItem('ecolog_user');
    setUser(null);
    setEmissions([]);
    setAuthEmail('');
    setAuthPassword('');
    setAuthError(null);
    setHasProfile(false);
    setBaselineDailyCO2(0);
    setBaselineWeeklyCO2(0);
  };

  // Send message to AI endpoint
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatSending) return;

    const userMessageText = chatInput;
    setChatInput('');
    setChatSending(true);

    // Add user message to history
    setChatHistory(prev => [
      ...prev,
      {
        id: Date.now(),
        sender: 'user',
        text: userMessageText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          text: userMessageText
        })
      });

      if (!response.ok) {
        throw new Error("FastAPI Chat API encountered an error.");
      }

      const data = await response.json();

      // Add assistant response
      setChatHistory(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: data.explanation || `Successfully logged emissions! Total added: ${data.total_co2_kg} kg CO2.`,
          activities: data.activities,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      // Set recommended daily challenge returned by AI
      if (data.daily_challenge) {
        setActiveChallenge(data.daily_challenge);
        setChallengeCompleted(false);
      }

      fetchEmissions();

      if (data.total_co2_kg > 0) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.8 }
        });
      }

    } catch (err) {
      console.error(err);
      setChatHistory(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: "Sorry, I had trouble parsing that. Please make sure the backend FastAPI server is running.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setChatSending(false);
    }
  };

  // Upload receipt
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus({ type: 'loading', message: `Uploading & parsing ${file.name}...` });

    const formData = new FormData();
    formData.append("user_id", user.id);
    formData.append("email", user.email);
    formData.append("file", file);

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error("FastAPI image upload failed.");
      }

      const data = await response.json();
      setUploadStatus({ 
        type: 'success', 
        message: `Parsed successfully! Logged ${data.total_co2_kg} kg CO2 from receipt.` 
      });

      if (data.daily_challenge) {
        setActiveChallenge(data.daily_challenge);
        setChallengeCompleted(false);
      }

      fetchEmissions();

      setChatHistory(prev => [
        ...prev,
        {
          id: Date.now(),
          sender: 'assistant',
          text: `[Image Uploaded: ${file.name}]\n\n${data.explanation}`,
          activities: data.activities,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      confetti({
        particleCount: 120,
        spread: 90,
        colors: ['#d946ef', '#00f2fe', '#10b981'],
        origin: { y: 0.8 }
      });

    } catch (err) {
      console.error(err);
      setUploadStatus({ type: 'error', message: "Failed to parse receipt. Please verify image content." });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  // Deriving Stats (Note: challenge offsets are stored as negative numbers, so sum correctly computes net CO2!)
  const netLoggedEmissions = emissions.reduce((acc, curr) => acc + parseFloat(curr.co2_emissions_kg), 0);
  
  // Total calculated emissions = Daily Baseline baseline (in range) + net logged emissions
  let timeMultiplier = 30; // default for monthly
  if (timeRange === 'today') timeMultiplier = 1;
  else if (timeRange === 'weekly') timeMultiplier = 7;
  else if (timeRange === 'yearly') timeMultiplier = 365;
  else if (timeRange === 'all_time') timeMultiplier = emissions.length > 0 ? 30 : 0; // fallback to 30 days of baseline

  const totalBaselineContribution = baselineDailyCO2 * timeMultiplier;
  const totalCombinedCO2 = totalBaselineContribution + netLoggedEmissions;

  // Grouping emissions for PieChart (skipping offsets to keep proportions positive and readable)
  const categoryTotals = emissions.reduce((acc, curr) => {
    const cat = curr.category.toLowerCase();
    if (cat !== 'challenge_offset') {
      acc[cat] = (acc[cat] || 0) + parseFloat(curr.co2_emissions_kg);
    }
    return acc;
  }, {});

  // Add baseline food, transport, energy, waste baselines to the proportions for holistic representation
  if (hasProfile) {
    categoryTotals['food'] = (categoryTotals['food'] || 0) + (dietType === 'vegan' ? 0.5 : dietType === 'vegetarian' ? 0.8 : dietType === 'eggetarian' ? 1.2 : 1.8) * timeMultiplier;
    categoryTotals['transport'] = (categoryTotals['transport'] || 0) + (commuteMode === 'car' ? commuteDistance * 2 * commuteDays * (vehicleFuel === 'diesel' ? 0.171 : vehicleFuel === 'ev' ? 0.047 : vehicleFuel === 'cng' ? 0.120 : 0.170) / 7.0 : 0) * timeMultiplier;
    categoryTotals['energy'] = (categoryTotals['energy'] || 0) + ((cookingFuel === 'lpg' ? 1.5 : cookingFuel === 'png' ? 1.0 : 0.5) / householdSize) * timeMultiplier;
    categoryTotals['waste'] = (categoryTotals['waste'] || 0) + (wasteSegregation ? 0.1 : 0.3) * timeMultiplier;
  }

  const COLORS = {
    transport: '#00f2fe',
    energy: '#d946ef',
    food: '#10b981',
    waste: '#f97316'
  };

  const chartData = Object.keys(categoryTotals).map(cat => ({
    name: cat.toUpperCase(),
    value: parseFloat(categoryTotals[cat].toFixed(2)),
    color: COLORS[cat] || '#64748b'
  })).filter(d => d.value > 0);

  const activeCategoriesCount = chartData.length;

  const getCategoryIcon = (category) => {
    switch (category.toLowerCase()) {
      case 'transport': return <Car size={16} className="badge-transport" aria-hidden="true" />;
      case 'energy': return <Zap size={16} className="badge-energy" aria-hidden="true" />;
      case 'food': return <Utensils size={16} className="badge-food" aria-hidden="true" />;
      case 'challenge_offset': return <Award size={16} className="badge-food" aria-hidden="true" />;
      default: return <Leaf size={16} className="badge-waste" aria-hidden="true" />;
    }
  };

  // Auth Gate Rendering
  if (!user) {
    return (
      <div className="auth-gateway" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-card glass-panel">
          <div className="header-title-container" style={{ justifyContent: 'center' }}>
            <Leaf color="#00f2fe" size={32} aria-hidden="true" />
            <h1 id="auth-modal-title" className="auth-logo">EcoLog</h1>
          </div>
          <p className="auth-subtitle">
            {isSignUp 
              ? "Create a new account to begin tracking your daily carbon emission footprint."
              : "Sign in to access your AI carbon tracking metrics dashboard."
            }
          </p>

          {authError && (
            <div className="status-pill" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%', padding: '0.6rem', boxSizing: 'border-box' }} role="alert">
              <AlertCircle size={14} style={{ marginRight: '0.4rem' }} aria-hidden="true" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="auth-form" aria-label="User Credentials Authentication">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <label htmlFor="auth-email" className="sr-only">Email Address</label>
              <input 
                id="auth-email"
                type="email" 
                placeholder="Email Address" 
                className="auth-input"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                aria-required="true"
              />

              <label htmlFor="auth-password" className="sr-only">Password</label>
              <input 
                id="auth-password"
                type="password" 
                placeholder="Password" 
                className="auth-input"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            
            <button type="submit" className="submit-btn" disabled={authLoading} aria-label={isSignUp ? "Sign up as a new user" : "Sign in to your account"}>
              {authLoading ? "Processing..." : (isSignUp ? "Create Account" : "Sign In")}
            </button>
          </form>

          <div className="divider">
            <span 
              onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }} 
              style={{ cursor: 'pointer', color: '#00f2fe' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setIsSignUp(!isSignUp); setAuthError(null); } }}
              aria-label={isSignUp ? "Switch to Login screen" : "Switch to Registration screen"}
            >
              {isSignUp ? "Already have an account? Sign In" : "Need a new account? Sign Up"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header" role="banner">
        <div className="header-title-container">
          <Leaf color="#00f2fe" size={36} aria-hidden="true" />
          <h1 className="brand-icon">EcoLog</h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => setShowProfileModal(true)} 
            className="auth-btn" 
            style={{ borderColor: 'var(--color-transport)' }}
            aria-label="Open Carbon Profile Baseline settings"
          >
            <Settings size={16} aria-hidden="true" />
            <span>Profile Settings</span>
          </button>

          <div className="status-pill status-loading" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="sr-only">Logged in as</span>
            <span style={{ fontSize: '0.85rem' }}>{user.email}</span>
          </div>

          <button onClick={handleSignOut} className="auth-btn" aria-label="Sign out of your dashboard session">
            <LogOut size={16} aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* API Connection Warning */}
      {apiError && (
        <div className="glass-panel" style={{ padding: '1rem', borderColor: '#ef4444', display: 'flex', gap: '0.75rem', alignItems: 'center' }} role="alert">
          <AlertCircle color="#ef4444" size={24} aria-hidden="true" />
          <div>
            <h4 style={{ color: '#ef4444' }}>Backend Connection Error</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{apiError}</p>
          </div>
        </div>
      )}

      {/* Time filters bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="timeframe-select" className="sr-only">Filter Dashboard Time Range</label>
        <select 
          id="timeframe-select"
          className="filter-dropdown" 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)}
          aria-label="Filter dashboard timeline data"
        >
          <option value="today">Today</option>
          <option value="weekly">Past 7 Days</option>
          <option value="monthly">Past 30 Days</option>
          <option value="yearly">Past Year</option>
          <option value="all_time">All Time</option>
        </select>
      </div>

      {/* Metrics Row */}
      <section className="metrics-row" aria-label="Carbon footprint metrics summary">
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Total Carbon footprint: ${totalCombinedCO2.toFixed(1)} kilograms`}>
          <div className="metric-label">Total CO₂ Impact</div>
          <div className="metric-value" style={{ color: totalCombinedCO2 > (10 * timeMultiplier) ? '#ef4444' : '#10b981' }}>
            {totalCombinedCO2.toFixed(1)} <span className="metric-unit">kg CO₂</span>
          </div>
        </article>
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Daily Baseline Carbon Contribution: ${baselineDailyCO2.toFixed(1)} kilograms`}>
          <div className="metric-label">Estimated Daily Baseline</div>
          <div className="metric-value">
            {baselineDailyCO2.toFixed(1)} <span className="metric-unit">kg/day</span>
          </div>
        </article>
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Active Categories Count: ${activeCategoriesCount}`}>
          <div className="metric-label">Active Sources</div>
          <div className="metric-value">
            {activeCategoriesCount} <span className="metric-unit">Categories</span>
          </div>
        </article>
      </section>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Side (Charts, Table) */}
        <section className="main-column" aria-label="Emission logs and data visualization charts">
          {/* Chart Panel */}
          <article className="chart-panel glass-panel" aria-labelledby="chart-title">
            <div className="chart-header">
              <h3 id="chart-title">Total Footprint Proportions (Baseline + Logs)</h3>
              <Sparkles size={18} color="#d946ef" aria-hidden="true" />
            </div>

            {chartData.length > 0 ? (
              <div className="chart-container" role="img" aria-label="Pie chart showing relative proportions of transport, energy, food, and waste carbon footprints">
                {isMounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(10, 12, 16, 0.9)', 
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <div className="chart-container" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                Configure your Carbon Profile or add logs to display footprint breakdowns.
              </div>
            )}
          </article>

          {/* Logs Table */}
          <article className="logs-panel glass-panel" aria-labelledby="logs-table-title">
            <div className="logs-list-header">
              <h3 id="logs-table-title">Logged Activities</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {emissions.length} entries total
              </span>
            </div>

            <div className="logs-table-wrapper">
              {emissions.length > 0 ? (
                <table className="logs-table" aria-label="Table of logged carbon emission activities">
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Activity Type</th>
                      <th scope="col">Value Logged</th>
                      <th scope="col">CO₂ Offset/Load</th>
                      <th scope="col">Logged Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emissions.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <div className={`category-badge badge-${log.category.toLowerCase()}`}>
                            {getCategoryIcon(log.category)}
                            {log.category.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {log.sub_category.replace(/_/g, ' ')}
                        </td>
                        <td>
                          {log.input_value} {log.input_unit}
                        </td>
                        <td style={{ fontWeight: 600, color: parseFloat(log.co2_emissions_kg) < 0 ? '#10b981' : '#f8fafc' }}>
                          {log.co2_emissions_kg} kg
                        </td>
                        <td>
                          {new Date(log.logged_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td>
                          <button 
                            onClick={() => handleDeleteLog(log.id)} 
                            className="delete-btn" 
                            title="Delete log record"
                            aria-label={`Delete entry for ${log.sub_category.replace(/_/g, ' ')}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  No activities manually logged in this time range.
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Right Side (AI Chat, Challenge, File Uploader) */}
        <aside className="side-column" aria-label="AI Assist and Automated parsing tools">
          {/* Daily Challenge Card (Gamified Carbon offset feature) */}
          {activeChallenge && (
            <article className="glass-panel" style={{ padding: '1.5rem', border: challengeCompleted ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(0, 242, 254, 0.25)', position: 'relative', overflow: 'hidden' }} aria-labelledby="challenge-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Award color={challengeCompleted ? '#10b981' : '#00f2fe'} size={20} aria-hidden="true" />
                <h3 id="challenge-title" style={{ fontSize: '1.1rem', color: challengeCompleted ? '#10b981' : '#fff' }}>
                  {challengeCompleted ? "Daily Challenge Completed!" : "Recommended Daily Challenge"}
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                {activeChallenge.text}
              </p>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="status-pill status-loading" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                  <TrendingDown size={12} style={{ marginRight: '0.25rem' }} aria-hidden="true" />
                  <span>Saves {activeChallenge.offset_kg} kg CO₂</span>
                </span>
                
                <button
                  onClick={handleCompleteChallenge}
                  disabled={challengeCompleted}
                  className="auth-btn"
                  style={{ 
                    background: challengeCompleted ? 'rgba(16, 185, 129, 0.15)' : 'var(--gradient-primary)',
                    color: challengeCompleted ? '#10b981' : '#000',
                    border: 'none',
                    fontWeight: 600,
                    cursor: challengeCompleted ? 'default' : 'pointer'
                  }}
                  aria-label={challengeCompleted ? "Challenge is already completed" : "Mark this daily challenge as completed to reduce emissions"}
                >
                  {challengeCompleted ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <CheckCircle size={14} aria-hidden="true" />
                      <span>Completed</span>
                    </div>
                  ) : (
                    <span>I Did This!</span>
                  )}
                </button>
              </div>
            </article>
          )}

          {/* Chat Widget */}
          <article className="chat-panel glass-panel" aria-labelledby="chat-widget-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Sparkles color="#00f2fe" size={18} aria-hidden="true" />
              <h3 id="chat-widget-title">EcoLog AI Assistant</h3>
            </div>

            <div className="chat-history" role="log" aria-label="AI conversation log history">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`chat-message message-${msg.sender}`} tabIndex={0} aria-label={`${msg.sender === 'user' ? 'You said' : 'AI Assistant says'}: ${msg.text}`}>
                  <div className="message-bubble">
                    {msg.text}
                    {msg.activities && msg.activities.length > 0 && (
                      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }} aria-label="Calculated activity breakdown list">
                        {msg.activities.map((a, i) => (
                          <div key={i} className={`category-badge badge-${a.category.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                            {a.value} {a.unit} {a.sub_category.replace(/_/g, ' ')} → {a.co2_emissions_kg} kg CO₂
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="message-meta">{msg.timestamp}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-container" aria-label="AI Chat console">
              <label htmlFor="chat-input-field" className="sr-only">Type your activity here</label>
              <input
                id="chat-input-field"
                type="text"
                className="chat-input"
                placeholder="I rode a petrol car for 12 km today..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatSending}
                required
                aria-required="true"
              />
              <button type="submit" className="send-btn" disabled={chatSending || !chatInput.trim()} aria-label="Send text log to AI assistant">
                <Send size={16} aria-hidden="true" />
              </button>
            </form>
          </article>

          {/* Receipt OCR Vision Panel */}
          <article className="upload-panel glass-panel" aria-labelledby="upload-widget-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText color="#d946ef" size={18} aria-hidden="true" />
              <h3 id="upload-widget-title">Receipt & Bill Vision Parser</h3>
            </div>

            <div 
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { fileInputRef.current?.click(); } }}
              aria-label="Click or drag and drop files here to upload your utility bill or receipt statements"
            >
              <UploadCloud size={32} className="upload-icon" aria-hidden="true" />
              <div className="drop-text">Upload Utility Bill or Receipt</div>
              <div className="drop-subtext">Supports PNG, JPG, or PDF utility statements</div>
              
              <label htmlFor="receipt-file-input" className="sr-only">Select statement receipt image file</label>
              <input
                id="receipt-file-input"
                type="file"
                ref={fileInputRef}
                className="file-input"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </div>

            {uploadStatus && (
              <div 
                className={`status-pill ${uploadStatus.type === 'success' ? 'status-success' : 'status-loading'}`} 
                style={{ justifyContent: 'center', padding: '0.6rem', display: 'flex' }}
                role="status"
              >
                <span>{uploadStatus.message}</span>
              </div>
            )}
          </article>
        </aside>
      </div>

      {/* Carbon Baseline Profile Modal */}
      {showProfileModal && (
        <div className="auth-gateway" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="auth-card glass-panel" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings color="#00f2fe" size={24} aria-hidden="true" />
                <h2 id="modal-title" style={{ fontSize: '1.4rem' }}>Baseline Profile Setup</h2>
              </div>
              <button 
                onClick={() => setShowProfileModal(false)} 
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                aria-label="Close baseline configuration modal"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* 1. Commute Profile */}
              <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem' }}>
                <legend style={{ padding: '0 0.5rem', fontWeight: 600, color: '#00f2fe', fontSize: '0.9rem' }}>1. Commute Pattern</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div>
                    <label htmlFor="commute-mode" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Primary Commute</label>
                    <select 
                      id="commute-mode"
                      className="filter-dropdown" 
                      style={{ width: '100%' }}
                      value={commuteMode}
                      onChange={(e) => setCommuteMode(e.target.value)}
                    >
                      <option value="walking">Walking / Running</option>
                      <option value="car">Personal Car</option>
                      <option value="bike">Two-Wheeler (Motorbike)</option>
                      <option value="bus">Public Bus</option>
                      <option value="train">Local Train</option>
                      <option value="metro">Metro Transit</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="vehicle-fuel" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Fuel / Engine Type</label>
                    <select 
                      id="vehicle-fuel"
                      className="filter-dropdown" 
                      style={{ width: '100%' }}
                      value={vehicleFuel}
                      onChange={(e) => setVehicleFuel(e.target.value)}
                      disabled={commuteMode !== 'car' && commuteMode !== 'bike'}
                    >
                      <option value="petrol">Petrol</option>
                      <option value="diesel">Diesel</option>
                      <option value="EV">Electric (EV)</option>
                      <option value="CNG">CNG</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="commute-dist" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Roundtrip Distance (km)</label>
                    <input 
                      id="commute-dist"
                      type="number" 
                      min="0"
                      className="auth-input" 
                      style={{ width: '100%' }}
                      value={commuteDistance}
                      onChange={(e) => setCommuteDistance(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="commute-days" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Travel Days per Week</label>
                    <input 
                      id="commute-days"
                      type="number" 
                      min="0"
                      max="7"
                      className="auth-input" 
                      style={{ width: '100%' }}
                      value={commuteDays}
                      onChange={(e) => setCommuteDays(e.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              {/* 2. Diet Profile */}
              <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem' }}>
                <legend style={{ padding: '0 0.5rem', fontWeight: 600, color: '#10b981', fontSize: '0.9rem' }}>2. Diet Habits</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div>
                    <label htmlFor="diet-type" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Diet Categorization</label>
                    <select 
                      id="diet-type"
                      className="filter-dropdown" 
                      style={{ width: '100%' }}
                      value={dietType}
                      onChange={(e) => setDietType(e.target.value)}
                    >
                      <option value="vegan">Vegan</option>
                      <option value="vegetarian">Vegetarian</option>
                      <option value="eggetarian">Eggetarian (with Eggs)</option>
                      <option value="non-vegetarian">Non-Vegetarian</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="meat-freq" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Meat meals per week</label>
                    <input 
                      id="meat-freq"
                      type="number" 
                      min="0"
                      max="21"
                      className="auth-input" 
                      style={{ width: '100%' }}
                      value={meatFreq}
                      onChange={(e) => setMeatFreq(e.target.value)}
                      disabled={dietType !== 'non-vegetarian'}
                    />
                  </div>
                </div>
              </fieldset>

              {/* 3. Cooking, Waste & Water */}
              <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem' }}>
                <legend style={{ padding: '0 0.5rem', fontWeight: 600, color: '#d946ef', fontSize: '0.9rem' }}>3. Utility & Waste</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div>
                    <label htmlFor="cooking-fuel" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Cooking Fuel</label>
                    <select 
                      id="cooking-fuel"
                      className="filter-dropdown" 
                      style={{ width: '100%' }}
                      value={cookingFuel}
                      onChange={(e) => setCookingFuel(e.target.value)}
                    >
                      <option value="electric_induction">Electric Induction</option>
                      <option value="LPG">LPG Cylinder Gas</option>
                      <option value="PNG">PNG Piped Gas</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="house-size" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Household Size (Members)</label>
                    <input 
                      id="house-size"
                      type="number" 
                      min="1"
                      className="auth-input" 
                      style={{ width: '100%' }}
                      value={householdSize}
                      onChange={(e) => setHouseholdSize(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="water-source" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Water Source Type</label>
                    <select 
                      id="water-source"
                      className="filter-dropdown" 
                      style={{ width: '100%' }}
                      value={waterSource}
                      onChange={(e) => setWaterSource(e.target.value)}
                    >
                      <option value="municipal">Municipal / Pipeline</option>
                      <option value="tanker">Water Tanker Delivery</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                    <input 
                      id="waste-seg"
                      type="checkbox" 
                      style={{ transform: 'scale(1.25)', cursor: 'pointer' }}
                      checked={wasteSegregation}
                      onChange={(e) => setWasteSegregation(e.target.checked)}
                    />
                    <label htmlFor="waste-seg" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}>Segregate Waste (Yes)</label>
                  </div>
                </div>
              </fieldset>

              {/* 4. Shopping Profile */}
              <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem' }}>
                <legend style={{ padding: '0 0.5rem', fontWeight: 600, color: '#f97316', fontSize: '0.9rem' }}>4. Consumer Habits</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div>
                    <label htmlFor="online-shopping" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Monthly Online Orders</label>
                    <input 
                      id="online-shopping"
                      type="number" 
                      min="0"
                      className="auth-input" 
                      style={{ width: '100%' }}
                      value={monthlyOnlineOrders}
                      onChange={(e) => setMonthlyOnlineOrders(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShoppingBag size={20} color="#f97316" aria-hidden="true" />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Estimated carbon footprint for package delivery and courier transit.</span>
                  </div>
                </div>
              </fieldset>

              <button 
                type="submit" 
                className="submit-btn" 
                disabled={profileSaving}
                aria-label="Save carbon baseline details and close dialog"
                style={{ marginTop: '1rem', background: 'var(--gradient-primary)', fontWeight: 600 }}
              >
                {profileSaving ? "Saving details..." : "Save Baseline Profile"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
