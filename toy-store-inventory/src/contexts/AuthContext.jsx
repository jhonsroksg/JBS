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
    // Escuchar cambios en la sesión
    const setData = async () => {
      try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) {
            setSession(null);
            setUser(null);
            setMfaLevel('aal1');
            setHasMfaEnrolled(false);
          } else {
            setSession(session);
            setUser(session.user);
            
            try {
              const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
              setMfaLevel(mfaData?.currentLevel || 'aal1');
              setHasMfaEnrolled((mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2');
            } catch (mfaErr) {
              console.warn('MFA check failed during init:', mfaErr);
            }
          }
      } catch (err) {
        console.warn('Auth init failed:', err);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    const { data: { listener } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session) {
          const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          setMfaLevel(mfaData?.currentLevel || 'aal1');
          setHasMfaEnrolled((mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2');
        } else {
          setMfaLevel('aal1');
          setHasMfaEnrolled(false);
        }
      } catch (err) {
        console.warn('Auth state change error:', err);
      } finally {
        setLoading(false);
      }
    });

    setData();

    return () => {
      listener?.subscription.unsubscribe();
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
