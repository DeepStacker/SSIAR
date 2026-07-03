import React from 'react';
import { useToast } from '../context/ToastContext';

export const Toast: React.FC = () => {
  const { toast } = useToast();
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
      padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
      background: toast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(244,63,94,0.95)',
      color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      {toast.message}
    </div>
  );
};
