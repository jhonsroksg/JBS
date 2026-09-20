import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShieldCheck, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  LogOut, 
  Copy, 
  Check, 
  Smartphone,
  ArrowRight,
  Loader2
} from 'lucide-react';

const MfaSetup = () => {
  const { user, role, mfaLevel, hasMfaEnrolled, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [enrollmentData, setEnrollmentData] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Iniciar enrolamiento de factor TOTP
  const startEnrollment = useCallback(async () => {
    setEnrolling(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `JOA Admin Authenticator (${user?.email || 'Admin'})`
      });

      if (enrollError) throw enrollError;
      setEnrollmentData(data);
    } catch (err) {
      console.error('Error al iniciar enrolamiento TOTP:', err);
      setError(err.message || 'No se pudo generar el código QR. Inténtalo de nuevo.');
    } finally {
      setEnrolling(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && role === 'admin' && !hasMfaEnrolled) {
      startEnrollment();
    }
  }, [user, role, hasMfaEnrolled, startEnrollment]);

  // Si no hay usuario autenticado, redirigir a Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Si el usuario ya tiene MFA activo y alcanzó AAL2, redirigir al panel
  if (hasMfaEnrolled && mfaLevel === 'aal2') {
    return <Navigate to="/admin" replace />;
  }

  // Si no es admin (ej. vendedor o cliente), no está forzado a estar en esta pantalla
  if (role && role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }

  // Copiar clave secreta al portapapeles
  const handleCopySecret = () => {
    if (enrollmentData?.totp?.secret) {
      navigator.clipboard.writeText(enrollmentData.totp.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  // Verificar código TOTP y elevar la sesión a AAL2
  const handleVerifyEnrollment = async (e) => {
    e.preventDefault();
    const cleanCode = totpCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Por favor ingresa un código de 6 dígitos válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Crear Challenge sobre el nuevo factor
      const challenge = await supabase.auth.mfa.challenge({
        factorId: enrollmentData.id
      });
      if (challenge.error) throw challenge.error;

      // 2. Verificar código TOTP
      const verify = await supabase.auth.mfa.verify({
        factorId: enrollmentData.id,
        challengeId: challenge.data.id,
        code: cleanCode
      });
      if (verify.error) throw verify.error;

      setSuccess(true);
      // Sincronizar perfil y niveles de aseguramiento
      await refreshProfile();

      // Redirigir de forma segura al panel administrativo
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 1200);
    } catch (err) {
      console.error('Error en verificación TOTP:', err);
      setError('El código ingresado es incorrecto o ha expirado. Verifica la hora de tu dispositivo e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(circle at 10% 20%, rgba(255, 126, 179, 0.15) 0%, rgba(255, 255, 255, 0) 40%), radial-gradient(circle at 90% 80%, rgba(31, 183, 185, 0.15) 0%, rgba(255, 255, 255, 0) 40%), var(--bg-primary)'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '520px',
        padding: '36px 32px',
        borderRadius: '24px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.6)'
      }}>
        {/* Cabecera */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #1FB7B9 0%, #178e90 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 20px rgba(31, 183, 185, 0.3)'
          }}>
            <ShieldCheck size={34} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Protección Obligatoria de Administrador
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.5' }}>
            Para garantizar la seguridad total de la tienda y la privacidad de los clientes, las cuentas de administrador requieren autenticación de 2 pasos (MFA TOTP).
          </p>
        </div>

        {/* Mensaje de Éxito */}
        {success ? (
          <div style={{
            padding: '24px',
            background: 'rgba(46, 204, 113, 0.12)',
            borderRadius: '16px',
            border: '1px solid rgba(46, 204, 113, 0.3)',
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            <CheckCircle2 size={42} style={{ color: 'var(--success)', margin: '0 auto 12px auto' }} />
            <h3 style={{ color: 'var(--success)', fontWeight: 700, marginBottom: '6px' }}>¡Autenticación Configurada!</h3>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              Tu sesión ha sido elevada a nivel seguro (AAL2). Redirigiendo al panel de control...
            </p>
          </div>
        ) : enrolling ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Loader2 className="animate-spin" size={36} style={{ color: 'var(--accent-primary)', margin: '0 auto 16px auto' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Generando clave de seguridad cifrada...</p>
          </div>
        ) : (
          <div>
            {/* Mensaje de Error */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '14px',
                background: 'rgba(231, 76, 60, 0.1)',
                border: '1px solid rgba(231, 76, 60, 0.25)',
                borderRadius: '12px',
                color: '#c0392b',
                fontSize: '0.88rem',
                marginBottom: '20px'
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            {/* Paso 1: Escanear Código QR */}
            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: '18px',
              padding: '20px',
              marginBottom: '24px',
              textAlign: 'center',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.92rem' }}>
                <Smartphone size={18} style={{ color: 'var(--accent-primary)' }} />
                <span>Paso 1: Escanea con tu app autenticadora</span>
              </div>

              {enrollmentData?.totp?.qr_code || enrollmentData?.totp?.uri ? (
                <div style={{
                  background: '#ffffff',
                  padding: '14px',
                  borderRadius: '14px',
                  display: 'inline-block',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  marginBottom: '14px'
                }}>
                  <img
                    src={enrollmentData.totp.qr_code || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(enrollmentData.totp.uri)}`}
                    alt="Código QR de Configuración MFA"
                    style={{ width: '180px', height: '180px', display: 'block' }}
                  />
                </div>
              ) : null}

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Compatible con Google Authenticator, Authy, Microsoft Authenticator o Apple Passwords.
              </p>

              {/* Clave Secreta Manual */}
              {enrollmentData?.totp?.secret && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'var(--bg-secondary)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.82rem'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Clave manual:</span>
                  <code style={{ fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-primary)' }}>
                    {enrollmentData.totp.secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="btn-icon"
                    style={{ padding: '4px', color: copiedSecret ? 'var(--success)' : 'var(--text-secondary)' }}
                    title="Copiar clave"
                  >
                    {copiedSecret ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>

            {/* Paso 2: Formulario de Verificación */}
            <form onSubmit={handleVerifyEnrollment}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  color: 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  Paso 2: Ingresa el código de 6 dígitos generado
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000 000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '1.4rem',
                      textAlign: 'center',
                      letterSpacing: '8px',
                      fontWeight: 700,
                      borderRadius: '14px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <KeyRound size={18} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={loading || totpCode.length !== 6}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: (loading || totpCode.length !== 6) ? 'not-allowed' : 'pointer',
                  opacity: (loading || totpCode.length !== 6) ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Verificando código...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar y Acceder al Panel</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Pie de página con opción de Cerrar Sesión */}
        <div style={{
          marginTop: '28px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Sesión: <strong>{user.email}</strong>
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: '8px'
            }}
          >
            <LogOut size={15} />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaSetup;
