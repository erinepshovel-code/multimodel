import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Configure axios defaults
axios.defaults.withCredentials = true;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    
    // First check if we have a JWT token
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      setToken(storedToken);
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }
    
    // Otherwise, check if we have a session cookie (Google OAuth)
    try {
      const response = await axios.get(`${API}/auth/me`);
      if (response.data) {
        setUser(response.data);
        setIsAuthenticated(true);
      }
    } catch (error) {
      // Not authenticated
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const response = await axios.post(`${API}/auth/login`, { username, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    setIsAuthenticated(true);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const register = async (username, password) => {
    const response = await axios.post(`${API}/auth/register`, { username, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    setIsAuthenticated(true);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const logout = async () => {
    try {
      // Try to logout from backend (for cookie sessions)
      await axios.post(`${API}/auth/logout`);
    } catch (error) {
      // Ignore errors
    }
    
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, isAuthenticated, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
