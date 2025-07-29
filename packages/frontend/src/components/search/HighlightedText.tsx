import { memo } from 'react';

interface HighlightedTextProps {
  text: string;
  searchTerms: string[];
  className?: string;
  highlightClassName?: string;
  maxLength?: number;
}

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const HighlightedText = memo(({
  text,
  searchTerms,
  className = '',
  highlightClassName = 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 font-medium px-1 rounded',
  maxLength,
}: HighlightedTextProps) => {
  if (!text || !searchTerms.length) {
    const displayText = maxLength && text.length > maxLength 
      ? text.substring(0, maxLength) + '...' 
      : text;
    return <span className={className}>{displayText}</span>;
  }

  // Filter out empty search terms and create a regex pattern
  const validTerms = searchTerms
    .filter(term => term && term.trim().length > 0)
    .map(term => escapeRegExp(term.trim()));

  if (validTerms.length === 0) {
    const displayText = maxLength && text.length > maxLength 
      ? text.substring(0, maxLength) + '...' 
      : text;
    return <span className={className}>{displayText}</span>;
  }

  // Create a regex that matches any of the search terms (case insensitive)
  const regex = new RegExp(`(${validTerms.join('|')})`, 'gi');
  
  // Split text by matches but keep the delimiters
  const parts = text.split(regex);
  
  // Find the best excerpt if maxLength is specified
  let processedText = text;
  let startIndex = 0;
  
  if (maxLength && text.length > maxLength) {
    // Find the first occurrence of any search term
    const match = text.match(regex);
    if (match && match.index !== undefined) {
      // Calculate excerpt around the first match
      const matchIndex = match.index;
      const beforeContext = Math.floor((maxLength - match[0].length) / 2);
      startIndex = Math.max(0, matchIndex - beforeContext);
      
      // Adjust start to word boundary if possible
      if (startIndex > 0) {
        const spaceIndex = text.lastIndexOf(' ', startIndex + 20);
        if (spaceIndex > startIndex) {
          startIndex = spaceIndex + 1;
        }
      }
      
      let endIndex = startIndex + maxLength;
      if (endIndex < text.length) {
        // Adjust end to word boundary if possible
        const spaceIndex = text.indexOf(' ', endIndex - 20);
        if (spaceIndex > endIndex - 20 && spaceIndex < endIndex + 20) {
          endIndex = spaceIndex;
        }
      }
      
      processedText = text.substring(startIndex, endIndex);
      if (startIndex > 0) processedText = '...' + processedText;
      if (endIndex < text.length) processedText = processedText + '...';
    } else {
      // No matches found, just truncate normally
      processedText = text.substring(0, maxLength) + '...';
    }
  }

  // Re-split the processed text
  const processedParts = processedText.split(regex);

  return (
    <span className={className}>
      {processedParts.map((part, index) => {
        // Check if this part matches any of the search terms
        const isHighlight = validTerms.some(term => 
          part.toLowerCase() === term.toLowerCase()
        );
        
        return isHighlight ? (
          <mark key={index} className={highlightClassName}>
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </span>
  );
});

HighlightedText.displayName = 'HighlightedText';

export default HighlightedText;