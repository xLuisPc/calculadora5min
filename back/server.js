const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'calculadora',
  waitForConnections: true,
  connectionLimit: 10
};

let pool;

const allowedOperators = new Set(['+', '-', '*', '/']);

function calculate(operand1, operand2, operator) {
  switch (operator) {
    case '+':
      return operand1 + operand2;
    case '-':
      return operand1 - operand2;
    case '*':
      return operand1 * operand2;
    case '/':
      if (operand2 === 0) {
        throw new Error('No se puede dividir por cero');
      }
      return operand1 / operand2;
    default:
      throw new Error('Operador inválido');
  }
}

async function connectWithRetry(maxRetries = 20, delayMs = 3000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      pool = mysql.createPool(dbConfig);
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      console.log(`Intento ${attempt}/${maxRetries} falló conectando a MySQL. Reintentando en ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'front', 'public')));

app.post('/api/calculate', async (req, res) => {
  try {
    const { operand1, operand2, operator } = req.body;

    const first = Number(operand1);
    const second = Number(operand2);

    if (Number.isNaN(first) || Number.isNaN(second)) {
      return res.status(400).json({ error: 'Los operandos deben ser numéricos' });
    }

    if (!allowedOperators.has(operator)) {
      return res.status(400).json({ error: 'Operador inválido' });
    }

    const result = calculate(first, second, operator);
    const expression = `${first} ${operator} ${second}`;

    const [insertResult] = await pool.execute(
      'INSERT INTO calculations (operand1, operand2, operator, expression, result) VALUES (?, ?, ?, ?, ?)',
      [first, second, operator, expression, result]
    );

    return res.json({
      id: insertResult.insertId,
      expression,
      result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Error al calcular' });
  }
});

app.get('/api/calculations', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const [rows] = await pool.query(
      'SELECT id, expression, result, created_at FROM calculations ORDER BY id DESC LIMIT ?',
      [limit]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo obtener el historial' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await connectWithRetry();
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
  });
}

start().catch((error) => {
  console.error('No se pudo iniciar la app:', error);
  process.exit(1);
});
