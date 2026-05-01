import React, { createContext, useState, useCallback } from 'react';
import { Toast } from '../components/Toast';

export const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast 
            key={toast.id} 
            message={toast.message} 
            type={toast.type} 
            onClose={() => removeToast(toast.id)} 
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
