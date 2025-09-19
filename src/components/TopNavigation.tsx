"use client";
import { Button } from '@/components/ui/button';
import { addSearchToHistory, clearSearchHistory, getSearchHistory, removeSearchFromHistory } from '@/lib/user-session';
import { extractVideoId } from '@/lib/utils';
import { ArrowRight, CheckCircle, ChevronDown, Clock, History, Menu, Trash2, X, XCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

export default function TopNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasHistory, setHasHistory] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchUrl, setSearchUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Check if we're on the results page
  const isResultsPage = pathname?.startsWith('/results/');

  useEffect(() => {
    const history = getSearchHistory();
    setHasHistory(history.length > 0);
    
    // Refresh history state periodically to catch updates from other tabs/components
    const interval = setInterval(() => {
      const currentHistory = getSearchHistory();
      setHasHistory(currentHistory.length > 0);
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only close if dropdown is open and click is truly outside
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        console.log('Closing dropdown due to outside click');
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      // Use click instead of mousedown to avoid interfering with dropdown clicks
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showDropdown]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-600" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-600" />;
      default:
        return <Clock className="w-3 h-3 text-gray-500" />;
    }
  };


  const getThumbnailUrl = (videoUrl: string): string | null => {
    const videoId = extractVideoId(videoUrl);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
    return null;
  };

  const handleSearchClick = (jobId: string, status: string) => {
    console.log('Navigating to search result:', { jobId, status });
    
    if (jobId) {
      try {
        router.push(`/results/${jobId}`);
      } catch (error) {
        console.error('Router push failed, trying window.location:', error);
        window.location.href = `/results/${jobId}`;
      }
    }
    setShowDropdown(false);
    setIsMobileMenuOpen(false);
  };

  const handleRemoveSearch = (searchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSearchFromHistory(searchId);
    const history = getSearchHistory();
    setHasHistory(history.length > 0);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to clear all search history?')) {
      clearSearchHistory();
      setHasHistory(false);
      setShowDropdown(false);
    }
  };

  const searchHistory = useMemo(() => getSearchHistory(), [hasHistory]);

  // Search functionality for results page
  async function handleSearch() {
    if (!searchUrl.trim()) return;
    
    setError(null);
    
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: searchUrl }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to enqueue analysis");
      }
      
      const { jobId } = await res.json();
      
      // Add to search history with jobId
      addSearchToHistory({
        videoUrl: searchUrl,
        jobId: jobId,
        status: 'pending'
      });
      
      startTransition(() => router.push(`/results/${jobId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div 
            className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push('/')}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-pink-500 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">S</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm sm:text-base">Should I Watch This</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Search Bar - Only show on results page */}
            {isResultsPage && (
              <div className="flex items-center space-x-2">
                <input
                  className="bg-white text-gray-900 rounded-lg px-4 py-2 text-sm border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:outline-none w-64"
                  placeholder="Paste a YouTube link for new search..."
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isPending || !searchUrl}
                  className="bg-gradient-to-r from-pink-500 to-red-500 text-white hover:from-pink-600 hover:to-red-600 disabled:opacity-50"
                  size="sm"
                >
                  {isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
            {hasHistory && (
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center space-x-2 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <History className="w-4 h-4" />
                  <span>Recent Searches</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </Button>

                {/* Dropdown */}
                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                    <div className="p-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900">Recent Searches</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearAll}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="py-1">
                      {searchHistory.map((search) => {
                        const thumbnailUrl = getThumbnailUrl(search.videoUrl);
                        return (
                          <div
                            key={search.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSearchClick(search.jobId, search.status);
                            }}
                            className={`px-3 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 ${
                              search.status === 'completed' ? 'cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Thumbnail */}
                              <div className="flex-shrink-0">
                                {thumbnailUrl ? (
                                  <img
                                    src={thumbnailUrl}
                                    alt="Video thumbnail"
                                    className="w-16 h-12 object-cover rounded border border-gray-200"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-16 h-12 bg-gray-200 rounded border border-gray-200 flex items-center justify-center">
                                    <History className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getStatusIcon(search.status)}
                                  <span className="text-xs text-gray-500">{formatDate(search.timestamp)}</span>
                                </div>
                                {search.videoTitle && (
                                  <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                                    {search.videoTitle}
                                  </p>
                                )}
                                {search.videoChannel && (
                                  <p className="text-xs text-gray-600 truncate mb-1">
                                    {search.videoChannel}
                                  </p>
                                )}
                                {search.trustScore !== undefined && search.status === 'completed' && (
                                  <p className="text-xs text-gray-500">
                                    Trust Score: {search.trustScore}%
                                  </p>
                                )}
                              </div>
                              
                              {/* Delete Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleRemoveSearch(search.id, e)}
                                className="text-gray-400 hover:text-red-500 p-1 h-auto flex-shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center space-x-2">
            {/* Mobile Search Bar - Only show on results page */}
            {isResultsPage && (
              <div className="flex items-center space-x-1">
                <input
                  className="bg-white text-gray-900 rounded-lg px-3 py-2 text-sm border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:outline-none w-40"
                  placeholder="New search..."
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isPending || !searchUrl}
                  className="bg-gradient-to-r from-pink-500 to-red-500 text-white hover:from-pink-600 hover:to-red-600 disabled:opacity-50 p-2"
                  size="sm"
                >
                  {isPending ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <ArrowRight className="w-3 h-3" />
                  )}
                </Button>
              </div>
            )}
            {hasHistory && (
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center space-x-1 bg-white border-gray-300 text-gray-700 hover:bg-gray-50 p-2"
                >
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs">Recent</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </Button>

                {/* Mobile Dropdown */}
                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
                    <div className="p-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900 text-sm">Recent Searches</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearAll}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="py-1">
                      {searchHistory.map((search) => {
                        const thumbnailUrl = getThumbnailUrl(search.videoUrl);
                        return (
                          <div
                            key={search.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSearchClick(search.jobId, search.status);
                            }}
                            className={`px-3 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 ${
                              search.status === 'completed' ? 'cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Thumbnail */}
                              <div className="flex-shrink-0">
                                {thumbnailUrl ? (
                                  <img
                                    src={thumbnailUrl}
                                    alt="Video thumbnail"
                                    className="w-14 h-10 object-cover rounded border border-gray-200"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-14 h-10 bg-gray-200 rounded border border-gray-200 flex items-center justify-center">
                                    <History className="w-3 h-3 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getStatusIcon(search.status)}
                                  <span className="text-xs text-gray-500">{formatDate(search.timestamp)}</span>
                                </div>
                                {search.videoTitle && (
                                  <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                                    {search.videoTitle}
                                  </p>
                                )}
                                {search.videoChannel && (
                                  <p className="text-xs text-gray-600 truncate mb-1">
                                    {search.videoChannel}
                                  </p>
                                )}
                                {search.trustScore !== undefined && search.status === 'completed' && (
                                  <p className="text-xs text-gray-500">
                                    Trust Score: {search.trustScore}%
                                  </p>
                                )}
                              </div>
                              
                              {/* Delete Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleRemoveSearch(search.id, e)}
                                className="text-gray-400 hover:text-red-500 p-1 h-auto flex-shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {/* Error Display */}
        {isResultsPage && error && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
