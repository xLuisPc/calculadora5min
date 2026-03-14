const keypad = document.getElementById('keypad');
const display = document.getElementById('display');
const operationEl = document.getElementById('operation');
const errorEl = document.getElementById('error');
const historyEl = document.getElementById('history');
const angleModeButton = document.getElementById('angle-mode');

let expression = '';
let lastExpression = '';
let lastResult = null;
let justCalculated = false;
let angleMode = 'deg';

function formatExpression(value) {
  return value
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/-/g, '−')
    .replace(/\^/g, ' ^ ')
    .replace(/sqrt\(/g, '√(')
    .replace(/pi/g, 'π');
}

function endsWithValue(value) {
  return /(\d|\.|\)|pi|e)$/i.test(value);
}

function startsValueToken(token) {
  return /^(\d|\.|pi|e|\(|sin\(|cos\(|tan\(|ln\(|log\(|sqrt\(|abs\()/i.test(token);
}

function updateModeButton() {
  angleModeButton.textContent = angleMode.toUpperCase();
  angleModeButton.setAttribute('aria-pressed', String(angleMode === 'rad'));
}

function updateDisplay() {
  const displayValue = expression || (lastResult !== null ? String(lastResult) : '0');
  display.value = formatExpression(displayValue);

  if (expression) {
    operationEl.textContent = `${angleMode.toUpperCase()} · editando`;
  } else if (lastExpression) {
    operationEl.textContent = `${formatExpression(lastExpression)} =`;
  } else {
    operationEl.innerHTML = '&nbsp;';
  }

  updateModeButton();
}

function clearExpression() {
  expression = '';
  lastExpression = '';
  lastResult = null;
  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function prepareForInput(token) {
  if (!justCalculated) {
    return;
  }

  const continuesPreviousResult = ['+', '-', '*', '/', '^'].includes(token);

  if (continuesPreviousResult && lastResult !== null) {
    expression = String(lastResult);
  } else {
    expression = '';
    lastExpression = '';
  }

  justCalculated = false;
}

function appendToken(token) {
  prepareForInput(token);

  if (expression && startsValueToken(token) && endsWithValue(expression)) {
    expression += '*';
  }

  expression += token;
  errorEl.textContent = '';
  updateDisplay();
}

function appendNumber(token) {
  appendToken(token);
}

function appendDecimal() {
  prepareForInput('.');

  const lastNumberMatch = expression.match(/(\d*\.?\d*)$/);
  const currentSegment = lastNumberMatch ? lastNumberMatch[0] : '';

  if (currentSegment.includes('.')) {
    return;
  }

  if (!expression || /[+\-*/^(]$/.test(expression)) {
    expression += '0.';
  } else if (endsWithValue(expression)) {
    expression += expression.endsWith(')') || expression.endsWith('pi') || expression.endsWith('e') ? '*0.' : '.';
  } else {
    expression += '.';
  }

  errorEl.textContent = '';
  updateDisplay();
}

function appendOperator(token) {
  prepareForInput(token);

  if (!expression) {
    if (token === '-') {
      expression = '-';
      updateDisplay();
    }
    return;
  }

  if (/[+\-*/^]$/.test(expression)) {
    if (token === '-' && !expression.endsWith('-')) {
      expression += '-';
    } else {
      expression = `${expression.slice(0, -1)}${token}`;
    }
  } else {
    expression += token;
  }

  errorEl.textContent = '';
  updateDisplay();
}

function deleteLastCharacter() {
  if (!expression) {
    return;
  }

  expression = expression.slice(0, -1);
  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function appendPower() {
  if (!expression && lastResult !== null) {
    expression = String(lastResult);
  }

  if (!expression || /[+\-*/^(]$/.test(expression)) {
    return;
  }

  expression += '^';
  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function applySquare() {
  if (!expression && lastResult !== null) {
    expression = String(lastResult);
  }

  if (!expression || /[+\-*/^(]$/.test(expression)) {
    return;
  }

  expression += '^2';
  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function applyReciprocal() {
  const source = expression || (lastResult !== null ? String(lastResult) : '');

  if (!source) {
    return;
  }

  expression = `1/(${source})`;
  lastExpression = '';
  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function toggleSign() {
  const source = expression || (lastResult !== null ? String(lastResult) : '');

  if (!source) {
    expression = '-';
  } else if (/^-\(.+\)$/.test(source)) {
    expression = source.slice(2, -1);
  } else {
    expression = `-(${source})`;
  }

  justCalculated = false;
  errorEl.textContent = '';
  updateDisplay();
}

function useLastResult() {
  if (lastResult === null) {
    return;
  }

  const token = lastResult < 0 ? `(${lastResult})` : String(lastResult);
  appendToken(token);
}

async function executeCalculation() {
  if (!expression) {
    return;
  }

  errorEl.textContent = '';

  try {
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expression,
        mode: angleMode
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al calcular');
    }

    lastExpression = expression;
    lastResult = data.result;
    expression = '';
    justCalculated = true;
    updateDisplay();
    await loadHistory();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadHistory() {
  try {
    const response = await fetch('/api/calculations?limit=20');
    const data = await response.json();

    historyEl.innerHTML = '';
    data.forEach((item) => {
      const li = document.createElement('li');
      const date = new Date(item.created_at).toLocaleString();
      li.textContent = `${formatExpression(item.expression)} = ${item.result} (${date})`;
      historyEl.appendChild(li);
    });
  } catch (error) {
    errorEl.textContent = 'No se pudo cargar el historial';
  }
}

keypad.addEventListener('click', async (event) => {
  const button = event.target.closest('button');

  if (!button) {
    return;
  }

  const action = button.dataset.action;

  if (action === 'number') {
    appendNumber(button.dataset.token);
  } else if (action === 'decimal') {
    appendDecimal();
  } else if (action === 'operator') {
    appendOperator(button.dataset.token);
  } else if (action === 'token' || action === 'function') {
    appendToken(button.dataset.token);
  } else if (action === 'clear') {
    clearExpression();
  } else if (action === 'delete') {
    deleteLastCharacter();
  } else if (action === 'square') {
    applySquare();
  } else if (action === 'power') {
    appendPower();
  } else if (action === 'reciprocal') {
    applyReciprocal();
  } else if (action === 'toggle-sign') {
    toggleSign();
  } else if (action === 'use-result') {
    useLastResult();
  } else if (action === 'equals') {
    await executeCalculation();
  }
});

angleModeButton.addEventListener('click', () => {
  angleMode = angleMode === 'deg' ? 'rad' : 'deg';
  updateDisplay();
});

updateDisplay();
loadHistory();
