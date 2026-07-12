import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  onClose: () => void;
  center?: React.ReactNode;
}

export const DocHeader: React.FC<Props> = ({ title, onClose, center }) => (
  <header aria-label="Document header" className="flex items-center justify-between border-b pb-5 mb-8">
    <div className="flex items-center gap-3 text-lg font-extrabold">
      <h1 className="text-lg font-extrabold">{title}</h1>
    </div>
    {center && <div className="flex-1 text-center">{center}</div>}
    <Button variant="outline" size="sm" onClick={onClose} aria-label="Close document">
      <X size={14} /> Close
    </Button>
  </header>
);
