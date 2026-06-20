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
  User
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
    const savedUser = localStorage.getItem('ecolog_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
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
        message: `Parsed successfully! Logged ${data.total_co2_kg} kg CO2 from receipt/bill.` 
      });

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

  // Deriving Stats
  const totalCO2 = emissions.reduce((acc, curr) => acc + parseFloat(curr.co2_emissions_kg), 0);

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
      case 'transport': return <Car size={16} className="badge-transport" aria-hidden="true" />;
      case 'energy': return <Zap size={16} className="badge-energy" aria-hidden="true" />;
      case 'food': return <Utensils size={16} className="badge-food" aria-hidden="true" />;
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

          {/* Auth Error Notification */}
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

          {/* Toggle login vs signup */}
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
          <span className="brand-icon">EcoLog</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Total Carbon dioxide emitted: ${totalCO2.toFixed(1)} kilograms`}>
          <div className="metric-label">Total CO2 Emitted</div>
          <div className="metric-value">
            {totalCO2.toFixed(1)} <span className="metric-unit">kg CO₂</span>
          </div>
        </article>
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Number of active emission categories: ${activeCategoriesCount}`}>
          <div className="metric-label">Active Sources</div>
          <div className="metric-value">
            {activeCategoriesCount} <span className="metric-unit">Categories</span>
          </div>
        </article>
        <article className="metric-card glass-panel" tabIndex={0} aria-label={`Most recent logged activity: ${emissions.length > 0 ? emissions[0].sub_category.replace(/_/g, ' ') : 'No logs recorded'}`}>
          <div className="metric-label">Recent Activity</div>
          <div className="metric-value" style={{ fontSize: '1.25rem', marginTop: '1rem', fontWeight: 500 }}>
            {emissions.length > 0 ? (
              <span style={{ textTransform: 'capitalize' }}>
                {emissions[0].sub_category.replace(/_/g, ' ')} ({emissions[0].co2_emissions_kg} kg)
              </span>
            ) : "No logs recorded"}
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
              <h3 id="chart-title">Carbon Emission Proportions</h3>
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
                Start adding logs using the chat assistant or receipt uploader to populate data.
              </div>
            )}
          </article>

          {/* Logs Table */}
          <article className="logs-panel glass-panel" aria-labelledby="logs-table-title">
            <div className="logs-list-header">
              <h3 id="logs-table-title">Emission Log Files</h3>
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
                      <th scope="col">CO2 Generated</th>
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
                            title="Delete log record"
                            aria-label={`Delete emission entry for ${log.sub_category.replace(/_/g, ' ')}`}
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
                  No activities logged in this time range.
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Right Side (AI Chat & File Uploader) */}
        <aside className="side-column" aria-label="AI Assist and Automated parsing tools">
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
    </main>
  );
}
