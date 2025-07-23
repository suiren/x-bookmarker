# X Bookmarker

Advanced bookmark management application for X (Twitter) with intelligent categorization, powerful search, and robust data management.

## Features

- **X API Integration**: Secure OAuth 2.0 authentication and bookmark import
- **Smart Categorization**: AI-powered auto-categorization and tag suggestions
- **Advanced Search**: Full-text search with filtering and faceted results
- **Responsive UI**: Modern React interface with dark/light modes
- **High Performance**: Optimized for 10,000+ bookmarks with virtual scrolling
- **Data Management**: Export, backup, and sync capabilities

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Zustand
- **Backend**: Node.js, Express, TypeScript, PostgreSQL, Redis
- **Infrastructure**: Docker, nginx, AWS S3
- **AI**: OpenAI/Anthropic API for content analysis

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+

### Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd x-bookmarker
```

2. Install dependencies:
```bash
npm install
```

3. Start development environment:
```bash
npm run docker:up
npm run dev
```

4. Run database migrations:
```bash
npm run db:migrate
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/x_bookmarker
REDIS_URL=redis://localhost:6379

# X API
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
X_REDIRECT_URI=http://localhost:3000/auth/x/callback

# AI Service
AI_PROVIDER=openai
AI_API_KEY=your_ai_api_key
AI_MODEL=gpt-3.5-turbo

# Security
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret

# Storage
STORAGE_PROVIDER=local
STORAGE_PATH=./storage
```

## Scripts

- `npm run dev` - Start development servers
- `npm run build` - Build all packages
- `npm run test` - Run all tests
- `npm run lint` - Lint all packages
- `npm run docker:up` - Start Docker services
- `npm run db:migrate` - Run database migrations

## Project Structure

```
x-bookmarker/
├── packages/
│   ├── backend/          # Express API server
│   ├── frontend/         # React application
│   └── shared/           # Shared types and utilities
├── docker-compose.yml    # Development environment
└── README.md
```

## License

MIT License