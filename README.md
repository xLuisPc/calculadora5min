# Calculadora Cientifica con Historial (MySQL + Docker)

Aplicación de calculadora científica con interfaz web, API en Node.js y persistencia de operaciones en MySQL.

## Estructura

```
.
├── front/public/      # UI (HTML/CSS/JS)
├── back/              # API (Express + evaluador de expresiones)
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

## Funciones disponibles

- Operaciones básicas: `+`, `-`, `*`, `/`
- Paréntesis y potencias: `(`, `)`, `^`
- Trigonometría: `sin`, `cos`, `tan` en modo `DEG` o `RAD`
- Logaritmos: `log`, `ln`
- Otras científicas: `sqrt`, `abs`, `1/x`, `x²`, constantes `pi` y `e`
- Historial persistente de las últimas operaciones

## API

- `POST /api/calculate`
- `GET /api/calculations?limit=20`
- `GET /health`

### Ejemplo de cálculo científico

```json
{
	"expression": "sin(pi/2)+sqrt(16)",
	"mode": "rad"
}
```

## Detener

```bash
docker compose down
```
