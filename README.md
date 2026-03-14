# Calculadora Web con Historial (MySQL + Docker)

Aplicación de calculadora con interfaz web, API en Node.js y persistencia de operaciones en MySQL.

## Estructura

```
.
├── front/public/      # UI (HTML/CSS/JS)
├── back/              # API (Express)
├── db/init.sql        # Esquema de base de datos
└── docker-compose.yml # App + MySQL
```

## Requisitos

- Docker Desktop

## Ejecutar

```bash
docker compose up --build -d
```

App en `http://localhost:3000`.

## API

- `POST /api/calculate`
- `GET /api/calculations?limit=20`
- `GET /health`

## Detener

```bash
docker compose down
```
