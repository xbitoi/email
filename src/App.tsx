import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mail, 
  Calendar, 
  Clock, 
  Send, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  LogOut,
  Settings,
  LayoutDashboard,
  History,
  Loader2,
  Copy
} from "lucide-react";
import { format } from "date-fns";

interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduled_at: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_days?: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  error?: string;
}

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    const saved = localStorage.getItem("gmail_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');

  // Form state
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>([]);

  // Config state
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem("google_config_draft");
    return saved ? JSON.parse(saved) : { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" };
  });
  const [configLoading, setConfigLoading] = useState(false);

  const [debugInfo, setDebugInfo] = useState<{
    detected_redirect_uri: string;
    client_id_prefix: string;
  } | null>(null);

  useEffect(() => {
    const fetchDebug = async () => {
      try {
        const res = await fetch("/api/debug/info");
        const data = await res.json();
        setDebugInfo(data);
      } catch (e) {
        console.error("Failed to fetch debug info");
      }
    };
    fetchDebug();
  }, []);

  useEffect(() => {
    fetchConfig();
    
    // Check for auth success in URL fragment (direct redirect flow)
    const hash = window.location.hash;
    if (hash.startsWith('#auth_success=')) {
      try {
        const base64Data = hash.replace('#auth_success=', '');
        const userData = JSON.parse(atob(base64Data));
        if (userData.type === 'OAUTH_AUTH_SUCCESS') {
          const user = { id: userData.userId, email: userData.email };
          setUser(user);
          localStorage.setItem("gmail_user", JSON.stringify(user));
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) {
        console.error("Failed to parse auth data from URL", err);
      }
    } else if (hash.startsWith('#auth_error=')) {
      try {
        const base64Data = hash.replace('#auth_error=', '');
        const errorData = JSON.parse(atob(base64Data));
        alert(`Authentication Error: ${errorData.error === 'access_denied' ? 'Access Denied. Please make sure you are an authorized test user.' : errorData.error}`);
        window.history.replaceState(null, '', window.location.pathname);
      } catch (err) {
        console.error("Failed to parse error data from URL", err);
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const userData = { id: event.data.userId, email: event.data.email };
        setUser(userData);
        localStorage.setItem("gmail_user", JSON.stringify(userData));
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        alert(`Authentication Error: ${event.data.error === 'access_denied' ? 'Access Denied. Please make sure you are an authorized test user.' : event.data.error}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (user) {
      fetchEmails();
    }
  }, [user]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.GOOGLE_CLIENT_ID || data.GOOGLE_CLIENT_SECRET) {
        setConfig(data);
        localStorage.setItem("google_config_draft", JSON.stringify(data));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync config to localStorage for draft persistence
  useEffect(() => {
    localStorage.setItem("google_config_draft", JSON.stringify(config));
  }, [config]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        alert("Configuration saved successfully!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save configuration.");
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchEmails = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/scheduled/${user.id}`);
      const data = await res.json();
      setEmails(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnect = async () => {
    console.log("Initiating Gmail connection...");
    setLoading(true);
    try {
      // Pass the current origin to the server so it can construct the correct redirect URI
      const currentOrigin = window.location.origin;
      const res = await fetch(`/api/auth/url?origin=${encodeURIComponent(currentOrigin)}`);
      const data = await res.json();
      console.log("Auth URL received:", data.url);
      
      if (data.error) {
        alert(`Connection Error: ${data.error}`);
        return;
      }

      if (data.url) {
        // Use a popup for OAuth as per user request to avoid 403 errors on redirect
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;
        
        const popup = window.open(
          data.url,
          "google_oauth",
          `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
        );

        if (!popup) {
          alert("Popup blocked! Please allow popups for this site to connect your account.");
        }
      } else {
        alert("Failed to get authorization URL.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while connecting to Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to log out?")) {
      setUser(null);
      localStorage.removeItem("gmail_user");
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please connect your Gmail account first.");
      return;
    }
    setLoading(true);
    try {
      console.log("Scheduling email...", { recipient, subject, scheduledAt, extraTimes, recurrence });
      
      const allTimes = [scheduledAt, ...extraTimes].filter(t => t);
      
      for (const time of allTimes) {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            recipient,
            subject,
            body,
            scheduledAt: time,
            recurrence,
            recurrenceDays: recurrence === 'weekly' ? recurrenceDays.join(',') : null
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          alert(`Failed to schedule email for time ${time}: ${errorData.error || res.statusText}`);
        }
      }
      
      alert("Email(s) scheduled successfully!");
      setIsModalOpen(false);
      fetchEmails();
      // Reset form
      setRecipient("");
      setSubject("");
      setBody("");
      setScheduledAt("");
      setExtraTimes([]);
      setRecurrence('none');
      setRecurrenceDays([]);
    } catch (err: any) {
      console.error(err);
      alert(`An error occurred: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled email?")) return;
    try {
      const res = await fetch(`/api/scheduled/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchEmails();
      } else {
        alert("Failed to delete email.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting.");
    }
  };

  // Remove the initial user check gate and show the UI by default
  // We'll use a "guest" mode if no user is found
  
  const pendingEmails = emails.filter(e => e.status === 'pending');
  const historyEmails = emails.filter(e => e.status !== 'pending');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex relative">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed md:relative w-64 h-full border-r border-zinc-800 p-6 flex flex-col z-50 bg-[#0a0a0a] transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Mail className="w-6 h-6 text-black" />
            </div>
            <span className="font-bold text-xl">ProMail</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 hover:bg-zinc-800 rounded-lg">
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'dashboard' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'history' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          >
            <History className="w-5 h-5" />
            History
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'settings' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          {user ? (
            <>
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold">
                  {user.email[0].toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate">{user.email}</p>
                  <p className="text-xs text-zinc-500">Connected</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </>
          ) : (
            <button 
              onClick={handleConnect}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
              Connect Gmail
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 border-b border-zinc-800 px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 hover:bg-zinc-800 rounded-lg">
              <LayoutDashboard className="w-6 h-6" />
            </button>
            <div className="flex flex-col">
              <h2 className="text-xl md:text-2xl font-bold">
                {activeTab === 'dashboard' ? 'Scheduled Emails' : activeTab === 'history' ? 'Email History' : 'Settings'}
              </h2>
              {!user && activeTab !== 'settings' && <p className="text-[10px] md:text-xs text-emerald-500 animate-pulse">Connect Gmail to start scheduling</p>}
            </div>
          </div>
          {activeTab !== 'settings' && (
            <button 
              onClick={() => user ? setIsModalOpen(true) : handleConnect()}
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              {user ? 'Schedule New' : 'Connect to Schedule'}
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'settings' ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-6 h-6 text-emerald-500" />
                <h3 className="text-xl font-bold">Google OAuth Configuration</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-8">
                Enter your Google Cloud Console credentials here. You can find these in the 
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-emerald-500 hover:underline mx-1">Credentials</a> 
                section of your project.
              </p>
              
              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Client ID</label>
                  <input
                    type="text"
                    value={config.GOOGLE_CLIENT_ID}
                    onChange={(e) => setConfig({ ...config, GOOGLE_CLIENT_ID: e.target.value })}
                    placeholder="xxxx-xxxx.apps.googleusercontent.com"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Client Secret</label>
                  <input
                    type="password"
                    value={config.GOOGLE_CLIENT_SECRET}
                    onChange={(e) => setConfig({ ...config, GOOGLE_CLIENT_SECRET: e.target.value })}
                    placeholder="••••••••••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                
                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={configLoading}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {configLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings className="w-5 h-5" />}
                    Save Configuration
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("gmail_user");
                      alert("Connection reset. Please try connecting again.");
                      window.location.reload();
                    }}
                    className="px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 border border-zinc-700"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Reset Connection</span>
                  </button>
                </div>
              </form>

              {/* Troubleshooting Section */}
              <div className="mt-8 pt-8 border-t border-zinc-800">
                <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Troubleshooting 403 Errors
                </h3>
                <div className="space-y-4 text-sm text-zinc-400 bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
                  <p>If you still see a 403 error after clicking "Connect Now", please verify these 3 things in your Google Cloud Console:</p>
                  
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-zinc-200">1</div>
                      <div>
                        <p className="text-zinc-200 font-medium">Add Test User (CRITICAL)</p>
                        <p>Go to <span className="text-emerald-500">OAuth consent screen</span>, scroll to <span className="text-emerald-500">Test users</span>, and add your email address. 403 error means Google doesn't see you in this list.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-zinc-200">2</div>
                      <div className="flex-1">
                        <p className="text-zinc-200 font-medium">Verify Redirect URI</p>
                        <p>In your OAuth Client settings, ensure this EXACT URL is in the "Authorized redirect URIs" list:</p>
                        <div className="flex gap-2 mt-2">
                          <code className="flex-1 bg-black p-3 rounded-xl border border-zinc-800 text-emerald-500 break-all font-mono text-xs">
                            {debugInfo?.detected_redirect_uri || `${window.location.origin}/auth/callback`}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(debugInfo?.detected_redirect_uri || `${window.location.origin}/auth/callback`);
                              alert("Redirect URI copied!");
                            }}
                            className="px-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        {debugInfo && (
                          <p className="text-[10px] text-zinc-500 mt-1">
                            Server detected: {debugInfo.detected_redirect_uri}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-zinc-200">3</div>
                      <div>
                        <p className="text-zinc-200 font-medium">Enable Gmail API</p>
                        <p>Make sure the <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-emerald-500 underline">Gmail API</a> is enabled in your Google Cloud Project Library.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-zinc-200">4</div>
                      <div>
                        <p className="text-zinc-200 font-medium">Brave Browser / VPN</p>
                        <p>If using Brave, disable <span className="text-emerald-500">Shields</span> for this site. If using a VPN, try disabling it temporarily during connection.</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-zinc-800/50">
                    <button
                      type="button"
                      onClick={() => {
                        console.log("Wiping all local data...");
                        localStorage.clear();
                        alert("All data cleared. The app will now restart.");
                        window.location.reload();
                      }}
                      className="text-red-500 hover:text-red-400 text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Wipe all local data and start fresh
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl">
                <h4 className="text-lg font-bold text-amber-500 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Fixing "403: Access Denied"
                </h4>
                <ul className="space-y-4 text-sm text-zinc-400">
                  <li className="flex gap-3">
                    <span className="text-amber-500 font-bold">1.</span>
                    <span>
                      <strong>Add Test User:</strong> This is the most common cause. Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" className="text-amber-500 hover:underline">OAuth consent screen</a>, scroll to <b>Test users</b>, and add your email.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-amber-500 font-bold">2.</span>
                    <span>
                      <strong>Check Redirect URI:</strong> Copy the URL below and paste it into "Authorized redirect URIs" in your <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-amber-500 hover:underline">Google Credentials</a>.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-amber-500 font-bold">3.</span>
                    <span>
                      <strong>Enable Gmail API:</strong> Ensure the <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" className="text-amber-500 hover:underline">Gmail API</a> is enabled for your project.
                    </span>
                  </li>
                </ul>

                <div className="mt-6 p-5 bg-black/40 border-2 border-amber-500/30 rounded-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                    <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Required Redirect URI:</h4>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4">
                    Copy this EXACT URL and paste it into "Authorized redirect URIs" in your Google Cloud Console. 
                    The app is configured to use this specific link.
                  </p>
                  <div className="flex items-center justify-between gap-4 bg-black/60 p-3 rounded-xl border border-white/5">
                    <code className="text-xs break-all text-amber-400 font-mono">
                      {window.location.origin}/auth/callback
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/auth/callback`);
                        alert("Copied to clipboard!");
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-all shrink-0"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-8">
              {!user && activeTab === 'dashboard' && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
                      <Mail className="w-8 h-8 text-black" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">Connect your Gmail Account</h3>
                      <p className="text-zinc-400 text-sm max-w-md">
                        {(!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) 
                          ? "First, you need to configure your Google API keys in the settings."
                          : "Link your account to start scheduling professional emails. Note: You MUST add your email to 'Test Users' in Google Console to avoid 403 errors."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {(!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) ? (
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="bg-emerald-500 text-black font-bold px-8 py-3 rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2 shrink-0"
                      >
                        <Settings className="w-5 h-5" />
                        Go to Settings
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleConnect}
                          disabled={loading}
                          className="bg-white text-black font-bold px-8 py-3 rounded-xl hover:bg-zinc-200 transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="G" />}
                          Connect Now
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("This will clear your current session. You will need to connect again. Continue?")) {
                              console.log("Resetting connection...");
                              localStorage.removeItem("gmail_user");
                              alert("Connection reset. Please try connecting again.");
                              window.location.reload();
                            }
                          }}
                          className="bg-zinc-800 text-zinc-400 font-bold px-6 py-3 rounded-xl hover:bg-zinc-700 transition-all flex items-center gap-2 shrink-0 border border-zinc-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Reset Connection</span>
                        </button>
                        <a 
                          href="https://accounts.google.com/Logout" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-zinc-500 hover:text-zinc-300 underline flex items-center gap-1"
                        >
                          Sign out of Google
                        </a>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <AnimatePresence mode="popLayout">
                  {(activeTab === 'dashboard' ? pendingEmails : historyEmails).map((email) => (
                    <motion.div
                      key={email.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex items-center gap-6 group hover:border-zinc-700 transition-colors"
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        email.status === 'sent' ? 'bg-emerald-500/10 text-emerald-500' :
                        email.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {email.status === 'sent' ? <CheckCircle2 className="w-6 h-6" /> :
                         email.status === 'failed' ? <AlertCircle className="w-6 h-6" /> :
                         <Clock className="w-6 h-6" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">{email.recipient}</span>
                          <span className="text-zinc-500 text-sm">•</span>
                          <span className="text-zinc-500 text-sm truncate">{email.subject}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(email.scheduled_at), "MMM d, yyyy")}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(email.scheduled_at), "h:mm a")}
                          </div>
                          {email.recurrence && email.recurrence !== 'none' && (
                            <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                              <History className="w-2 h-2" />
                              {email.recurrence}
                            </div>
                          )}
                          {email.status === 'sent' && (
                            <div className="text-emerald-500">Sent at {format(new Date(email.sent_at!), "h:mm a")}</div>
                          )}
                          {email.status === 'failed' && (
                            <div className="text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {email.error}
                            </div>
                          )}
                        </div>
                      </div>

                      {email.status === 'pending' && (
                        <button 
                          onClick={() => handleDelete(email.id)}
                          className="p-3 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {(activeTab === 'dashboard' ? pendingEmails : historyEmails).length === 0 && (
                  <div className="text-center py-20 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-3xl">
                    <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h3 className="text-lg font-medium text-zinc-400">No emails found</h3>
                    <p className="text-zinc-600 text-sm">Start scheduling your emails to see them here.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-xl font-bold">Schedule Email</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <form onSubmit={handleSchedule} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">Recipient Email</label>
                    <input
                      required
                      type="email"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">Schedule Date & Time</label>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          required
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setExtraTimes([...extraTimes, ""])}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-4 rounded-xl border border-zinc-700 transition-all"
                          title="Add another time"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {extraTimes.map((time, idx) => (
                        <div key={idx} className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                          <input
                            required
                            type="datetime-local"
                            value={time}
                            onChange={(e) => {
                              const newTimes = [...extraTimes];
                              newTimes[idx] = e.target.value;
                              setExtraTimes(newTimes);
                            }}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setExtraTimes(extraTimes.filter((_, i) => i !== idx))}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 rounded-xl border border-red-500/20 transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recurrence Settings */}
                <div className="space-y-4 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-500" />
                      Recurrence Settings
                    </label>
                    <select 
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value as any)}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="none">No Recurrence</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  {recurrence === 'weekly' && (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500">Select days of the week:</p>
                      <div className="flex flex-wrap gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const dayStr = idx.toString();
                              setRecurrenceDays(prev => 
                                prev.includes(dayStr) 
                                  ? prev.filter(d => d !== dayStr) 
                                  : [...prev, dayStr]
                              );
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              recurrenceDays.includes(idx.toString())
                                ? 'bg-emerald-500 text-black'
                                : 'bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-zinc-500'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {recurrence !== 'none' && (
                    <p className="text-[10px] text-zinc-500 italic">
                      * This email will automatically reschedule itself after being sent.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Subject</label>
                  <input
                    required
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Project Update - Q1"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Message Body</label>
                  <textarea
                    required
                    rows={6}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your message here..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Schedule Email
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
