'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  createClient 
} from '@supabase/supabase-js';
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
  Trash
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Conditionally initialize Supabase client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export default function Dashboard() {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Application State
  const [timeRange, setTimeRange] = useState('all_time');
  const [emissions, setEmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isMounted, setIsMounted] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: "Hello! I am EcoLog AI. Tell me what you did today, e.g., 'I drove 45 km in a diesel car' or 'Cooked 3 vegetarian meals', and I will calculate and log the carbon emissions for you! You can also upload a utility bill or receipt below.",
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
    
    // Check if real Supabase client is initialized
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            isSimulated: false
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            isSimulated: false
          });
        } else {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // Check for simulated session in LocalStorage
      const savedUser = localStorage.getItem('ecolog_simulated_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    }
  }, []);

  // Fetch Emissions Log whenever User or timeRange changes
  useEffect(() => {
    if (user) {
      fetchEmissions();
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

  // Handle Simulated / Supabase Auth
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authEmail) return;

    setAuthLoading(true);
    setApiError(null);

    if (supabase) {
      try {
        if (isSignUp) {
          const { error } = await supabase.auth.signUp({
            email: authEmail,
            password: authPassword
          });
          if (error) throw error;
          alert("Sign up successful! Please check your email for verification.");
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword
          });
          if (error) throw error;
        }
      } catch (err) {
        setApiError(err.message);
      } finally {
        setAuthLoading(false);
      }
    } else {
      // Simulate login for offline developer testing
      // Hash a dummy user ID based on email name
      const simulatedUser = {
        id: `usr_${btoa(authEmail).replace(/=/g, '').slice(0, 10)}`,
        email: authEmail,
        isSimulated: true
      };
      localStorage.setItem('ecolog_simulated_user', JSON.stringify(simulatedUser));
      setUser(simulatedUser);
      setAuthLoading(false);
      
      // Trigger a confetti success burst on login
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('ecolog_simulated_user');
      setUser(null);
    }
    setEmissions([]);
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

      // Refetch table/chart data
      fetchEmissions();

      // Success Confetti!
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
        message: `Parsed successfully! Logged ${data.total_co2_kg} kg CO2 from receipt/bill.` 
      });

      // Refetch logs & charts
      fetchEmissions();

      // Add to Chat history contextually
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

  // Deriving Stats
  const totalCO2 = emissions.reduce((acc, curr) => acc + parseFloat(curr.co2_emissions_kg), 0);

  // Grouping emissions for PieChart
  const categoryTotals = emissions.reduce((acc, curr) => {
    const cat = curr.category.toLowerCase();
    acc[cat] = (acc[cat] || 0) + parseFloat(curr.co2_emissions_kg);
    return acc;
  }, {});

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
  }));

  const activeCategoriesCount = Object.keys(categoryTotals).filter(cat => categoryTotals[cat] > 0).length;

  const getCategoryIcon = (category) => {
    switch (category.toLowerCase()) {
      case 'transport': return <Car size={16} className="badge-transport" />;
      case 'energy': return <Zap size={16} className="badge-energy" />;
      case 'food': return <Utensils size={16} className="badge-food" />;
      default: return <Leaf size={16} className="badge-waste" />;
    }
  };

  // Auth Gate Rendering
  if (!user) {
    return (
      <div className="auth-gateway">
        <div className="auth-card glass-panel">
          <div className="header-title-container" style={{ justifyContent: 'center' }}>
            <Leaf color="#00f2fe" size={32} />
            <div className="auth-logo">EcoLog</div>
          </div>
          <p className="auth-subtitle">
            {supabase 
              ? "Sign in using your Supabase account to sync your carbon tracker with the cloud database."
              : "Welcome! The database configuration is using local SQLite storage. Choose an email to start tracking instantly on your laptop."
            }
          </p>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <input 
              type="email" 
              placeholder="Email address" 
              className="auth-input"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
            />
            {supabase && (
              <input 
                type="password" 
                placeholder="Password" 
                className="auth-input"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            )}
            
            <button type="submit" className="submit-btn" disabled={authLoading}>
              {authLoading ? "Authenticating..." : (supabase ? (isSignUp ? "Sign Up" : "Sign In") : "Launch App")}
            </button>
          </form>

          {supabase && (
            <div className="divider">
              <span onClick={() => setIsSignUp(!isSignUp)} style={{ cursor: 'pointer', color: '#00f2fe' }}>
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </span>
            </div>
          )}

          {!supabase && (
            <div className="status-pill status-loading" style={{ margin: '0.5rem auto' }}>
              <Clock size={12} />
              <span>Running in Zero-Config Local Storage Mode</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-title-container">
          <Leaf color="#00f2fe" size={36} />
          <div className="brand-icon">EcoLog</div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="status-pill status-loading" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <User size={14} />
            <span>{user.email} {user.isSimulated && "(Local)"}</span>
          </div>

          <button onClick={handleSignOut} className="auth-btn">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* API Connection Warning */}
      {apiError && (
        <div className="glass-panel" style={{ padding: '1rem', borderColor: '#ef4444', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertCircle color="#ef4444" size={24} />
          <div>
            <h4 style={{ color: '#ef4444' }}>Backend Connection Error</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{apiError}</p>
          </div>
        </div>
      )}

      {/* Time filters bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <select 
          className="filter-dropdown" 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="today">Today</option>
          <option value="weekly">Past 7 Days</option>
          <option value="monthly">Past 30 Days</option>
          <option value="yearly">Past Year</option>
          <option value="all_time">All Time</option>
        </select>
      </div>

      {/* Metrics Row */}
      <section className="metrics-row">
        <div className="metric-card glass-panel">
          <div className="metric-label">Total CO2 Emitted</div>
          <div className="metric-value">
            {totalCO2.toFixed(1)} <span className="metric-unit">kg CO₂</span>
          </div>
        </div>
        <div className="metric-card glass-panel">
          <div className="metric-label">Active Sources</div>
          <div className="metric-value">
            {activeCategoriesCount} <span className="metric-unit">Categories</span>
          </div>
        </div>
        <div className="metric-card glass-panel">
          <div className="metric-label">Recent Activity</div>
          <div className="metric-value" style={{ fontSize: '1.25rem', marginTop: '1rem', fontWeight: 500 }}>
            {emissions.length > 0 ? (
              <span style={{ textTransform: 'capitalize' }}>
                {emissions[0].sub_category.replace(/_/g, ' ')} ({emissions[0].co2_emissions_kg} kg)
              </span>
            ) : "No logs recorded"}
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <main className="dashboard-grid">
        {/* Left Side (Charts, Table) */}
        <div className="main-column">
          {/* Chart Panel */}
          <div className="chart-panel glass-panel">
            <div className="chart-header">
              <h3>Carbon Emission Proportions</h3>
              <Sparkles size={18} color="#d946ef" />
            </div>

            {chartData.length > 0 ? (
              <div className="chart-container">
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
                Start adding logs using the chat assistant or receipt uploader to populate data.
              </div>
            )}
          </div>

          {/* Logs Table */}
          <div className="logs-panel glass-panel">
            <div className="logs-list-header">
              <h3>Emission Log Files</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {emissions.length} entries total
              </span>
            </div>

            <div className="logs-table-wrapper">
              {emissions.length > 0 ? (
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Activity Type</th>
                      <th>Value Logged</th>
                      <th>CO2 Generated</th>
                      <th>Logged Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emissions.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <div className={`category-badge badge-${log.category.toLowerCase()}`}>
                            {getCategoryIcon(log.category)}
                            {log.category}
                          </div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {log.sub_category.replace(/_/g, ' ')}
                        </td>
                        <td>
                          {log.input_value} {log.input_unit}
                        </td>
                        <td style={{ fontWeight: 600 }}>
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
                            title="Delete record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  No activities logged in this time range.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side (AI Chat & File Uploader) */}
        <div className="side-column">
          {/* Chat Widget */}
          <div className="chat-panel glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Sparkles color="#00f2fe" size={18} />
              <h3>EcoLog AI Assistant</h3>
            </div>

            <div className="chat-history">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`chat-message message-${msg.sender}`}>
                  <div className="message-bubble">
                    {msg.text}
                    {msg.activities && msg.activities.length > 0 && (
                      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
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

            <form onSubmit={handleSendMessage} className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                placeholder="I rode a petrol car for 12 km today..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatSending}
              />
              <button type="submit" className="send-btn" disabled={chatSending || !chatInput.trim()}>
                <Send size={16} />
              </button>
            </form>
          </div>

          {/* Receipt OCR Vision Panel */}
          <div className="upload-panel glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText color="#d946ef" size={18} />
              <h3>Receipt & Bill Vision Parser</h3>
            </div>

            <div 
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={32} className="upload-icon" />
              <div className="drop-text">Upload Utility Bill or Receipt</div>
              <div className="drop-subtext">Supports PNG, JPG, or PDF utility statements</div>
              
              <input
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
              >
                <span>{uploadStatus.message}</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
