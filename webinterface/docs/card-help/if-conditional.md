# If Conditional

Evaluates a condition and branches execution to the True or False output. This is the primary decision-making card in a flow.

## Settings

- **DataAddress** — State address of the value to test.
- **CompareValue** — Value to compare against.
- **Operator** — Comparison operator: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `endsWith`. Default `==`.
- **Expression** — A full expression string. When set, DataAddress/CompareValue/Operator are ignored and the expression is evaluated directly.

## Outputs

- **Result** — Boolean result of the evaluation.

## Events

- **True** — Fires when the condition is true.
- **False** — Fires when the condition is false.

## Tips

Use Expression for complex conditions that combine multiple state values. For simple equality checks, DataAddress + CompareValue + Operator is more readable. The False output is positioned at the bottom of the card for visual clarity in flow diagrams.
