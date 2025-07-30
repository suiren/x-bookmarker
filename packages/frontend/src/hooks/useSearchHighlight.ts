import { useMemo } from 'react';

interface SearchQuery {
  text?: string;
  categoryIds?: string[];
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  authorUsername?: string;
}

/**
 * Extract search terms that should be highlighted in search results
 */
export const useSearchHighlight = (searchQuery: SearchQuery, quickSearch?: string) => {
  const searchTerms = useMemo(() => {
    const terms: string[] = [];
    
    // Add text search terms
    const queryText = searchQuery.text || quickSearch || '';
    if (queryText.trim()) {
      // Split by common delimiters and filter empty strings
      const textTerms = queryText
        .toLowerCase()
        .split(/[\s,、。！？]+/)
        .filter(term => term.length > 1); // Only include terms with 2+ characters
      terms.push(...textTerms);
    }
    
    // Add tag terms (without # symbol)
    if (searchQuery.tags && searchQuery.tags.length > 0) {
      terms.push(...searchQuery.tags.map(tag => tag.toLowerCase()));
    }
    
    // Add author terms
    if (searchQuery.authorUsername && searchQuery.authorUsername.trim()) {
      terms.push(searchQuery.authorUsername.toLowerCase());
    }
    
    // Remove duplicates and very short terms
    return [...new Set(terms)].filter(term => term.length > 1);
  }, [searchQuery, quickSearch]);
  
  return {
    searchTerms,
    hasHighlightableTerms: searchTerms.length > 0,
  };
};

/**
 * Extract searchable terms from bookmark content for highlighting
 */
export const useBookmarkHighlight = (
  bookmark: {
    content: string;
    tags: string[];
    authorUsername: string;
    authorDisplayName: string;
  },
  searchTerms: string[]
) => {
  const highlightData = useMemo(() => {
    if (!searchTerms.length) {
      return {
        content: bookmark.content,
        tags: bookmark.tags,
        authorDisplay: bookmark.authorDisplayName,
        shouldHighlight: false,
      };
    }
    
    return {
      content: bookmark.content,
      tags: bookmark.tags,
      authorDisplay: bookmark.authorDisplayName,
      shouldHighlight: true,
    };
  }, [bookmark, searchTerms]);
  
  return highlightData;
};

export default useSearchHighlight;