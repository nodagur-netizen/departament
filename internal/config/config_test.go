package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const validConfig = `app:
  name: department
  version: "0.1.0"
  env: development
db:
  local_path: "./.local/data/department.db"
  data_dir: "./.local/data"
  export_dir: "./.local/export"
logger:
  level: info
  development: true
  encoding: console
  output_paths: [stdout]
  error_output_paths: [stderr]
server:
  host: localhost
  port: "18080"
  read_timeout: 5s
  write_timeout: 10s
  idle_timeout: 120s
  max_header_bytes: 1048576
`

func TestNewConfigUsesExplicitConfigName(t *testing.T) {
	root := t.TempDir()
	configsDir := filepath.Join(root, "configs")
	if err := os.Mkdir(configsDir, 0o755); err != nil {
		t.Fatalf("create configs directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configsDir, "default.yaml"), []byte(strings.Replace(validConfig, "department.db", "default.db", 1)), 0o600); err != nil {
		t.Fatalf("write default config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configsDir, "local.yaml"), []byte(validConfig), 0o600); err != nil {
		t.Fatalf("write local config: %v", err)
	}
	t.Chdir(root)

	for _, test := range []struct {
		name       string
		configName string
		wantDBPath string
	}{
		{name: "local", configName: "local", wantDBPath: "./.local/data/department.db"},
		{name: "default", configName: "default", wantDBPath: "./.local/data/default.db"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("REG_CONFIG_NAME", test.configName)

			cfg, err := NewConfig()
			if err != nil {
				t.Fatalf("load %s config: %v", test.configName, err)
			}
			if cfg.DB.LocalPath != test.wantDBPath {
				t.Fatalf("%s config was not selected, got DB path %q", test.configName, cfg.DB.LocalPath)
			}
		})
	}
}

func TestNewConfigRejectsUnsetOrBlankConfigName(t *testing.T) {
	for _, test := range []struct {
		name  string
		value string
		unset bool
	}{
		{name: "unset", unset: true},
		{name: "blank", value: "   "},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.unset {
				previousValue, wasSet := os.LookupEnv("REG_CONFIG_NAME")
				if err := os.Unsetenv("REG_CONFIG_NAME"); err != nil {
					t.Fatalf("unset REG_CONFIG_NAME: %v", err)
				}
				t.Cleanup(func() {
					if wasSet {
						_ = os.Setenv("REG_CONFIG_NAME", previousValue)
						return
					}
					_ = os.Unsetenv("REG_CONFIG_NAME")
				})
			} else {
				t.Setenv("REG_CONFIG_NAME", test.value)
			}

			_, err := NewConfig()
			if err == nil {
				t.Fatal("expected missing REG_CONFIG_NAME to fail")
			}
			if !strings.Contains(err.Error(), "REG_CONFIG_NAME is required") {
				t.Fatalf("expected contextual configuration name error, got: %v", err)
			}
		})
	}
}

func TestNewConfigFromDirRejectsMissingRequestedConfig(t *testing.T) {
	_, err := newConfigFromDir(t.TempDir(), "local")
	if err == nil {
		t.Fatal("expected missing requested config to fail")
	}
	if !strings.Contains(err.Error(), "configs") || !strings.Contains(err.Error(), "local.yaml") {
		t.Fatalf("error does not identify requested config: %v", err)
	}
}

func TestNewConfigFromFileRejectsMalformedConfig(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "malformed.yaml")
	if err := os.WriteFile(configPath, []byte("db: [\n"), 0o600); err != nil {
		t.Fatalf("write malformed config: %v", err)
	}

	_, err := newConfigFromFile(configPath)
	if err == nil {
		t.Fatal("expected malformed config to fail")
	}
	if !strings.Contains(err.Error(), "read config") {
		t.Fatalf("expected config read error, got: %v", err)
	}
}

func TestNewConfigFromFileRejectsEmptyDatabasePath(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "empty-db-path.yaml")
	contents := strings.Replace(validConfig, "  local_path: \"./.local/data/department.db\"\n", "", 1)
	if err := os.WriteFile(configPath, []byte(contents), 0o600); err != nil {
		t.Fatalf("write config with empty database path: %v", err)
	}

	_, err := newConfigFromFile(configPath)
	if err == nil {
		t.Fatal("expected empty database path to fail validation")
	}
	if !strings.Contains(err.Error(), "LocalPath") {
		t.Fatalf("expected LocalPath validation error, got: %v", err)
	}
}
