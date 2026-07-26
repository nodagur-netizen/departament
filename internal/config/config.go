// config/config.go
package config

import (
	"fmt"
	"mitm-departament/pkg/valid"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type AuthCfg struct {
	AccessTokenTTL  time.Duration `mapstructure:"access_token_ttl" validate:"required"`
	RefreshTokenTTL time.Duration `mapstructure:"refresh_token_ttl" validate:"required"`
	JwtSecret       string        `mapstructure:"jwt_secret" validate:"required"`
}

// AppConfig общие настройки приложения
type AppConfig struct {
	Name    string `mapstructure:"name" validate:"required"`
	Version string `mapstructure:"version"`
	Env     string `mapstructure:"env" validate:"oneof=development staging production"`
}

// DBConfig настройки базы данных
type DBConfig struct {
	LocalPath string `mapstructure:"local_path" validate:"required,filepath"`
	DataDir   string `mapstructure:"data_dir" validate:"required"`
	ExportDir string `mapstructure:"export_dir" validate:"required"`
}

// LoggerConfig настройки логгера (совместим с zap.Config)
type LoggerConfig struct {
	Level             string   `mapstructure:"level" validate:"oneof=debug info warn error dpanic panic fatal"`
	Development       bool     `mapstructure:"development"`
	DisableCaller     bool     `mapstructure:"disable_caller"`
	DisableStacktrace bool     `mapstructure:"disable_stacktrace"`
	Encoding          string   `mapstructure:"encoding" validate:"oneof=console json"`
	OutputPaths       []string `mapstructure:"output_paths"`
	ErrorOutputPaths  []string `mapstructure:"error_output_paths"`
}

type ServerConfig struct {
	Host           string        `mapstructure:"host" validate:"required"`
	Port           string        `mapstructure:"port" validate:"required"`
	ReadTimeout    time.Duration `mapstructure:"read_timeout" validate:"required"`
	WriteTimeout   time.Duration `mapstructure:"write_timeout" validate:"required"`
	IdleTimeout    time.Duration `mapstructure:"idle_timeout" validate:"required"`
	MaxHeaderBytes int           `mapstructure:"max_header_bytes" validate:"required"`
}

// Config корневая структура конфигурации
type Config struct {
	App    AppConfig    `mapstructure:"app"`
	DB     DBConfig     `mapstructure:"db"`
	Logger LoggerConfig `mapstructure:"logger"`
	Server ServerConfig `mapstructure:"server"`
}

// NewConfig загружает конфигурацию из выбранного YAML-файла в ./configs/.
// REG_CONFIG_NAME выбирает только файл с таким именем; отсутствие или ошибка
// разбора файла останавливают запуск, чтобы приложение не открыло другую БД.
func NewConfig() (*Config, error) {
	// Загружаем .env если есть.
	_ = godotenv.Load() // игнорируем ошибку если файла нет

	configName, ok := os.LookupEnv("REG_CONFIG_NAME")
	if !ok || strings.TrimSpace(configName) == "" {
		return nil, fmt.Errorf("REG_CONFIG_NAME is required and must name a config in ./configs")
	}

	return newConfigFromDir(".", configName)
}

func newConfigFromDir(root, configName string) (*Config, error) {
	configName = strings.TrimSpace(configName)
	if configName == "" {
		return nil, fmt.Errorf("config name is empty")
	}
	if configName != filepath.Base(configName) || strings.Contains(configName, ".") {
		return nil, fmt.Errorf("invalid config name %q", configName)
	}

	return newConfigFromFile(filepath.Join(root, "configs", configName+".yaml"))
}

func newConfigFromFile(configPath string) (*Config, error) {
	// Инициализируем viper.
	v := viper.New()
	v.AutomaticEnv()
	v.SetEnvPrefix("REG")

	v.SetConfigType("yaml")
	v.SetConfigFile(configPath)

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config %q: %w", configPath, err)
	}

	// Устанавливаем дефолты только для необязательных параметров.
	setDefaults(v)

	// Анмаршалим в структуру.
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// Путь к БД обязателен: отсутствие пути — ошибка, а не fallback в корень проекта.
	if err := valid.ValidateStruct(cfg); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	return &cfg, nil
}

// setDefaults устанавливает значения по умолчанию
func setDefaults(v *viper.Viper) {
	// App
	v.SetDefault("app.name", "departamentMITM-app")
	v.SetDefault("app.version", "0.1.0")
	v.SetDefault("app.env", "development")

	// DB.LocalPath намеренно не имеет default: это обязательный параметр.

	// Logger (совместимо с zap)
	v.SetDefault("logger.level", "info")
	v.SetDefault("logger.development", true)
	v.SetDefault("logger.encoding", "console")
	v.SetDefault("logger.output_paths", []string{"stdout"})
	v.SetDefault("logger.error_output_paths", []string{"stderr"})
	v.SetDefault("logger.disable_caller", false)
	v.SetDefault("logger.disable_stacktrace", false)
}

// GetDBDir возвращает директорию, где лежит файл БД
func (c *Config) GetDBDir() string {
	return filepath.Dir(c.DB.LocalPath)
}

// IsProduction возвращает true если окружение production
func (c *Config) IsProduction() bool {
	return c.App.Env == "production"
}
