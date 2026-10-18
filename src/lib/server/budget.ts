/** Caps provider calls for one search. Every attempt, including retries, spends one unit. */
export class CallBudget {
  private used = 0;
  private refused = 0;

  constructor(readonly max: number) {}

  tryConsume(): boolean {
    if (this.used >= this.max) {
      this.refused++;
      return false;
    }
    this.used++;
    return true;
  }

  get calls(): number {
    return this.used;
  }

  get exhausted(): boolean {
    return this.refused > 0;
  }
}
