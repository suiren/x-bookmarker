import { useState, useRef, useEffect, memo } from 'react';
import { clsx } from 'clsx';

interface ProgressiveImageProps {
  src: string;
  lowQualitySrc?: string; // Optional low-quality placeholder
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  threshold?: number;
  rootMargin?: string;
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high';
}

/**
 * ProgressiveImage コンポーネント
 * 段階的な画像品質向上を実現する遅延読み込み画像コンポーネント
 * 
 * 読み込み段階:
 * 1. プレースホルダー（色付きグラデーション）
 * 2. 低品質プレビュー（blur効果付き）
 * 3. 高品質画像（フルクオリティ）
 */
const ProgressiveImage = memo(({
  src,
  lowQualitySrc,
  alt,
  className,
  placeholder,
  onLoad,
  onError,
  threshold = 0.1,
  rootMargin = '50px',
  width,
  height,
  quality = 'high',
}: ProgressiveImageProps) => {
  const [isInView, setIsInView] = useState(false);
  const [lowQualityLoaded, setLowQualityLoaded] = useState(false);
  const [highQualityLoaded, setHighQualityLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const lowQualityImgRef = useRef<HTMLImageElement>(null);
  const highQualityImgRef = useRef<HTMLImageElement>(null);

  // 低品質画像のsrcを生成（クエリパラメータでサイズを制限）
  const generateLowQualitySrc = (originalSrc: string): string => {
    if (lowQualitySrc) return lowQualitySrc;
    
    // TwitterやX.comの画像の場合、サムネイル版を使用
    if (originalSrc.includes('pbs.twimg.com')) {
      return originalSrc.replace(':large', ':small').replace(':orig', ':small');
    }
    
    // その他のURLでは元のURLをそのまま使用（またはカスタムロジック追加可能）
    return originalSrc;
  };

  const lowQualityImageSrc = generateLowQualitySrc(src);

  useEffect(() => {
    const element = imgRef.current;
    if (!element) return;

    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(element);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => observer.unobserve(element);
  }, [threshold, rootMargin]);

  // 低品質画像の読み込み完了処理
  const handleLowQualityLoad = () => {
    setLowQualityLoaded(true);
  };

  // 高品質画像の読み込み完了処理
  const handleHighQualityLoad = () => {
    setHighQualityLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // プレースホルダー色を生成
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
        // Placeholder state with animated shimmer
        <div
          className="animate-pulse"
          style={placeholderStyle}
        >
          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      ) : (
        // Progressive loading states
        <div className="relative w-full h-full">
          {/* Animated placeholder while images are loading */}
          {!lowQualityLoaded && !highQualityLoaded && (
            <div
              className="absolute inset-0 animate-pulse"
              style={placeholderStyle}
            >
              <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          )}

          {/* Low quality image (blurred preview) */}
          {quality !== 'low' && (
            <img
              ref={lowQualityImgRef}
              src={lowQualityImageSrc}
              alt={alt}
              onLoad={handleLowQualityLoad}
              onError={handleError}
              className={clsx(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-500',
                // Blur effect for low quality
                'filter blur-sm scale-105',
                lowQualityLoaded && !highQualityLoaded ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                ...(width && { width }),
                ...(height && { height }),
              }}
            />
          )}

          {/* High quality image */}
          <img
            ref={highQualityImgRef}
            src={src}
            alt={alt}
            onLoad={handleHighQualityLoad}
            onError={handleError}
            className={clsx(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
              highQualityLoaded ? 'opacity-100' : 'opacity-0',
              className
            )}
            style={{
              ...(width && { width }),
              ...(height && { height }),
            }}
            loading="lazy"
          />

          {/* Loading progress indicator */}
          {isInView && !highQualityLoaded && (
            <div className="absolute bottom-2 right-2 flex items-center space-x-1">
              <div className="w-2 h-2 bg-white/80 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ProgressiveImage.displayName = 'ProgressiveImage';

export default ProgressiveImage;