# Expression Solver

Evaluates a mathematical or logical expression using the Fable ExpressionParser and stores the result in state.

## Settings

- **Expression** — The expression to evaluate. Can reference state values by address.
- **Destination** — State address to store the evaluation result.

## Outputs

- **Result** — The computed result as a string.

## Events

- **Complete** — Fires after evaluation.
- **Error** — Fires on parse or evaluation failure.

## Tips

Use Expression Solver for arithmetic calculations, string length checks, or combining multiple state values into a computed result. The expression language supports standard math operators, comparisons, and common functions.
