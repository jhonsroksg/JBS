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

      // Fail-closed: solo asignar rol si está explícitamente definido en user_roles, profiles o user_metadata
      const resolvedRole = userRoleData?.role || profileData?.role || currentUser.user_metadata?.role || null;
      
      // Si tiene permisos específicos en user_roles, utilizarlos; de lo contrario asignar según rol estricto
      let resolvedPermissions = { pedidos: false, productos: false, configuracion: false };
      if (userRoleData?.permissions) {
        resolvedPermissions = userRoleData.permissions;
      } else if (resolvedRole === 'admin') {
        resolvedPermissions = { pedidos: true, productos: true, configuracion: true };
      } else if (resolvedRole === 'empleado' || resolvedRole === 'vendedor') {
        resolvedPermissions = { pedidos: true, productos: false, configuracion: false };
      } else if (resolvedRole === 'inventario') {
        resolvedPermissions = { pedidos: false, productos: true, configuracion: false };
      }

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
      // Fail-closed: si falla la consulta, solo rescatamos el rol explícito de user_metadata si existe, nunca 'admin' por defecto
      const fallbackRole = currentUser.user_metadata?.role || null;
      const fallbackPermissions = fallbackRole === 'admin' 
        ? { pedidos: true, productos: true, configuracion: true }
        : { pedidos: false, productos: false, configuracion: false };

      const fallbackProfile = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuario',
        role: fallbackRole,
        permissions: fallbackPermissions
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

  const isUserAdmin = role === 'admin';
  const isUserEmployee = ['empleado', 'vendedor', 'inventario', 'personalizado'].includes(role);
  const isUserCustomer = role === 'cliente';

  const value = {
    session,
    user,
    profile,
    role, // Estrictamente el rol resuelto o null, NUNCA default a 'admin'
    isAdmin: isUserAdmin, // Estrictamente true solo si role === 'admin'
    isEmployee: isUserEmployee,
    isCustomer: isUserCustomer,
    permissions: profile?.permissions || { pedidos: false, productos: false, configuracion: false },
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
