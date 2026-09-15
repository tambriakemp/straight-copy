# Fix the agent chat error

## What the error is

The messages in Iris's chat that read `(clients ?? []).map is not a function` all date from **23–24 August**. They are old failures still sitting in the conversation history, not new ones — nothing has been sent to her since.

The bug behind them was in the shared social-media context code: it read a set of database results as if they were plain lists. That was corrected in the code on 4 September.

## What is likely still wrong

The corrected shared code has to be pushed live to every function that runs an agent. If any of them is still on the older copy, the same error comes back the moment someone chats with Iris.

Six functions share that code:

- agent-chat
- agent-run
- agents-api
- dispatch-agent-runs
- dispatch-social-schedule
- process-email-queue

## Plan

1. Push all six live together, along with the shared code they depend on. No code changes — the fix is already written.
2. Send one fresh message to Iris and confirm a real answer comes back instead of the error.
3. If the error still appears on that fresh message, read the function's own logs and report exactly what failed rather than guessing.

## Notes

- Deploying only some of them leaves the rest on mismatched shared code, which fails at boot rather than loudly, so all six go together.
- The old failed messages stay in the history; they are a record, not a live problem. Say the word if you want them cleared.
