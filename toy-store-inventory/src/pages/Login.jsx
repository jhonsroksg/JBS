import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogIn, 
  UserPlus, 
  KeyRound, 
  Mail, 
  Lock, 
  User, 
  Phone, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft, 
  ShieldCheck,
  ShoppingBag
} from 'lucide-react';

const Login = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : (searchParams.get('mode') === 'recover' ? 'recover' : 'login');
  
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'recover'
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // MFA States (se preservan al 100%)
  const { user, role, mfaLevel, hasMfaEnrolled } = useAuth();
  const [showMfa, setShowMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState(null);
  const [mfaData, setMfaData] = useState(null);
  const navigate = useNavigate();

  // Detección de MFA
  useEffect(() => {
    if (user && hasMfaEnrolled && mfaLevel === 'aal1') {
      const checkFactors = async () => {
        try {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const totpFactor = factors?.totp.find(f => f.status === 'verified');
          if (totpFactor) {
            setMfaData(totpFactor);
            setShowMfa(true);
          }
        } catch (e) {
          console.error(e);
        }
      };
      checkFactors();
    }
  }, [user, mfaLevel, hasMfaEnrolled]);

  // Si ya está logueado y completó MFA:
  if (user && (!hasMfaEnrolled || mfaLevel === 'aal2')) {
    const isStaff = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado'].includes(role);
    if (isStaff) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const resetErrorsAndNotifs = () => {
    setError(null);
    setSuccessMessage(null);
    setMfaError(null);
  };

  // --- 1. INICIAR SESIÓN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    resetErrorsAndNotifs();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // Verificar si requiere MFA
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (!factorsError && factors?.totp?.length > 0) {
        const totpFactor = factors.totp.find(f => f.status === 'verified');
        if (totpFactor) {
          setMfaData(totpFactor);
          setShowMfa(true);
          return;
        }
      }

      // Redirección según rol
      const userMetaRole = data?.user?.user_metadata?.role;
      if (['admin', 'empleado', 'vendedor', 'inventario', 'personalizado'].includes(userMetaRole)) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.message === 'Invalid login credentials') {
        setError('Correo o contraseña incorrectos. Verifica tus datos.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Por favor verifica tu correo electrónico antes de iniciar sesión.');
      } else {
        setError(err.message || 'Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- 2. REGISTRO DE USUARIO / CLIENTE ---
  const handleRegister = async (e) => {
    e.preventDefault();
    resetErrorsAndNotifs();

    if (password.length < 6) {
      setError('La contraseña debe tener un mínimo de 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            role: 'cliente', // Registro público se crea por defecto como cliente
          }
        }
      });

      if (error) throw error;

      // Si el email no requiere confirmación y hay sesión inmediata
      if (data?.session) {
        setSuccessMessage('¡Cuenta creada con éxito! Redirigiendo a la tienda...');
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setSuccessMessage('¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada.');
        // Limpiar campos
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      if (err.message?.includes('User already registered')) {
        setError('Este correo electrónico ya se encuentra registrado. Intenta iniciar sesión.');
      } else {
        setError(err.message || 'Error al registrar la cuenta.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- 3. RECUPERAR CONTRASEÑA ---
  const handleRecover = async (e) => {
    e.preventDefault();
    resetErrorsAndNotifs();
    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      setSuccessMessage('Hemos enviado un enlace de recuperación a tu correo electrónico. Sigue las instrucciones para restablecer tu contraseña.');
    } catch (err) {
      setError(err.message || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setLoading(false);
    }
  };

  // --- 4. VERIFICACIÓN DE MFA ---
  const handleMfaVerify = async (e) => {
    e?.preventDefault();
    if (mfaCode.length !== 6) return;

    setLoading(true);
    setMfaError(null);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaData.id,
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaData.id,
        challengeId: challenge.id,
        code: mfaCode,
      });

      if (verifyError) throw verifyError;

      // Redirección según rol tras verificar MFA
      const isStaff = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado'].includes(role);
      if (isStaff) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch {
      setMfaError('Código 2FA incorrecto o expirado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #f0fdf4 100%)',
      padding: '24px 16px',
      fontFamily: 'inherit'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '36px 32px',
        borderRadius: '28px',
        boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.12)',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        boxSizing: 'border-box'
      }}>
        {/* Cabecera / Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'var(--accent-gradient, linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%))',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 10px 22px rgba(14, 165, 233, 0.28)',
            color: 'white'
          }}>
            {showMfa ? (
              <ShieldCheck size={32} />
            ) : mode === 'register' ? (
              <UserPlus size={30} />
            ) : mode === 'recover' ? (
              <KeyRound size={30} />
            ) : (
              <LogIn size={30} />
            )}
          </div>

          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
            {showMfa 
              ? 'Verificación de Seguridad' 
              : mode === 'register' 
                ? 'Crear Cuenta' 
                : mode === 'recover' 
                  ? 'Recuperar Contraseña' 
                  : 'Bienvenido'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.92rem', margin: 0 }}>
            {showMfa 
              ? 'Introduce tu código de autenticación de 2 pasos' 
              : mode === 'register' 
                ? 'Regístrate para comprar y dar seguimiento a tus pedidos' 
                : mode === 'recover' 
                  ? 'Te enviaremos un correo con un enlace seguro' 
                  : 'Accede a tu cuenta de cliente o administración'}
          </p>
        </div>

        {/* Selector de Pestañas (Modos) si no está en MFA */}
        {!showMfa && (
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '14px',
            marginBottom: '24px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => { setMode('login'); resetErrorsAndNotifs(); }}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: mode === 'login' ? 'white' : 'transparent',
                color: mode === 'login' ? '#0f172a' : '#64748b',
                fontWeight: mode === 'login' ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: mode === 'login' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); resetErrorsAndNotifs(); }}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: mode === 'register' ? 'white' : 'transparent',
                color: mode === 'register' ? '#0f172a' : '#64748b',
                fontWeight: mode === 'register' ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: mode === 'register' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              Registrarse
            </button>
          </div>
        )}

        {/* Mensajes de Alerta y Notificaciones */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '14px',
            marginBottom: '20px',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.08)',
            color: '#16a34a',
            padding: '12px 16px',
            borderRadius: '14px',
            marginBottom: '20px',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid rgba(34, 197, 94, 0.2)'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* VISTA 1: RETO MFA */}
        {showMfa ? (
          <form onSubmit={handleMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {mfaError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '0.86rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                textAlign: 'center'
              }}>
                {mfaError}
              </div>
            )}

            <input
              type="text"
              placeholder="000 000"
              maxLength="6"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: '2px solid #0ea5e9',
                background: 'white',
                fontSize: '1.8rem',
                textAlign: 'center',
                letterSpacing: '8px',
                fontWeight: 700,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setShowMfa(false); setMfaCode(''); setMfaError(null); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  color: '#64748b',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Atrás
              </button>
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="btn-primary"
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--accent-gradient, linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%))',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Verificando...' : 'Verificar 2FA'}
              </button>
            </div>
          </form>
        ) : mode === 'login' ? (
          /* VISTA 2: FORMULARIO DE INICIO DE SESIÓN */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '13px 16px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '13px 44px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
              <button
                type="button"
                onClick={() => { setMode('recover'); resetErrorsAndNotifs(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 700,
                marginTop: '6px',
                background: 'var(--accent-gradient, linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%))',
                color: 'white',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 18px rgba(14, 165, 233, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {loading ? 'Iniciando sesión...' : (
                <>
                  Entrar a mi Cuenta
                  <LogIn size={18} />
                </>
              )}
            </button>
          </form>
        ) : mode === 'register' ? (
          /* VISTA 3: FORMULARIO DE REGISTRO */
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '13px 16px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '13px 16px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Phone size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="tel"
                placeholder="Teléfono / WhatsApp (opcional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '13px 16px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña (mín. 6 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '13px 44px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirmar contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '13px 44px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 700,
                marginTop: '6px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 18px rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {loading ? 'Creando cuenta...' : (
                <>
                  Registrarme
                  <UserPlus size={18} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* VISTA 4: RECUPERACIÓN DE CONTRASEÑA */
          <form onSubmit={handleRecover} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="email"
                placeholder="Ingresa tu correo registrado"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '13px 16px 13px 46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 700,
                background: 'var(--accent-gradient, linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%))',
                color: 'white',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 18px rgba(14, 165, 233, 0.25)'
              }}
            >
              {loading ? 'Enviando enlace...' : 'Enviar Enlace de Recuperación'}
            </button>

            <button
              type="button"
              onClick={() => { setMode('login'); resetErrorsAndNotifs(); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <ArrowLeft size={16} /> Volver a Iniciar Sesión
            </button>
          </form>
        )}

        {/* Enlace para volver a la tienda */}
        <div style={{ textAlign: 'center', marginTop: '28px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: '#0284c7',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShoppingBag size={16} /> Ir a la Tienda Pública
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
