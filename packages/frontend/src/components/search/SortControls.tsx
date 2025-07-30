import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ArrowUpDown, Calendar, User, Zap, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface SortOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface SortControlsProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  className?: string;
  disabled?: boolean;
}

const sortOptions: SortOption[] = [
  {
    value: 'relevance',
    label: '関連度順',
    description: 'より関連性の高い結果を上位に表示',
    icon: <Zap className="w-4 h-4" />,
  },
  {
    value: 'date',
    label: '日付順',
    description: 'ブックマークした日付順で表示',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    value: 'author',
    label: '作成者順',
    description: '作成者名のアルファベット順で表示',
    icon: <User className="w-4 h-4" />,
  },
];

const SortControls = ({
  sortBy,
  sortOrder,
  onSortChange,
  className,
  disabled = false,
}: SortControlsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = sortOptions.find(option => option.value === sortBy) || sortOptions[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSortSelect = (newSortBy: string) => {
    if (newSortBy === sortBy) {
      // Toggle order if same sort option
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      onSortChange(sortBy, newOrder);
    } else {
      // Use default order for new sort option
      const defaultOrder = newSortBy === 'relevance' ? 'desc' : 'desc';
      onSortChange(newSortBy, defaultOrder);
    }
    setIsOpen(false);
  };

  const getSortOrderLabel = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    switch (sortBy) {
      case 'date':
        return sortOrder === 'desc' ? '新しい順' : '古い順';
      case 'author':
        return sortOrder === 'asc' ? 'A-Z順' : 'Z-A順';
      case 'relevance':
      default:
        return sortOrder === 'desc' ? '高い順' : '低い順';
    }
  };

  return (
    <div className={clsx('relative', className)} ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'flex items-center space-x-3 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
        )}
      >
        <div className="flex items-center space-x-2">
          <div className="text-gray-500 dark:text-gray-400">
            {currentOption.icon}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {currentOption.label}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {getSortOrderLabel(sortBy, sortOrder)}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                onSortChange(sortBy, newOrder);
              }
            }}
            className={clsx(
              'p-1 rounded transition-colors',
              disabled
                ? 'text-gray-300 dark:text-gray-600'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            title="順序を切り替え"
          >
            <ArrowUpDown className="w-3 h-3" />
          </button>
          
          <ChevronDown 
            className={clsx(
              'w-4 h-4 transition-transform text-gray-400',
              isOpen && 'transform rotate-180'
            )} 
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="py-2">
            <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
              並び順を選択
            </div>
            
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSortSelect(option.value)}
                className={clsx(
                  'w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                  option.value === sortBy && 'bg-primary-50 dark:bg-primary-900/20'
                )}
              >
                <div className="flex items-center space-x-3 flex-1">
                  <div className={clsx(
                    'flex-shrink-0',
                    option.value === sortBy 
                      ? 'text-primary-600 dark:text-primary-400' 
                      : 'text-gray-400 dark:text-gray-500'
                  )}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className={clsx(
                      'font-medium',
                      option.value === sortBy
                        ? 'text-primary-900 dark:text-primary-100'
                        : 'text-gray-900 dark:text-gray-100'
                    )}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {option.description}
                    </div>
                  </div>
                </div>
                
                {option.value === sortBy && (
                  <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          
          {/* Sort Order Toggle */}
          <div className="border-t border-gray-100 dark:border-gray-700 p-3">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              表示順序
            </div>
            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
              <button
                onClick={() => onSortChange(sortBy, 'desc')}
                className={clsx(
                  'flex-1 px-3 py-2 text-xs font-medium rounded transition-colors',
                  sortOrder === 'desc'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                )}
              >
                {sortBy === 'date' ? '新しい順' : sortBy === 'author' ? 'Z-A順' : '高い順'}
              </button>
              <button
                onClick={() => onSortChange(sortBy, 'asc')}
                className={clsx(
                  'flex-1 px-3 py-2 text-xs font-medium rounded transition-colors',
                  sortOrder === 'asc'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                )}
              >
                {sortBy === 'date' ? '古い順' : sortBy === 'author' ? 'A-Z順' : '低い順'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SortControls;