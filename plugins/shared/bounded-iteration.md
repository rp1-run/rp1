## Iteration Discipline

Single pass through the phase graph. Each phase runs once, and completed work is not revisited.

Ask the user **one** focused question when the request is genuinely ambiguous and proceeding under any interpretation risks wasted work. Use the answer and continue — do not open a dialogue or wait for feedback nobody offered.

Everything else runs to completion without checking in. On a blocking error, document it, output the error response, and stop instead of retrying.
