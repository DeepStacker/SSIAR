import React, { createContext, useContext, useState } from 'react';

interface ReviewState {
  reviewIndex: number;
  setReviewIndex: React.Dispatch<React.SetStateAction<number>>;
  dirty: boolean;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
}

const ReviewContext = createContext<ReviewState | null>(null);

export const ReviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <ReviewContext.Provider value={{ reviewIndex, setReviewIndex, dirty, setDirty, saving, setSaving }}>
      {children}
    </ReviewContext.Provider>
  );
};

export const useReview = () => {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used within ReviewProvider');
  return ctx;
};
