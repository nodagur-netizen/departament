package handler

import (
	"context"
	"embed"
	"mitm-departament/internal/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// UserService — интерфейс сервиса пользователей
type UserService interface {
	Create(ctx context.Context, u *models.User) error
	GetByID(ctx context.Context, id string) (*models.User, error)
	ListActive(ctx context.Context) ([]models.User, error)
	Update(ctx context.Context, u *models.User) error
	Deactivate(ctx context.Context, id string) error
}

// KeyService — интерфейс сервиса ключей
type KeyService interface {
	Create(ctx context.Context, k *models.Key) error
	GetByID(ctx context.Context, id int64) (*models.Key, error)
	GetByKeyNumber(ctx context.Context, keyNumber string) (*models.Key, error)
	ListAll(ctx context.Context) ([]models.Key, error)
	ListByStatus(ctx context.Context, status models.KeyStatus) ([]models.Key, error)
	Update(ctx context.Context, k *models.Key) error
	Issue(ctx context.Context, keyID int64, userID string, comment string) error
	Return(ctx context.Context, keyID int64, comment string) error
	MarkLost(ctx context.Context, keyID int64, comment string) error
	HistoryForKey(ctx context.Context, keyID int64) ([]models.KeyLog, error)
	HistoryForUser(ctx context.Context, userID string) ([]models.KeyLog, error)
	GetCurrentHolder(ctx context.Context, keyID int64) (*models.KeyLog, error)
}

type Handler struct {
	auth      *AuthHandler
	user      *UserHandler
	key       *KeyHandler
	equipment *EquipmentHandler
	log       *zap.Logger

	frontendFS      embed.FS
	frontendFSReady bool
}

func New(userSvc UserService, keySvc KeyService, equipmentSvc EquipmentService, log *zap.Logger) *Handler {
	return &Handler{
		user:      NewUserHandler(userSvc, keySvc),
		key:       NewKeyHandler(keySvc),
		equipment: NewEquipmentHandler(equipmentSvc),
		log:       log,
	}
}

// SetFrontendFS устанавливает встроенную файловую систему фронтенда
func (h *Handler) SetFrontendFS(fs embed.FS) {
	h.frontendFS = fs
	h.frontendFSReady = true
}

// InitRoutes настраивает все маршруты
func (h *Handler) InitRoutes() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(
		gin.Recovery(),
		h.logging(),
	)

	// 1. Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 2. API Routes
	api := router.Group("/api/v1")
	{
		h.user.RegisterRoutes(api)
		h.key.RegisterRoutes(api)
		h.equipment.RegisterRoutes(api)
	}

	// 3. Страница оборудования (для QR-кодов)
	router.GET("/equipment/:id", func(c *gin.Context) {
		data, err := h.frontendFS.ReadFile("frontend/equipment.html")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	// 4. Раздача фронтенда (SPA)
	router.NoRoute(h.serveFrontend)

	return router
}

func (h *Handler) serveFrontend(c *gin.Context) {
	path := c.Request.URL.Path

	// Игнорируем API-запросы
	if strings.HasPrefix(path, "/api/") {
		c.Status(http.StatusNotFound)
		return
	}

	if !h.frontendFSReady {
		c.Status(http.StatusNotFound)
		return
	}

	// Нормализуем путь: убираем ведущий слеш
	filePath := strings.TrimPrefix(path, "/")

	// Корень → index.html
	if filePath == "" {
		filePath = "index.html"
	}

	// Пытаемся прочитать файл из embed (файлы лежат в frontend/)
	fullPath := "frontend/" + filePath

	data, err := h.frontendFS.ReadFile(fullPath)
	if err == nil {
		contentType := getContentType(filePath)
		// Кэшируем статику, но не HTML
		if strings.HasSuffix(filePath, ".html") {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		} else {
			c.Header("Cache-Control", "public, max-age=86400")
		}
		c.Data(http.StatusOK, contentType, data)
		return
	}

	// SPA fallback: если путь без расширения — отдаём index.html
	if !strings.Contains(filePath, ".") {
		indexData, errIndex := h.frontendFS.ReadFile("frontend/index.html")
		if errIndex == nil {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexData)
			return
		}
	}

	c.Status(http.StatusNotFound)
}

func getContentType(path string) string {
	switch {
	case strings.HasSuffix(path, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(path, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(path, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(path, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(path, ".png"):
		return "image/png"
	case strings.HasSuffix(path, ".jpg"), strings.HasSuffix(path, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(path, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(path, ".ico"):
		return "image/x-icon"
	case strings.HasSuffix(path, ".woff"), strings.HasSuffix(path, ".woff2"):
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}
