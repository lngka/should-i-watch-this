"use client";
import { Button } from '@/components/ui/button';
import { Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const PRIVACY_NOTICE_KEY = 'siwt_privacy_notice_dismissed';

export default function PrivacyNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already dismissed the privacy notice
    const dismissed = localStorage.getItem(PRIVACY_NOTICE_KEY);
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(PRIVACY_NOTICE_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-green-50/80 border border-green-200/60 rounded-lg p-3">
      <div className="flex items-center space-x-2">
        <div className="flex-shrink-0">
          <Lock className="w-4 h-4 text-green-600" />
        </div>
        <p className="text-sm text-green-700 flex-1">
          <span className="font-medium">Privacy:</span> We don&apos;t share or log your search history. Only local cache for your personal use.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-green-500 hover:text-green-700 hover:bg-green-100 p-1 h-auto"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
