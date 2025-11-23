package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
)

type IssueRepository struct {
	db *Database
}

func NewIssueRepository(db *Database) *IssueRepository {
	return &IssueRepository{db: db}
}

func (r *IssueRepository) Create(ctx context.Context, req *models.CreateIssueRequest) (*models.Issue, error) {
	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	query := `
		INSERT INTO issues (session_id, page_url, title, description, screenshot_id, status)
		VALUES ($1, $2, $3, $4, $5, 'new')
		RETURNING issue_id, created_at, updated_at
	`

	issue := &models.Issue{
		SessionID:    sessionID,
		PageURL:      req.PageURL,
		Title:        req.Title,
		Description:  req.Description,
		ScreenshotID: req.ScreenshotID,
		Status:       "new",
	}

	err = r.db.Pool.QueryRow(ctx, query,
		sessionID, req.PageURL, req.Title, req.Description, req.ScreenshotID,
	).Scan(&issue.IssueID, &issue.CreatedAt, &issue.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create issue: %w", err)
	}

	return issue, nil
}

func (r *IssueRepository) GetByID(ctx context.Context, issueID int64) (*models.Issue, error) {
	query := `
		SELECT issue_id, session_id, page_url, title, description, screenshot_id, status, created_at, updated_at
		FROM issues
		WHERE issue_id = $1
	`

	issue := &models.Issue{}
	err := r.db.Pool.QueryRow(ctx, query, issueID).Scan(
		&issue.IssueID, &issue.SessionID, &issue.PageURL,
		&issue.Title, &issue.Description, &issue.ScreenshotID,
		&issue.Status, &issue.CreatedAt, &issue.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get issue: %w", err)
	}

	return issue, nil
}

func (r *IssueRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]*models.IssueResponse, error) {
	query := `
		SELECT issue_id, session_id, page_url, title, description, screenshot_id, status, created_at, updated_at
		FROM issues
		WHERE session_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Pool.Query(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get issues: %w", err)
	}
	defer rows.Close()

	var issues []*models.IssueResponse
	for rows.Next() {
		issue := &models.IssueResponse{}
		err := rows.Scan(
			&issue.IssueID, &issue.SessionID, &issue.PageURL,
			&issue.Title, &issue.Description, &issue.ScreenshotID,
			&issue.Status, &issue.CreatedAt, &issue.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan issue: %w", err)
		}
		issues = append(issues, issue)
	}

	return issues, nil
}

func (r *IssueRepository) UpdateStatus(ctx context.Context, issueID int64, status string) error {
	query := `
		UPDATE issues
		SET status = $1, updated_at = NOW()
		WHERE issue_id = $2
	`

	result, err := r.db.Pool.Exec(ctx, query, status, issueID)
	if err != nil {
		return fmt.Errorf("failed to update issue status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("issue not found")
	}

	return nil
}

func (r *IssueRepository) List(ctx context.Context, limit, offset int) ([]*models.IssueResponse, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM issues`
	var total int
	err := r.db.Pool.QueryRow(ctx, countQuery).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count issues: %w", err)
	}

	// Get issues
	query := `
		SELECT issue_id, session_id, page_url, title, description, screenshot_id, status, created_at, updated_at
		FROM issues
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.Pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list issues: %w", err)
	}
	defer rows.Close()

	var issues []*models.IssueResponse
	for rows.Next() {
		issue := &models.IssueResponse{}
		err := rows.Scan(
			&issue.IssueID, &issue.SessionID, &issue.PageURL,
			&issue.Title, &issue.Description, &issue.ScreenshotID,
			&issue.Status, &issue.CreatedAt, &issue.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan issue: %w", err)
		}
		issues = append(issues, issue)
	}

	return issues, total, nil
}

