import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
  action?: ToastAction;
  dismissAt: number;
}

interface ToastContextType {
  toast: Toast | null;
  show: (message: string, type?: 'success' | 'error', action?: ToastAction) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextType>({ toast: null, show: () => {}, dismiss: () => {} });

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, type: 'success' | 'error' = 'success', action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type, action, dismissAt: Date.now() + 2500 });
    timer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, show, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
