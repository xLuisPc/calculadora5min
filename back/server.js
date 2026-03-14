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
const scientificFunctions = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs']);
const constants = {
  pi: Math.PI,
  e: Math.E
};
const operatorConfig = {
  '+': { precedence: 1, associativity: 'left', arity: 2 },
  '-': { precedence: 1, associativity: 'left', arity: 2 },
  '*': { precedence: 2, associativity: 'left', arity: 2 },
  '/': { precedence: 2, associativity: 'left', arity: 2 },
  '^': { precedence: 4, associativity: 'right', arity: 2 },
  neg: { precedence: 3, associativity: 'right', arity: 1 }
};

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

function normalizeExpression(expression) {
  return String(expression)
    .trim()
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/gi, 'pi')
    .toLowerCase();
}

function tokenizeExpression(expression) {
  const rawExpression = normalizeExpression(expression);
  const tokens = [];

  if (!rawExpression) {
    throw new Error('La expresión está vacía');
  }

  for (let index = 0; index < rawExpression.length;) {
    const char = rawExpression[index];

    if (/\d|\./.test(char)) {
      let number = '';
      let dotCount = 0;

      while (index < rawExpression.length && /\d|\./.test(rawExpression[index])) {
        if (rawExpression[index] === '.') {
          dotCount += 1;
        }

        if (dotCount > 1) {
          throw new Error('Número inválido en la expresión');
        }

        number += rawExpression[index];
        index += 1;
      }

      if (number === '.') {
        throw new Error('Número inválido en la expresión');
      }

      tokens.push({ type: 'number', value: Number(number) });
      continue;
    }

    if ('+-*/^'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'open', value: char });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'close', value: char });
      index += 1;
      continue;
    }

    if (/[a-z]/.test(char)) {
      let identifier = '';

      while (index < rawExpression.length && /[a-z]/.test(rawExpression[index])) {
        identifier += rawExpression[index];
        index += 1;
      }

      if (scientificFunctions.has(identifier)) {
        tokens.push({ type: 'function', value: identifier });
        continue;
      }

      if (Object.hasOwn(constants, identifier)) {
        tokens.push({ type: 'constant', value: identifier });
        continue;
      }

      throw new Error(`Identificador inválido: ${identifier}`);
    }

    throw new Error(`Carácter inválido: ${char}`);
  }

  const withImplicitMultiplication = [];

  tokens.forEach((token, tokenIndex) => {
    const previousToken = withImplicitMultiplication[withImplicitMultiplication.length - 1];

    if (previousToken) {
      const previousEndsValue = ['number', 'constant', 'close'].includes(previousToken.type);
      const currentStartsValue = ['number', 'constant', 'function', 'open'].includes(token.type);

      if (previousEndsValue && currentStartsValue) {
        withImplicitMultiplication.push({ type: 'operator', value: '*' });
      }
    }

    withImplicitMultiplication.push(token);
  });

  return withImplicitMultiplication;
}

function toReversePolishNotation(tokens) {
  const output = [];
  const stack = [];
  let previousToken = null;

  tokens.forEach((token) => {
    if (token.type === 'number' || token.type === 'constant') {
      output.push(token);
      previousToken = token;
      return;
    }

    if (token.type === 'function') {
      stack.push(token);
      previousToken = token;
      return;
    }

    if (token.type === 'open') {
      stack.push(token);
      previousToken = token;
      return;
    }

    if (token.type === 'close') {
      while (stack.length > 0 && stack[stack.length - 1].type !== 'open') {
        output.push(stack.pop());
      }

      if (stack.length === 0) {
        throw new Error('Paréntesis desbalanceados');
      }

      stack.pop();

      if (stack.length > 0 && stack[stack.length - 1].type === 'function') {
        output.push(stack.pop());
      }

      previousToken = token;
      return;
    }

    if (token.type !== 'operator') {
      throw new Error('Expresión inválida');
    }

    const unaryContext = !previousToken || previousToken.type === 'operator' || previousToken.type === 'open';
    let resolvedOperator = token.value;

    if (unaryContext) {
      if (token.value === '+') {
        previousToken = { type: 'operator', value: '+' };
        return;
      }

      if (token.value === '-') {
        resolvedOperator = 'neg';
      } else {
        throw new Error('Operador en posición inválida');
      }
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1];

      if (top.type !== 'operator') {
        break;
      }

      const currentOperator = operatorConfig[resolvedOperator];
      const topOperator = operatorConfig[top.value];
      const shouldPop = currentOperator.associativity === 'left'
        ? currentOperator.precedence <= topOperator.precedence
        : currentOperator.precedence < topOperator.precedence;

      if (!shouldPop) {
        break;
      }

      output.push(stack.pop());
    }

    stack.push({ type: 'operator', value: resolvedOperator });
    previousToken = { type: 'operator', value: resolvedOperator };
  });

  if (previousToken && (previousToken.type === 'operator' || previousToken.type === 'open')) {
    throw new Error('La expresión está incompleta');
  }

  while (stack.length > 0) {
    const token = stack.pop();

    if (token.type === 'open' || token.type === 'close') {
      throw new Error('Paréntesis desbalanceados');
    }

    output.push(token);
  }

  return output;
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error('El resultado no es finito');
  }

  if (Math.abs(value) < 1e-12) {
    return 0;
  }

  return Number.parseFloat(value.toPrecision(12));
}

