# End

Termination point for the workflow. When execution reaches the End card, the operation completes.

## Events

- **In** — Receives the final event from the flow. Accepts up to 5 incoming connections.

## Tips

A flow can have multiple End cards to handle different completion paths (e.g. success vs error). The End card signals that execution is complete and the operation's results are ready. Place End cards at the right side of your flow diagram.
