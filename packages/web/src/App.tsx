import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import GenerateScreen from './screens/GenerateScreen';
import StoryScreen from './screens/StoryScreen';
import LibraryScreen from './screens/LibraryScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import PaywallScreen from './screens/PaywallScreen';

// Floating confetti background
function ConfettiBg() {
  useEffect(() => {
    const bg = document.getElementById('confetti-bg');
    if (!bg || bg.children.length > 0) return;
    const colors = ['#ffd53d', '#ff6b6b', '#4ecdc4', '#a8a4ff', '#ffffff'];
    for (let i = 0; i < 25; i++) {
      const el = document.createElement('div');
      el.className = 'conf';
      const size = 4 + Math.random() * 10;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.left = `${Math.random() * 100}%`;
      el.style.top = `${Math.random() * 100}%`;
      el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      el.style.setProperty('--dur', `${3 + Math.random() * 5}s`);
      el.style.animationDelay = `${Math.random() * 4}s`;
      el.style.transform = `rotate(${Math.random() * 360}deg)`;
      bg.appendChild(el);
    }
  }, []);
  return <div id="confetti-bg" className="confetti-bg" />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="phone" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-dots">
          <div className="ldot" /><div className="ldot" /><div className="ldot" /><div className="ldot" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="phone">
        <AuthScreen />
      </div>
    );
  }

  return (
    <div className="phone">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/generate" element={<GenerateScreen />} />
        <Route path="/story/:id" element={<StoryScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/profile/:id" element={<ProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/paywall" element={<PaywallScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfettiBg />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
