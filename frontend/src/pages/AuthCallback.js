import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      
      // Extract session_id from URL fragment
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));
      const sessionId = params.get('session_id');

      if (!sessionId) {
        toast.error('No session ID found');
        navigate('/auth');
        return;
      }

      try {
        // Exchange session_id for user data and set cookie
        const response = await axios.post(
          `${API}/auth/google/session`,
          {},
          {
            headers: {
              'X-Session-ID': sessionId
            },
            withCredentials: true  // Important for cookies
          }
        );

        const user = response.data;
        
        // Store auth flag
        axios.defaults.headers.common['Authorization'] = ''; // Don't need JWT anymore
        
        toast.success(`Welcome, ${user.name}!`);
        
        // Redirect to chat with user data
        navigate('/chat', { state: { user }, replace: true });
        
      } catch (error) {
        console.error('Auth callback error:', error);
        toast.error('Authentication failed');
        navigate('/auth');
      }
    };

    processSession();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
