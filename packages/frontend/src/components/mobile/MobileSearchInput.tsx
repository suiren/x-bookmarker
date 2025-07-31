import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Mic, Camera } from 'lucide-react';

interface MobileSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  showVoiceSearch?: boolean;
  showImageSearch?: boolean;
}

export const MobileSearchInput: React.FC<MobileSearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = '検索...',
  className = '',
  autoFocus = false,
  onFocus,
  onBlur,
  showVoiceSearch = false,
  showImageSearch = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit?.(value.trim());
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleVoiceSearch = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('音声検索はサポートされていません');
      return;
    }

    if (isRecording) {
      // 録音停止
      setIsRecording(false);
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      setIsRecording(true);
      
      // Web Speech API を使用
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onChange(transcript);
        setIsRecording(false);
      };

      recognition.onerror = () => {
        setIsRecording(false);
        alert('音声認識でエラーが発生しました');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();

      // ハプティックフィードバック
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      setIsRecording(false);
      console.error('Voice search error:', error);
    }
  };

  const handleImageSearch = () => {
    // 画像検索機能（今後実装）
    console.log('Image search functionality');
    
    // ファイル選択ダイアログを開く
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // カメラを優先
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        // 画像からテキスト抽出やビジュアル検索の実装
        console.log('Selected image:', file);
        // TODO: OCRや画像検索APIの実装
      }
    };
    
    input.click();
  };

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <div
        className={`
          relative flex items-center bg-white dark:bg-gray-800 border-2 rounded-xl transition-all duration-200 overflow-hidden
          ${isFocused 
            ? 'border-blue-500 dark:border-blue-400 shadow-lg' 
            : 'border-gray-200 dark:border-gray-600 shadow-sm'
          }
        `}
      >
        {/* 検索アイコン */}
        <div className="flex items-center justify-center w-12 h-12 text-gray-400">
          <Search className="h-5 w-5" />
        </div>

        {/* 入力フィールド */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 h-12 px-0 py-3 text-base bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 border-none outline-none"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
        />

        {/* 右側のアクションボタン */}
        <div className="flex items-center gap-1 pr-2">
          {/* クリアボタン */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="touch-button p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="クリア"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          {/* 音声検索ボタン */}
          {showVoiceSearch && (
            <button
              type="button"
              onClick={handleVoiceSearch}
              className={`
                touch-button p-2 rounded-lg transition-colors
                ${isRecording 
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/20' 
                  : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }
              `}
              aria-label={isRecording ? '録音停止' : '音声検索'}
            >
              <Mic className={`h-5 w-5 ${isRecording ? 'animate-pulse' : ''}`} />
            </button>
          )}

          {/* 画像検索ボタン */}
          {showImageSearch && (
            <button
              type="button"
              onClick={handleImageSearch}
              className="touch-button p-2 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              aria-label="画像検索"
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* 音声認識中のインジケーター */}
      {isRecording && (
        <div className="absolute -bottom-12 left-0 right-0 flex items-center justify-center">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            音声を認識中...
          </div>
        </div>
      )}

      {/* フォーカス時のサジェスト背景 */}
      {isFocused && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 z-50 max-h-64 overflow-y-auto">
          {/* サジェスト内容は親コンポーネントで管理 */}
        </div>
      )}
    </form>
  );
};

// シンプル版（基本機能のみ）
export const SimpleMobileSearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, onSubmit, placeholder = '検索...' }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit?.(value.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl">
        <div className="flex items-center justify-center w-10 h-10 text-gray-400">
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-10 px-0 py-2 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 border-none outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="touch-button p-2 mr-1 rounded-lg text-gray-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
};