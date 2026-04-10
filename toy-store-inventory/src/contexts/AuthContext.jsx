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

    // Obtener sesión inicial manualmente para cargar la UI rápido
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) setLoading(false);
      }
    };
    initAuth();

    // Suscribirse a cambios futuros
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Efecto separado para verificar el nivel de MFA sin bloquear el hilo de autenticación inicial
  useEffect(() => {
    let mounted = true;

    const checkMFA = async () => {
      if (!session) {
        setMfaLevel('aal1');
        setHasMfaEnrolled(false);
        return;
      }

      try {
        // Añadimos un pequeño retraso para asegurar que cualquier transacción de Auth previa haya finalizado
        await new Promise(resolve => setTimeout(resolve, 0));
        
        if (!mounted) return;
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (mounted && mfaData) {
          setMfaLevel(mfaData.currentLevel || 'aal1');
          setHasMfaEnrolled((mfaData.nextLevel || mfaData.currentLevel) === 'aal2');
        }
      } catch (err) {
        console.warn('Deferred MFA check check failed');
      }
    };

    checkMFA();
    return () => { mounted = false; };
  }, [session]);

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
