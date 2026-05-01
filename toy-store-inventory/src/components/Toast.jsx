import React, { useEffect, useState } from 'react';
import './Toast.css';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export const Toast = ({ message, type, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  const icons = {
    success: <CheckCircle size={20} />,
    error: <XCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    info: <Info size={20} />,
  };

  return (
    <div className={`toast toast-${type} ${isExiting ? 'exit' : 'enter'}`}>
      <div className="toast-icon">{icons[type]}</div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={handleClose}>
        <X size={16} />
      </button>
    </div>
  );
};
