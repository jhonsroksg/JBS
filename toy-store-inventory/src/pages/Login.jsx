import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user, mfaLevel, hasMfaEnrolled } = useAuth();
  const navigate = useNavigate();

  // MFA States
  const [showMfa, setShowMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState(null);
  const [mfaData, setMfaData] = useState(null); // To store factor info

  // Efecto para detectar si necesitamos mostrar el reto MFA automáticamente
  useEffect(() => {
    if (user && hasMfaEnrolled && mfaLevel === 'aal1') {
      const checkFactors = async () => {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp.find(f => f.status === 'verified');
        if (totpFactor) {
          setMfaData(totpFactor);
          setShowMfa(true);
        }
      };
      checkFactors();
    }
  }, [user, mfaLevel, hasMfaEnrolled]);

  // Si ya está logueado con el nivel máximo, redirigir al admin
  if (user && (!hasMfaEnrolled || mfaLevel === 'aal2')) {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if MFA is required
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactor = factors.totp.find(f => f.status === 'verified');
      
      if (totpFactor) {
        // Switch to MFA view
        setMfaData(totpFactor);
        setShowMfa(true);
        return; // Don't navigate yet
      }

      navigate('/admin');
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Credenciales inválidas' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e) => {
    e?.preventDefault();
    if (mfaCode.length !== 6) return;
    
    setLoading(true);
    setMfaError(null);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaData.id
      });
      
      if (challengeError) throw challengeError;

      const { data: verify, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaData.id,
        challengeId: challenge.id,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // Success! Navigate to admin
      navigate('/admin');
    } catch (err) {
      setMfaError('Código inválido. Por favor intenta de nuevo.');
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
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        borderRadius: '30px',
        boxShadow: '0 20px 50px rgba(179, 221, 242, 0.5)',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '70px',
            height: '70px',
            background: 'var(--accent-gradient)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 10px 20px rgba(31, 183, 185, 0.3)'
          }}>
            <LogIn size={32} color="white" />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Panel de Admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '24px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {showMfa ? (
          <form onSubmit={handleMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Tu cuenta está protegida. Ingresa el código de 6 dígitos de tu aplicación autenticadora.
              </p>
            </div>

            {mfaError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.9rem',
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
                border: '2px solid var(--accent-primary)',
                background: 'white',
                fontSize: '1.8rem',
                textAlign: 'center',
                letterSpacing: '8px',
                fontWeight: 700,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setShowMfa(false); setMfaCode(''); setMfaError(null); }}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'none',
                  color: 'var(--text-secondary)',
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
                  padding: '14px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  boxShadow: '0 8px 15px rgba(31, 183, 185, 0.3)'
                }}
              >
                {loading ? 'Verificando...' : 'Verificar Código'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.5)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.5)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                fontSize: '1.05rem',
                fontWeight: 700,
                marginTop: '10px',
                boxShadow: '0 10px 20px rgba(31, 183, 185, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              {loading ? 'Iniciando sesión...' : (
                <>
                  Entrar al Dashboard
                  <LogIn size={18} />
                </>
              )}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600
            }}
          >
            Volver a la tienda pública
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
