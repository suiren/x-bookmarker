import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';

// Mock the useShortcutHelp hook
const mockFormatShortcut = vi.fn();
const mockGetShortcutsByCategory = vi.fn();

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useShortcutHelp: () => ({
    formatShortcut: mockFormatShortcut,
    getShortcutsByCategory: mockGetShortcutsByCategory,
  }),
}));

const mockShortcutData = [
  {
    category: '検索',
    shortcuts: [
      { key: '/', description: 'グローバル検索を開く', disabled: false, ctrlKey: false },
      { key: 's', description: '検索ページに移動', disabled: false, ctrlKey: true },
    ],
  },
  {
    category: 'ナビゲーション',
    shortcuts: [
      { key: 'h', description: 'ホームに移動', disabled: false, ctrlKey: false },
      { key: 'b', description: 'ブックマーク一覧に移動', disabled: false, ctrlKey: false },
    ],
  },
];

describe('KeyboardShortcutsModal', () => {
  beforeEach(() => {
    mockGetShortcutsByCategory.mockReturnValue(mockShortcutData);
    mockFormatShortcut.mockImplementation((shortcut) => {
      if (shortcut.ctrlKey) {
        return `Ctrl+${shortcut.key.toUpperCase()}`;
      }
      return shortcut.key.toUpperCase();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when open is false', () => {
    render(<KeyboardShortcutsModal open={false} onClose={() => {}} />);
    
    expect(screen.queryByText('キーボードショートカット')).not.toBeInTheDocument();
  });

  it('renders modal when open is true', () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    expect(screen.getByText('キーボードショートカット')).toBeInTheDocument();
  });

  it('displays shortcut categories and shortcuts', () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    // Check categories
    expect(screen.getByText('検索')).toBeInTheDocument();
    expect(screen.getByText('ナビゲーション')).toBeInTheDocument();
    
    // Check shortcuts
    expect(screen.getByText('グローバル検索を開く')).toBeInTheDocument();
    expect(screen.getByText('検索ページに移動')).toBeInTheDocument();
    expect(screen.getByText('ホームに移動')).toBeInTheDocument();
    expect(screen.getByText('ブックマーク一覧に移動')).toBeInTheDocument();
  });

  it('displays formatted keyboard shortcuts', () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const mockOnClose = vi.fn();
    render(<KeyboardShortcutsModal open={true} onClose={mockOnClose} />);
    
    const closeButton = screen.getByLabelText('閉じる');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const mockOnClose = vi.fn();
    render(<KeyboardShortcutsModal open={true} onClose={mockOnClose} />);
    
    // Click on the overlay (backdrop)
    const overlay = screen.getByRole('generic', { hidden: true });
    fireEvent.click(overlay);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows help tips section', () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    expect(screen.getByText('ヒント:')).toBeInTheDocument();
    expect(screen.getByText(/入力フィールド内ではショートカットは無効化されます/)).toBeInTheDocument();
    expect(screen.getByText(/Mac では Ctrl キーの代わりに ⌘ キーを使用します/)).toBeInTheDocument();
  });

  it('filters out disabled shortcuts', () => {
    const dataWithDisabled = [
      {
        category: 'テスト',
        shortcuts: [
          { key: 'a', description: '有効なショートカット', disabled: false },
          { key: 'b', description: '無効なショートカット', disabled: true },
        ],
      },
    ];
    
    mockGetShortcutsByCategory.mockReturnValue(dataWithDisabled);
    
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    expect(screen.getByText('有効なショートカット')).toBeInTheDocument();
    expect(screen.queryByText('無効なショートカット')).not.toBeInTheDocument();
  });

  it('handles empty shortcut categories', () => {
    mockGetShortcutsByCategory.mockReturnValue([]);
    
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    // Modal should still render but with no shortcuts
    expect(screen.getByText('キーボードショートカット')).toBeInTheDocument();
    expect(screen.queryByText('検索')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    
    const closeButton = screen.getByLabelText('閉じる');
    expect(closeButton).toHaveAttribute('aria-label', '閉じる');
    
    const modal = screen.getByRole('dialog', { hidden: true });
    expect(modal).toBeInTheDocument();
  });
});