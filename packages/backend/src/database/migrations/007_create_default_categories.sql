-- Insert default categories for each user (this will be handled by the application)
-- This migration creates a function to initialize default categories for new users

CREATE OR REPLACE FUNCTION create_default_categories(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO categories (user_id, name, description, color, icon, "order", is_default) VALUES
    (user_uuid, '技術・AI', 'Technology and AI related bookmarks', '#3B82F6', 'cpu', 1, true),
    (user_uuid, '趣味・ゲーム', 'Hobby and gaming related bookmarks', '#10B981', 'gamepad-2', 2, true),
    (user_uuid, '料理・レシピ', 'Cooking and recipe bookmarks', '#F59E0B', 'chef-hat', 3, true),
    (user_uuid, '読書・書籍', 'Reading and book related bookmarks', '#8B5CF6', 'book-open', 4, true),
    (user_uuid, '未分類', 'Uncategorized bookmarks', '#6B7280', 'folder', 5, true);
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically create default categories for new users
CREATE OR REPLACE FUNCTION trigger_create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_default_categories_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_categories();