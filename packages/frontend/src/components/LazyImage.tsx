import { useState, useRef, useEffect, memo } from 'react';
import { clsx } from 'clsx';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  threshold?: number;
  rootMargin?: string;
  width?: number;
  height?: number;
}

const LazyImage = memo(({
  src,
  alt,
  className,
  placeholder,
  onLoad,
  onError,
  threshold = 0.1,
  rootMargin = '50px',
  width,
  height,
}: LazyImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const imgElement = imgRef.current;
    if (!imgElement) return;

    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: load image immediately if IntersectionObserver is not supported
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(imgElement);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(imgElement);

    return () => {
      observer.unobserve(imgElement);
    };
  }, [threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Generate a placeholder color based on the image src
  const getPlaceholderColor = (src: string) => {
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = src.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 60%, 85%)`;
  };

  const placeholderStyle = {
    backgroundColor: placeholder || getPlaceholderColor(src),
    ...(width && { width }),
    ...(height && { height }),
  };

  return (
    <div
      ref={imgRef}
      className={clsx(
        'relative overflow-hidden',
        className
      )}
      style={!isInView ? placeholderStyle : undefined}
    >
      {hasError ? (
        // Error state
        <div
          className="flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm"
          style={placeholderStyle}
        >
          画像を読み込めませんでした
        </div>
      ) : !isInView ? (
        // Placeholder state
        <div
          className="animate-pulse"
          style={placeholderStyle}
        >
          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      ) : (
        // Image loading/loaded state
        <>
          {!isLoaded && (
            <div
              className="absolute inset-0 animate-pulse"
              style={placeholderStyle}
            >
              <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            className={clsx(
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0',
              className
            )}
            style={{
              ...(width && { width }),
              ...(height && { height }),
            }}
            loading="lazy" // Native lazy loading as fallback
          />
        </>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

export default LazyImage;