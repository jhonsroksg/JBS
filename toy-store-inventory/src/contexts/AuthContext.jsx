/* eslint-disable react-refresh/only-export-components */
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
      // 1. Obtener rol y permisos EXCLUSIVAMENTE desde public.user_roles (única fuente autorizada)
      const { data: userRoleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (roleError) {
        console.warn('Error al consultar user_roles:', roleError.message);
      }

      // 2. Obtener datos cosméticos de perfil desde profiles si existe
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', currentUser.id)
        .maybeSingle();

      // Fail-closed estricto: solo asignar rol si está explícitamente definido en public.user_roles
      // user_metadata NO tiene autoridad y nunca se usa para conceder roles
      const resolvedRole = userRoleData?.role || null;
      
      // Si tiene permisos específicos en user_roles, utilizarlos; de lo contrario asignar según rol estricto
      let resolvedPermissions = { pedidos: false, productos: false, configuracion: false };
      if (userRoleData?.permissions && typeof userRoleData.permissions === 'object') {
        resolvedPermissions = {
          pedidos: Boolean(userRoleData.permissions.pedidos),
          productos: Boolean(userRoleData.permissions.productos),
          configuracion: Boolean(userRoleData.permissions.configuracion)
        };
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
      console.warn('Error al cargar perfil de usuario (Fail-closed activo):', err);
      // Fail-closed: si falla la consulta, NUNCA asumir admin ni leer user_metadata.role
      const fallbackRole = null;
      const fallbackPermissions = { pedidos: false, productos: false, configuracion: false };

      const fallbackProfile = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuario',
        phone: currentUser.user_metadata?.phone || '',
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
      } catch {
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

  // Verificación y sincronización de MFA
  const refreshMFA = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setMfaLevel('aal1');
        setHasMfaEnrolled(false);
        return { currentLevel: 'aal1', hasEnrolled: false };
      }

      const [{ data: mfaData }, { data: factorsData }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors().catch(() => ({ data: null }))
      ]);

      const verifiedFactors = factorsData?.totp?.filter(f => f.status === 'verified') || [];
      const hasEnrolled = verifiedFactors.length > 0 || (mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2';
      const currentLevel = mfaData?.currentLevel || 'aal1';

      setMfaLevel(currentLevel);
      setHasMfaEnrolled(hasEnrolled);
      return { currentLevel, hasEnrolled };
    } catch (err) {
      console.warn('Error verificando estado MFA:', err);
      return { currentLevel: 'aal1', hasEnrolled: false };
    }
  }, []);

  useEffect(() => {
    let active = true;
    const syncMFA = async () => {
      if (!session) {
        if (active) {
          setMfaLevel('aal1');
          setHasMfaEnrolled(false);
        }
        return;
      }

      try {
        const [{ data: mfaData }, { data: factorsData }] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors().catch(() => ({ data: null }))
        ]);
        if (active) {
          const verifiedFactors = factorsData?.totp?.filter(f => f.status === 'verified') || [];
          const hasEnrolled = verifiedFactors.length > 0 || (mfaData?.nextLevel || mfaData?.currentLevel) === 'aal2';
          const currentLevel = mfaData?.currentLevel || 'aal1';
          setMfaLevel(currentLevel);
          setHasMfaEnrolled(hasEnrolled);
        }
      } catch (err) {
        console.warn('Error en syncMFA:', err);
      }
    };

    syncMFA();
    return () => { active = false; };
  }, [session]);

  const isUserAdmin = role === 'admin';
  const isUserEmployee = ['empleado', 'vendedor', 'inventario', 'personalizado'].includes(role);
  const isUserCustomer = role === 'cliente';
  const needsMfaEnrollment = isUserAdmin && !hasMfaEnrolled;

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
    needsMfaEnrollment,
    refreshMFA,
    refreshProfile: async (customUser) => {
      const res = await fetchProfile(customUser || user);
      await refreshMFA();
      return res;
    },
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};
