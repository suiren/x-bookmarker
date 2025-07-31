import React, { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
  Grid, 
  Settings, 
  Eye, 
  EyeOff, 
  Move, 
  Plus,
  X,
  BarChart3,
  Heart,
  BookOpen,
  Calendar,
  TrendingUp,
  Tag
} from 'lucide-react';
import { BookmarkAnalytics } from '../analytics/BookmarkAnalytics';
import { QuickAccessPanel } from '../QuickAccessPanel';

interface Widget {
  id: string;
  type: 'analytics' | 'quick-access' | 'recent-bookmarks' | 'calendar' | 'trends' | 'popular-tags';
  title: string;
  icon: React.ReactNode;
  component: React.ComponentType<any>;
  size: 'small' | 'medium' | 'large';
  visible: boolean;
  position: { x: number; y: number };
}

interface DashboardLayout {
  widgets: Widget[];
  gridSize: number;
}

const STORAGE_KEY = 'x-bookmarker-dashboard-layout';
const ITEM_TYPE = 'widget';

// Widget types and their configurations
const WIDGET_CONFIGS: Record<string, Omit<Widget, 'id' | 'position' | 'visible'>> = {
  analytics: {
    type: 'analytics',
    title: 'ブックマーク分析',
    icon: <BarChart3 className="h-5 w-5" />,
    component: BookmarkAnalytics,
    size: 'large',
  },
  'quick-access': {
    type: 'quick-access',
    title: 'クイックアクセス',
    icon: <Heart className="h-5 w-5" />,
    component: QuickAccessPanel,
    size: 'medium',
  },
  'recent-bookmarks': {
    type: 'recent-bookmarks',
    title: '最近のブックマーク',
    icon: <BookOpen className="h-5 w-5" />,
    component: RecentBookmarksWidget,
    size: 'medium',
  },
  calendar: {
    type: 'calendar',
    title: 'ブックマークカレンダー',
    icon: <Calendar className="h-5 w-5" />,
    component: CalendarWidget,
    size: 'medium',
  },
  trends: {
    type: 'trends',
    title: 'トレンド',
    icon: <TrendingUp className="h-5 w-5" />,
    component: TrendsWidget,
    size: 'small',
  },
  'popular-tags': {
    type: 'popular-tags',
    title: '人気タグ',
    icon: <Tag className="h-5 w-5" />,
    component: PopularTagsWidget,
    size: 'small',
  },
};

// Placeholder components for additional widgets
function RecentBookmarksWidget() {
  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        最近のブックマークを表示します（実装予定）
      </p>
    </div>
  );
}

function CalendarWidget() {
  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        ブックマークカレンダーを表示します（実装予定）
      </p>
    </div>
  );
}

function TrendsWidget() {
  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        トレンド情報を表示します（実装予定）
      </p>
    </div>
  );
}

function PopularTagsWidget() {
  return (
    <div className="p-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        人気タグを表示します（実装予定）
      </p>
    </div>
  );
}

// Draggable widget component
interface DraggableWidgetProps {
  widget: Widget;
  editMode: boolean;
  onToggleVisibility: (id: string) => void;
  onRemove: (id: string) => void;
}

const DraggableWidget: React.FC<DraggableWidgetProps> = ({
  widget,
  editMode,
  onToggleVisibility,
  onRemove,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ITEM_TYPE,
    item: { id: widget.id, type: widget.type },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: editMode,
  });

  const sizeClasses = {
    small: 'col-span-1 row-span-1',
    medium: 'col-span-2 row-span-2',
    large: 'col-span-3 row-span-3',
  };

  if (!widget.visible && !editMode) return null;

  return (
    <div
      ref={drag}
      className={`
        ${sizeClasses[widget.size]}
        bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm
        ${isDragging ? 'opacity-50' : ''}
        ${editMode ? 'cursor-move' : ''}
        ${!widget.visible ? 'opacity-30' : ''}
      `}
      style={{
        gridColumnStart: widget.position.x + 1,
        gridRowStart: widget.position.y + 1,
      }}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {editMode && <Move className="h-4 w-4 text-gray-400" />}
          {widget.icon}
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">
            {widget.title}
          </h3>
        </div>
        
        {editMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleVisibility(widget.id)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title={widget.visible ? '非表示' : '表示'}
            >
              {widget.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => onRemove(widget.id)}
              className="p-1 text-gray-400 hover:text-red-600 rounded"
              title="削除"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="h-full overflow-hidden">
        <widget.component />
      </div>
    </div>
  );
};

