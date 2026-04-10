import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaLevel, setMfaLevel] = useState('aal1'); // Default level
  const [hasMfaEnrolled, setHasMfaEnrolled] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Supabase v2 onAuthStateChange handles the initial session automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session) {
          // Solo verificamos MFA si hay una sesión activa para evitar bloqueos innecesarios
          try {
            const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (!mfaError && mfaData) {
              setMfaLevel(mfaData.currentLevel || 'aal1');
              setHasMfaEnrolled((mfaData.nextLevel || mfaData.currentLevel) === 'aal2');
            }
          } catch (mfaErr) {
            console.warn('MFA status check deferred');
          }
        } else {
          setMfaLevel('aal1');
          setHasMfaEnrolled(false);
        }
      } catch (err) {
        console.error('Auth sync error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    mfaLevel,
    hasMfaEnrolled,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};
