"use client";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchHistoryItem, clearSearchHistory, getSearchHistory, removeSearchFromHistory } from '@/lib/user-session';
import { CheckCircle, ChevronDown, Clock, ExternalLink, Eye, History, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SearchHistoryProps {
  onSelectSearch?: (search: SearchHistoryItem) => void;
  onUpdate?: () => void;
  className?: string;
}

export default function SearchHistory({ onSelectSearch, onUpdate, className = '' }: SearchHistoryProps) {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCompact, setShowCompact] = useState(true);

  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  const handleRemoveSearch = (searchId: string) => {
    removeSearchFromHistory(searchId);
    setSearchHistory(getSearchHistory());
    onUpdate?.();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all search history?')) {
      clearSearchHistory();
      setSearchHistory([]);
      onUpdate?.();
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) { // 7 days
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (searchHistory.length === 0) {
    return null;
  }

  // Show compact view by default
  if (showCompact && !isExpanded) {
    return (
      <div className={`w-full ${className}`}>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                <span className="font-medium">{searchHistory.length}</span> recent searches
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="text-xs"
              >
                View All
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Searches</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>

      <ScrollArea className={`${isExpanded ? 'h-96' : 'h-48'} w-full`}>
        <div className="space-y-3">
          {searchHistory.map((search) => (
            <Card key={search.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(search.status)}
                      {getStatusBadge(search.status)}
                      <span className="text-sm text-gray-500">
                        {formatDate(search.timestamp)}
                      </span>
                    </div>
                    
                    {search.videoTitle && (
                      <h4 className="font-medium text-gray-900 mb-1 line-clamp-2">
                        {search.videoTitle}
                      </h4>
                    )}
                    
                    {search.videoChannel && (
                      <p className="text-sm text-gray-600 mb-2">
                        {search.videoChannel}
                      </p>
                    )}
                    
                    {search.oneLiner && search.status === 'completed' && (
                      <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                        {search.oneLiner}
                      </p>
                    )}
                    
                    {search.trustScore !== undefined && search.status === 'completed' && (
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={search.trustScore >= 70 ? "default" : search.trustScore >= 40 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          Trust Score: {search.trustScore}%
                        </Badge>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(search.videoUrl, '_blank')}
                        className="text-xs"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Video
                      </Button>
                      
                      {search.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/results/${search.jobId}`, '_blank')}
                          className="text-xs"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Analysis
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSearch(search.id)}
                    className="text-gray-400 hover:text-red-500 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}
