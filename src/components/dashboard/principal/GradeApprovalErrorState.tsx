
import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface GradeApprovalErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const GradeApprovalErrorState: React.FC<GradeApprovalErrorStateProps> = ({
  error,
  onRetry
}) => {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Grades</h3>
      <p className="text-gray-600 mb-4">{error}</p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
};
