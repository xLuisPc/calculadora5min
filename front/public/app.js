const keypad = document.getElementById('keypad');
const display = document.getElementById('display');
const operationEl = document.getElementById('operation');
const errorEl = document.getElementById('error');
const historyEl = document.getElementById('history');

let firstOperand = null;
let selectedOperator = null;
let currentInput = '0';
let waitingForSecondOperand = false;
let lastExpression = '';
let justCalculated = false;

function updateDisplay() {
  if (firstOperand !== null && selectedOperator) {
    const secondPart = waitingForSecondOperand ? '' : ` ${currentInput}`;
    display.value = `${firstOperand} ${selectedOperator}${secondPart}`;
  } else if (lastExpression) {
    display.value = lastExpression;
  } else {
    display.value = currentInput;
  }

  operationEl.innerHTML = '&nbsp;';
}

function resetCalculator() {
  firstOperand = null;
  selectedOperator = null;
  currentInput = '0';
  waitingForSecondOperand = false;
  lastExpression = '';
  justCalculated = false;
  updateDisplay();
}

function inputNumber(value) {
  if (justCalculated && firstOperand === null && !selectedOperator) {
    currentInput = value;
    justCalculated = false;
    lastExpression = '';
    return;
  }

  if (waitingForSecondOperand) {
    currentInput = value;
    waitingForSecondOperand = false;
    return;
  }

  if (currentInput === '0') {
    currentInput = value;
  } else {
    currentInput += value;
  }
}

function inputDecimal() {
  if (justCalculated && firstOperand === null && !selectedOperator) {
    currentInput = '0.';
    justCalculated = false;
    lastExpression = '';
    return;
  }

  if (waitingForSecondOperand) {
    currentInput = '0.';
    waitingForSecondOperand = false;
    return;
  }

  if (!currentInput.includes('.')) {
    currentInput += '.';
  }
}

function chooseOperator(operator) {
  justCalculated = false;

  if (firstOperand === null) {
    firstOperand = Number(currentInput);
  }

  selectedOperator = operator;
  waitingForSecondOperand = true;
}

async function executeCalculation() {
  if (firstOperand === null || !selectedOperator || waitingForSecondOperand) {
    return;
  }

  errorEl.textContent = '';

  const payload = {
    operand1: firstOperand,
    operand2: Number(currentInput),
    operator: selectedOperator
  };

  try {
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al calcular');
    }

    lastExpression = `${payload.operand1} ${payload.operator} ${payload.operand2} = ${data.result}`;
    currentInput = String(data.result);
    firstOperand = null;
    selectedOperator = null;
    waitingForSecondOperand = false;
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
      li.textContent = `${item.expression} = ${item.result} (${date})`;
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
    inputNumber(button.dataset.value);
  } else if (action === 'decimal') {
    inputDecimal();
  } else if (action === 'operator') {
    chooseOperator(button.dataset.operator);
  } else if (action === 'clear') {
    resetCalculator();
    errorEl.textContent = '';
  } else if (action === 'equals') {
    await executeCalculation();
  }

  updateDisplay();
});

updateDisplay();
loadHistory();
