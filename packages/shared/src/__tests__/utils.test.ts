import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  truncateText,
  extractHashtags,
  extractMentions,
  extractUrls,
  sanitizeString,
  generateSlug,
  debounce,
  throttle,
  calculateProgress,
  formatBytes,
  isValidUrl,
  isValidEmail,
  generateRandomColor,
  getContrastColor,
  sleep,
  retry,
} from '../utils';

describe('Utils', () => {
  describe('Date formatting', () => {
    const testDate = new Date('2024-01-15T10:30:00Z');

    it('should format date correctly', () => {
      const formatted = formatDate(testDate);
      expect(formatted).toMatch(/Jan 15, 2024/);
    });

    it('should format date time correctly', () => {
      const formatted = formatDateTime(testDate);
      expect(formatted).toContain('Jan 15, 2024');
      expect(formatted).toMatch(/\d{1,2}:\d{2}/); // Match time format
    });

    it('should format relative time correctly', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      expect(formatRelativeTime(new Date(now.getTime() - 30 * 1000))).toBe('just now');
      expect(formatRelativeTime(oneMinuteAgo)).toBe('1m ago');
      expect(formatRelativeTime(oneHourAgo)).toBe('1h ago');
      expect(formatRelativeTime(oneDayAgo)).toBe('1d ago');
    });
  });

  describe('Text processing', () => {
    it('should truncate text correctly', () => {
      const longText = 'This is a very long text that should be truncated';
      const truncated = truncateText(longText, 20);
      expect(truncated).toBe('This is a very lo...');
      expect(truncated.length).toBe(20);
    });

    it('should not truncate short text', () => {
      const shortText = 'Short text';
      const result = truncateText(shortText, 20);
      expect(result).toBe(shortText);
    });

    it('should extract hashtags correctly', () => {
      const text = 'This is a #test tweet with #multiple #hashtags';
      const hashtags = extractHashtags(text);
      expect(hashtags).toEqual(['test', 'multiple', 'hashtags']);
    });

    it('should extract mentions correctly', () => {
      const text = 'Hello @user1 and @user2, how are you?';
      const mentions = extractMentions(text);
      expect(mentions).toEqual(['user1', 'user2']);
    });

    it('should extract URLs correctly', () => {
      const text = 'Check out https://example.com and http://test.org';
      const urls = extractUrls(text);
      expect(urls).toEqual(['https://example.com', 'http://test.org']);
    });

    it('should sanitize strings correctly', () => {
      const dirtyString = 'Hello! @#$%^&*() World!!!';
      const clean = sanitizeString(dirtyString);
      expect(clean).toBe('Hello  World'); // sanitizeString preserves spaces between words
    });

    it('should generate slugs correctly', () => {
      const text = 'This is a Test Title with Special Characters!@#';
      const slug = generateSlug(text);
      expect(slug).toBe('this-is-a-test-title-with-special-characters');
    });
  });

  describe('Utility functions', () => {
    it('should debounce function calls', async () => {
      let callCount = 0;
      const debouncedFn = debounce(() => callCount++, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(callCount).toBe(0);

      await sleep(150);
      expect(callCount).toBe(1);
    });

    it('should throttle function calls', async () => {
      let callCount = 0;
      const throttledFn = throttle(() => callCount++, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(callCount).toBe(1);

      await sleep(150);
      throttledFn();
      expect(callCount).toBe(2);
    });

    it('should calculate progress correctly', () => {
      expect(calculateProgress(25, 100)).toBe(25);
      expect(calculateProgress(0, 100)).toBe(0);
      expect(calculateProgress(100, 100)).toBe(100);
      expect(calculateProgress(50, 0)).toBe(0);
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should validate URLs correctly', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://test.org')).toBe(true);
      expect(isValidUrl('ftp://files.com')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });

    it('should validate emails correctly', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should generate random colors', () => {
      const color = generateRandomColor();
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should calculate contrast colors', () => {
      expect(getContrastColor('#FFFFFF')).toBe('#000000');
      expect(getContrastColor('#000000')).toBe('#FFFFFF');
      expect(getContrastColor('#FF0000')).toBe('#FFFFFF');
    });
  });

  describe('Async utilities', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(100);
    });

    it('should retry failed functions', async () => {
      let attempts = 0;
      const flakyFunction = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retry(flakyFunction, 3, 10);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should give up after max retries', async () => {
      const alwaysFailingFunction = async () => {
        throw new Error('Always fails');
      };

      await expect(retry(alwaysFailingFunction, 2, 10)).rejects.toThrow('Always fails');
    });
  });
});