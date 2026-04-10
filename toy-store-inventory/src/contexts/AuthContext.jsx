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
          if (error) {
            console.warn('Supabase session recovery ignored:', error.message);
            setSession(null);
            setUser(null);
            setMfaLevel('aal1');
            setHasMfaEnrolled(false);
          } else {
            setSession(session);
            setUser(session?.user ?? null);
            
            // Check MFA Level
            const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            setMfaLevel(mfaData?.currentLevel || 'aal1');
            setHasMfaEnrolled((mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2');
          }
      } catch (err) {
        console.warn('Silent auth failure handled');
        setSession(null);
        setUser(null);
        setMfaLevel('aal1');
        setHasMfaEnrolled(false);
      } finally {
        setLoading(false);
      }
    };

    const { data: { listener } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setMfaLevel(mfaData?.currentLevel || 'aal1');
      setHasMfaEnrolled((mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2');
      
      setLoading(false);
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
