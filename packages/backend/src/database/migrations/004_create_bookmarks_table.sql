-- Create bookmarks table
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  x_tweet_id VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  author_username VARCHAR(255) NOT NULL,
  author_display_name VARCHAR(255) NOT NULL,
  author_avatar_url TEXT,
  media_urls TEXT[] DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  hashtags TEXT[] DEFAULT '{}',
  mentions TEXT[] DEFAULT '{}',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  is_archived BOOLEAN DEFAULT FALSE,
  bookmarked_at TIMESTAMP WITH TIME ZONE NOT NULL,
  search_vector tsvector,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, x_tweet_id)
);

-- Create indexes for performance
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_category_id ON bookmarks(category_id);
CREATE INDEX idx_bookmarks_bookmarked_at ON bookmarks(bookmarked_at DESC);
CREATE INDEX idx_bookmarks_author ON bookmarks(author_username);
CREATE INDEX idx_bookmarks_tags ON bookmarks USING GIN(tags);
CREATE INDEX idx_bookmarks_hashtags ON bookmarks USING GIN(hashtags);
CREATE INDEX idx_bookmarks_mentions ON bookmarks USING GIN(mentions);
CREATE INDEX idx_bookmarks_search_vector ON bookmarks USING GIN(search_vector);
CREATE INDEX idx_bookmarks_is_archived ON bookmarks(is_archived) WHERE is_archived = FALSE;
CREATE INDEX idx_bookmarks_x_tweet_id ON bookmarks(x_tweet_id);

-- Create full-text search trigger
CREATE OR REPLACE FUNCTION update_bookmark_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = 
    setweight(to_tsvector('english_unaccent', coalesce(NEW.content, '')), 'A') ||
    setweight(to_tsvector('english_unaccent', coalesce(NEW.author_display_name, '')), 'B') ||
    setweight(to_tsvector('english_unaccent', array_to_string(NEW.tags, ' ')), 'C') ||
    setweight(to_tsvector('english_unaccent', array_to_string(NEW.hashtags, ' ')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bookmark_search_vector_trigger
  BEFORE INSERT OR UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_bookmark_search_vector();

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();