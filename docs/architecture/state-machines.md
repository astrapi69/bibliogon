# State machines (XState v5)

Status: adopted in `frontend/src/components/import-wizard/`.
Reference example: `wizardMachine.ts`.

## Why XState in Bibliogon

The import wizard outgrew ad-hoc `useState` once it had:

- Forking flows (single-book vs multi-book BGB).
- Async side effects per state (detect, execute, git clone).
- Guards (multi-book gating, retryable errors, mandatory fields).
- Recoverable errors with state preservation.

The previous `WizardState` discriminated-union + manual
`setState({ ... })` transitions is correct but readers cannot
see the state graph at a glance, and the "what triggers
detect?" question is answered by ten scattered `useEffect`s.

XState v5 fixes that with:

- A single `setup({...}).createMachine({...})` block that IS
  the state graph.
- Typed events; the compiler rejects invalid transitions.
- Pure guards + actions; tests run actor-level without React.
- Visualizer-ready (paste the machine definition into
  https://stately.ai/viz to see it).
- A standard pattern other complex flows in the app can copy.

## When to reach for a state machine

Use a state machine when ANY of these holds:

- Three or more states with multiple incoming transitions each.
- Async side effects gated by state (network calls, timers).
- Guards or invariants that must hold across transitions.
- A "reset" or "retry" event that has to scrub multiple
  context fields cleanly.
- Future flows likely to add a new branch (multi-book,
  conflict resolution, plugin activation).

For simpler UIs (a checkbox toggle, a one-shot modal, an
input with validation) plain `useState` is still right. State
machines are not free — the boilerplate cost is real.

## Pattern: machine in `machines/`, modal in `components/`

The wizardMachine is a pure data file with zero React imports.
It exports:

- `WizardContext` (typed context shape).
- `WizardEvent` (typed event union).
- `wizardMachine` (the configured machine).

Tests run `createActor(wizardMachine).start()` and dispatch
events directly — no DOM, no async, fast feedback.

The modal (`ImportWizardModal.tsx`) calls `useMachine(
wizardMachine)` and treats `state.value` as the render
discriminator. Async side effects live in a single `useEffect`
that subscribes to `state.value` and dispatches result events
(`DETECTION_COMPLETE`, `EXECUTE_FAILED`, ...) back into the
machine.

## Adding a new machine

1. Create `frontend/src/<feature>/machines/<name>Machine.ts`.
2. Define `<Name>Context` + `<Name>Event` types.
3. Use `setup({ types, guards, actions }).createMachine({ ... })`.
4. Initial state + states with transitions.
5. Co-locate `<name>Machine.test.ts`. Cover every transition
   plus every guard at the boundary.
6. Use `useMachine(<name>Machine)` in the React layer.

## DevTools

XState v5 DevTools work without configuration when running
in dev mode. Open the React DevTools, find the component using
`useMachine`, and the machine state appears in the inspector.

For the visualizer, paste the machine block (the literal
`setup(...).createMachine({...})` text) into
https://stately.ai/viz. No connection to the running app
needed.

## Anti-patterns to avoid

- **Storing transient async state in context.** Promises and
  AbortControllers belong in the React layer's effects, not
  in the machine.
- **Side effects in actions.** Actions only update context.
  Anything that touches the network or DOM happens in the
  React effect that watches `state.value`.
- **Using guards for business logic.** Guards answer "is this
  transition allowed?" Use actions for "what changes when it
  happens?"
- **A machine per component.** Reuse the same machine across
  any layout (modal, full page, sidebar) — the React layer
  decides how to render `state.value`.

## Reference

The canonical example is `import-wizard/machines/wizardMachine.ts`.
The 14 actor-level tests in `wizardMachine.test.ts` cover
every transition. Use them as the starting template for any
new state machine.
