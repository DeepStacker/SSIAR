import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

interface ToastContextType {
  toast: Toast | null;
  show: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextType>({ toast: null, show: () => {} });

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, show }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