// Drop zone for dashboard
interface DropZoneProps {
  children: React.ReactNode;
  onDrop: (item: { id: string; type: string }, position: { x: number; y: number }) => void;
}

const DropZone: React.FC<DropZoneProps> = ({ children, onDrop }) => {
  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    drop: (item: { id: string; type: string }, monitor) => {
      const offset = monitor.getClientOffset();
      if (offset) {
        // Calculate grid position based on drop position
        const position = { x: 0, y: 0 }; // Simplistic positioning
        onDrop(item, position);
      }
    },
  });

  return (
    <div ref={drop} className="min-h-screen">
      {children}
    </div>
  );
};

export const CustomizableDashboard: React.FC = () => {
  const [layout, setLayout] = useState<DashboardLayout>({
    widgets: [],
    gridSize: 12,
  });
  const [editMode, setEditMode] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Load layout from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setLayout(JSON.parse(saved));
      } else {
        // Default layout
        const defaultWidgets: Widget[] = [
          {
            id: 'analytics-1',
            ...WIDGET_CONFIGS.analytics,
            visible: true,
            position: { x: 0, y: 0 },
          },
          {
            id: 'quick-access-1',
            ...WIDGET_CONFIGS['quick-access'],
            visible: true,
            position: { x: 3, y: 0 },
          },
        ];
        setLayout({ widgets: defaultWidgets, gridSize: 12 });
      }
    } catch (error) {
      console.error('Failed to load dashboard layout:', error);
    }
  }, []);

  // Save layout to localStorage
  const saveLayout = (newLayout: DashboardLayout) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    } catch (error) {
      console.error('Failed to save dashboard layout:', error);
    }
  };

  const handleAddWidget = (type: string) => {
    const config = WIDGET_CONFIGS[type];
    if (!config) return;

    const newWidget: Widget = {
      id: `${type}-${Date.now()}`,
      ...config,
      visible: true,
      position: { x: 0, y: layout.widgets.length * 2 }, // Simple positioning
    };

    const newLayout = {
      ...layout,
      widgets: [...layout.widgets, newWidget],
    };

    setLayout(newLayout);
    saveLayout(newLayout);
    setShowAddDialog(false);
  };

  const handleToggleVisibility = (id: string) => {
    const newLayout = {
      ...layout,
      widgets: layout.widgets.map(widget =>
        widget.id === id ? { ...widget, visible: !widget.visible } : widget
      ),
    };

    setLayout(newLayout);
    saveLayout(newLayout);
  };

  const handleRemoveWidget = (id: string) => {
    const newLayout = {
      ...layout,
      widgets: layout.widgets.filter(widget => widget.id !== id),
    };

    setLayout(newLayout);
    saveLayout(newLayout);
  };

  const handleDrop = (item: { id: string; type: string }, position: { x: number; y: number }) => {
    const newLayout = {
      ...layout,
      widgets: layout.widgets.map(widget =>
        widget.id === item.id ? { ...widget, position } : widget
      ),
    };

    setLayout(newLayout);
    saveLayout(newLayout);
  };

  const availableWidgets = Object.entries(WIDGET_CONFIGS).filter(
    ([type]) => !layout.widgets.some(widget => widget.type === type)
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Grid className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              ダッシュボード
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1 inline" />
              ウィジェット追加
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                editMode
                  ? 'text-white bg-blue-600 hover:bg-blue-700'
                  : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Settings className="h-4 w-4 mr-1 inline" />
              {editMode ? '編集完了' : '編集'}
            </button>
          </div>
        </div>

        {editMode && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              編集モード: ウィジェットをドラッグして配置を変更したり、表示/非表示を切り替えることができます。
            </p>
          </div>
        )}

        {/* Dashboard Grid */}
        <DropZone onDrop={handleDrop}>
          <div 
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${layout.gridSize}, minmax(0, 1fr))`,
              gridAutoRows: '200px',
            }}
          >
            {layout.widgets.map((widget) => (
              <DraggableWidget
                key={widget.id}
                widget={widget}
                editMode={editMode}
                onToggleVisibility={handleToggleVisibility}
                onRemove={handleRemoveWidget}
              />
            ))}
          </div>
        </DropZone>

        {/* Add Widget Dialog */}
        {showAddDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
              className="absolute inset-0 bg-black/50" 
              onClick={() => setShowAddDialog(false)} 
            />
            <div className="relative bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  ウィジェットを追加
                </h3>
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {availableWidgets.map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => handleAddWidget(type)}
                    className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    {config.icon}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {config.title}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        サイズ: {config.size === 'small' ? '小' : config.size === 'medium' ? '中' : '大'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
};