function convertAngle(value, mode) {
  if (mode === 'rad') {
    return value;
  }

  return (value * Math.PI) / 180;
}

function applyScientificFunction(name, value, mode) {
  switch (name) {
    case 'sin':
      return Math.sin(convertAngle(value, mode));
    case 'cos':
      return Math.cos(convertAngle(value, mode));
    case 'tan': {
      const radians = convertAngle(value, mode);
      const cosine = Math.cos(radians);

      if (Math.abs(cosine) < 1e-10) {
        throw new Error('La tangente es indefinida para ese valor');
      }

      return Math.tan(radians);
    }
    case 'log':
      if (value <= 0) {
        throw new Error('El logaritmo requiere un valor positivo');
      }
      return Math.log10(value);
    case 'ln':
      if (value <= 0) {
        throw new Error('El logaritmo natural requiere un valor positivo');
      }
      return Math.log(value);
    case 'sqrt':
      if (value < 0) {
        throw new Error('La raíz cuadrada no admite valores negativos');
      }
      return Math.sqrt(value);
    case 'abs':
      return Math.abs(value);
    default:
      throw new Error('Función inválida');
  }
}

function applyScientificOperator(operator, left, right) {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        throw new Error('No se puede dividir por cero');
      }
      return left / right;
    case '^':
      return left ** right;
    default:
      throw new Error('Operador inválido');
  }
}

function evaluateExpression(expression, mode = 'deg') {
  const tokens = tokenizeExpression(expression);
  const rpn = toReversePolishNotation(tokens);
  const stack = [];

  rpn.forEach((token) => {
    if (token.type === 'number') {
      stack.push(token.value);
      return;
    }

    if (token.type === 'constant') {
      stack.push(constants[token.value]);
      return;
    }

    if (token.type === 'function') {
      if (stack.length < 1) {
        throw new Error('Expresión inválida');
      }

      const value = stack.pop();
      stack.push(normalizeNumber(applyScientificFunction(token.value, value, mode)));
      return;
    }

    if (token.type === 'operator') {
      if (token.value === 'neg') {
        if (stack.length < 1) {
          throw new Error('Expresión inválida');
        }

        stack.push(normalizeNumber(-stack.pop()));
        return;
      }

      if (stack.length < 2) {
        throw new Error('Expresión inválida');
      }

      const right = stack.pop();
      const left = stack.pop();
      stack.push(normalizeNumber(applyScientificOperator(token.value, left, right)));
    }
  });

  if (stack.length !== 1) {
    throw new Error('Expresión inválida');
  }

  return normalizeNumber(stack[0]);
}

function buildLegacyExpression(first, second, operator) {
  return `${first} ${operator} ${second}`;
}

function buildStoredExpression(expression, mode) {
  if (/\b(sin|cos|tan)\b/i.test(expression)) {
    return `${expression} [${mode.toUpperCase()}]`;
  }

  return expression;
}

async function ensureSchemaCompatibility() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calculations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      operand1 DOUBLE NULL,
      operand2 DOUBLE NULL,
      operator VARCHAR(20) NULL,
      expression VARCHAR(255) NOT NULL,
      result DOUBLE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('ALTER TABLE calculations MODIFY operand1 DOUBLE NULL');
  await pool.query('ALTER TABLE calculations MODIFY operand2 DOUBLE NULL');
  await pool.query('ALTER TABLE calculations MODIFY operator VARCHAR(20) NULL');
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
    const { expression, mode = 'deg', operand1, operand2, operator } = req.body;
    let result;
    let expressionToStore;
    let storedOperand1 = null;
    let storedOperand2 = null;
    let storedOperator = 'expr';

    if (typeof expression === 'string' && expression.trim()) {
      if (!['deg', 'rad'].includes(mode)) {
        return res.status(400).json({ error: 'Modo inválido' });
      }

      if (expression.length > 200) {
        return res.status(400).json({ error: 'La expresión es demasiado larga' });
      }

      const normalizedExpression = normalizeExpression(expression);
      result = evaluateExpression(normalizedExpression, mode);
      expressionToStore = buildStoredExpression(normalizedExpression, mode);
    } else {
      const first = Number(operand1);
      const second = Number(operand2);

      if (Number.isNaN(first) || Number.isNaN(second)) {
        return res.status(400).json({ error: 'Los operandos deben ser numéricos' });
      }

      if (!allowedOperators.has(operator)) {
        return res.status(400).json({ error: 'Operador inválido' });
      }

      storedOperand1 = first;
      storedOperand2 = second;
      storedOperator = operator;
      result = calculate(first, second, operator);
      expressionToStore = buildLegacyExpression(first, second, operator);
    }

    const [insertResult] = await pool.execute(
      'INSERT INTO calculations (operand1, operand2, operator, expression, result) VALUES (?, ?, ?, ?, ?)',
      [storedOperand1, storedOperand2, storedOperator, expressionToStore, result]
    );

    return res.json({
      id: insertResult.insertId,
      expression: expressionToStore,
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
  await ensureSchemaCompatibility();
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
  });
}

start().catch((error) => {
  console.error('No se pudo iniciar la app:', error);
  process.exit(1);
});
