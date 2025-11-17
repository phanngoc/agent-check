# Contributing Guide

Thank you for considering contributing to the User Behavior Tracking System!

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/user-tracker.git`
3. Run the setup script: `./start.sh`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Project Structure

```
.
├── backend/          # Go API server
├── tracker/          # TypeScript tracking library
├── dashboard/        # Next.js admin interface
├── demo/            # Demo website for testing
└── database/        # Database migrations and schema
```

## Making Changes

### Backend (Go)

```bash
cd backend

# Run tests
go test ./...

# Format code
go fmt ./...

# Lint
go vet ./...

# Run locally
go run cmd/server/main.go
```

### Tracker (TypeScript)

```bash
cd tracker

# Build
npm run build

# Watch mode for development
npm run dev

# Lint
npm run lint
```

### Dashboard (Next.js)

```bash
cd dashboard

# Development server
npm run dev

# Build
npm run build

# Lint
npm run lint
```

## Coding Standards

### Go
- Follow [Effective Go](https://golang.org/doc/effective_go.html)
- Use `gofmt` for formatting
- Add comments for exported functions
- Write tests for new features

### TypeScript/JavaScript
- Use TypeScript for type safety
- Follow [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- Use meaningful variable names
- Add JSDoc comments for complex functions

### Database
- Use migrations for schema changes
- Add appropriate indexes
- Consider performance impact
- Test with realistic data volumes

## Testing

### Backend Tests
```bash
cd backend
go test ./... -v
go test -race ./...
go test -cover ./...
```

### Integration Tests
1. Start all services
2. Run demo website tests
3. Verify data appears in dashboard
4. Check replay functionality

## Pull Request Process

1. Update documentation for any changed functionality
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Create PR with clear description

### PR Title Format
- `feat: Add new feature`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Code refactoring`
- `test: Add tests`
- `chore: Maintenance tasks`

## Code Review

All PRs require:
- Passing tests
- Code review approval
- Documentation updates
- No merge conflicts

## Reporting Bugs

Create an issue with:
- Clear title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details
- Screenshots if applicable

## Feature Requests

Create an issue with:
- Problem description
- Proposed solution
- Alternative solutions considered
- Additional context

## Security Issues

Please report security issues privately to [security@example.com] instead of creating public issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
