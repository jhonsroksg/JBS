import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaLevel, setMfaLevel] = useState('aal1');
  const [hasMfaEnrolled, setHasMfaEnrolled] = useState(false);

  // Función para obtener o sincronizar el perfil y rol del usuario
  const fetchProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      setRole(null);
      return null;
    }

    try {
      // 1. Intentar obtener rol desde user_roles (administrado desde Settings)
      const { data: userRoleData } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      // 2. Intentar obtener perfil desde profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      const resolvedRole = userRoleData?.role || profileData?.role || currentUser.user_metadata?.role || 'admin';
      const resolvedPermissions = userRoleData?.permissions || { pedidos: true, productos: true, configuracion: resolvedRole === 'admin' };

      const userProfile = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: profileData?.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuario',
        phone: profileData?.phone || currentUser.user_metadata?.phone || '',
        role: resolvedRole,
        permissions: resolvedPermissions
      };

      setProfile(userProfile);
      setRole(resolvedRole);
      return userProfile;
    } catch (err) {
      console.warn('Error al cargar perfil de usuario:', err);
      const fallbackRole = currentUser.user_metadata?.role || 'admin';
      const fallbackProfile = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.email?.split('@')[0] || 'Usuario',
        role: fallbackRole,
        permissions: { pedidos: true, productos: true, configuracion: fallbackRole === 'admin' }
      };
      setProfile(fallbackProfile);
      setRole(fallbackRole);
      return fallbackProfile;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(session);
          const currentUser = session?.user ?? null;
          setUser(currentUser);
          if (currentUser) {
            await fetchProfile(currentUser);
          }
          setLoading(false);
        }
      } catch (err) {
        if (mounted) setLoading(false);
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      const currentUser = newSession?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser);
      } else {
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // Verificación de MFA
  useEffect(() => {
    let mounted = true;

    const checkMFA = async () => {
      if (!session) {
        setMfaLevel('aal1');
        setHasMfaEnrolled(false);
        return;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!mounted) return;
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (mounted && mfaData) {
          setMfaLevel(mfaData.currentLevel || 'aal1');
          setHasMfaEnrolled((mfaData.nextLevel || mfaData.currentLevel) === 'aal2');
        }
      } catch (err) {
        console.warn('Deferred MFA check failed');
      }
    };

    checkMFA();
    return () => { mounted = false; };
  }, [session]);

  const value = {
    session,
    user,
    profile,
    role: role || (user ? 'admin' : null),
    isAdmin: role === 'admin' || (user && !role),
    isEmployee: role === 'empleado',
    isCustomer: role === 'cliente',
    mfaLevel,
    hasMfaEnrolled,
    refreshProfile: () => fetchProfile(user),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};
