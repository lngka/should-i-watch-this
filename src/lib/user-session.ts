/**
 * User session management for local search history
 * Uses localStorage to maintain user identity and search history
 */

export interface SearchHistoryItem {
  id: string;
  videoUrl: string;
  videoTitle?: string;
  videoChannel?: string;
  jobId: string;
  timestamp: number;
  status: 'completed' | 'failed' | 'pending';
  trustScore?: number;
  oneLiner?: string;
}

export interface UserSession {
  userId: string;
  createdAt: number;
  lastActive: number;
  searchHistory: SearchHistoryItem[];
}

const USER_SESSION_KEY = 'siwt_user_session';
const MAX_SEARCH_HISTORY = 50; // Keep last 50 searches

/**
 * Generate a unique user ID
 */
function generateUserId(): string {
  return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

/**
 * Get or create user session
 */
export function getUserSession(): UserSession {
  if (typeof window === 'undefined') {
    // Server-side rendering - return empty session
    return {
      userId: '',
      createdAt: 0,
      lastActive: 0,
      searchHistory: []
    };
  }

  try {
    const stored = localStorage.getItem(USER_SESSION_KEY);
    if (stored) {
      const session: UserSession = JSON.parse(stored);
      // Update last active time
      session.lastActive = Date.now();
      saveUserSession(session);
      return session;
    }
  } catch (error) {
    console.error('Error loading user session:', error);
  }

  // Create new session
  const newSession: UserSession = {
    userId: generateUserId(),
    createdAt: Date.now(),
    lastActive: Date.now(),
    searchHistory: []
  };

  saveUserSession(newSession);
  return newSession;
}

/**
 * Save user session to localStorage
 */
export function saveUserSession(session: UserSession): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving user session:', error);
  }
}

/**
 * Add a search to user's history
 */
export function addSearchToHistory(searchItem: Omit<SearchHistoryItem, 'id' | 'timestamp'>): void {
  const session = getUserSession();
  
  // Check if this is an update to an existing search (same jobId)
  const existingIndex = session.searchHistory.findIndex(search => search.jobId === searchItem.jobId);
  
  if (existingIndex !== -1) {
    // Update existing search
    session.searchHistory[existingIndex] = {
      ...session.searchHistory[existingIndex],
      ...searchItem,
      timestamp: Date.now()
    };
  } else {
    // Add new search
    const newSearchItem: SearchHistoryItem = {
      ...searchItem,
      id: 'search_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now()
    };

    // Add to beginning of array (most recent first)
    session.searchHistory.unshift(newSearchItem);
  }

  // Keep only the most recent searches
  if (session.searchHistory.length > MAX_SEARCH_HISTORY) {
    session.searchHistory = session.searchHistory.slice(0, MAX_SEARCH_HISTORY);
  }

  saveUserSession(session);
}

/**
 * Update a search in user's history
 */
export function updateSearchInHistory(jobId: string, updates: Partial<SearchHistoryItem>): void {
  const session = getUserSession();
  const searchIndex = session.searchHistory.findIndex(search => search.jobId === jobId);
  
  if (searchIndex !== -1) {
    session.searchHistory[searchIndex] = {
      ...session.searchHistory[searchIndex],
      ...updates
    };
    saveUserSession(session);
  }
}

/**
 * Get user's search history
 */
export function getSearchHistory(): SearchHistoryItem[] {
  const session = getUserSession();
  return session.searchHistory;
}

/**
 * Clear user's search history
 */
export function clearSearchHistory(): void {
  const session = getUserSession();
  session.searchHistory = [];
  saveUserSession(session);
}

/**
 * Remove a specific search from history
 */
export function removeSearchFromHistory(searchId: string): void {
  const session = getUserSession();
  session.searchHistory = session.searchHistory.filter(search => search.id !== searchId);
  saveUserSession(session);
}

/**
 * Get user ID
 */
export function getUserId(): string {
  const session = getUserSession();
  return session.userId;
}
