import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Document } from '@/api';
import { DocumentHeader } from '@/features/layout/DocumentHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  doc: Document;
  onClose: () => void;
  onReprocess?: (doc: Document) => void;
}

export const FailedView: React.FC<Props> = ({ doc, onClose, onReprocess }) => {
  const [reprocessing, setReprocessing] = useState(false);

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await onReprocess?.(doc);
    } finally {
      setReprocessing(false);
    }
  };

  const errorMsg = doc.error_message;

  return (
    <div className="app-container">
      <DocumentHeader title="SSIAR" onClose={onClose} />
      <div className="flex items-center justify-center h-[60vh] px-4">
        <Card className="w-full max-w-lg">
          <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
            <AlertTriangle size={40} className="text-rose-500" />
            <h3 className="text-lg font-semibold text-rose-500">Failed — {doc.filename}</h3>

            {errorMsg && (
              <div className="w-full rounded-lg p-4 text-sm text-left text-rose-500 bg-rose-500/10 border border-rose-500/25">
                <strong>Error:</strong> {errorMsg}
              </div>
            )}

            <p className="text-sm text-[var(--text-muted)]">
              {errorMsg
                ? 'The document could not be processed. You can retry or go back.'
                : 'Processing encountered an error. Try re-uploading or check the backend logs.'}
            </p>

            <div className="flex gap-2">
              {onReprocess && (
                <Button variant="default" onClick={handleReprocess} disabled={reprocessing}>
                  {reprocessing && <Loader2 className="animate-spin" />}
                  {reprocessing ? ' Retrying...' : 'Retry'}
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Back to Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
